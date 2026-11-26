import { describe, expect, it } from "vitest";
import {
  updateOrderWithItems,
  type UpdateOrderPayload,
} from "./update-order-with-items";

interface RecordedOp {
  table: string;
  action: "select" | "insert" | "update" | "delete";
  payload?: any;
  filter?: { column: string; op: "eq" | "in"; value: any };
}

interface FakeOptions {
  oldItemIds?: string[];
  // Return an error object to make the matching operation fail.
  failWhen?: (op: RecordedOp) => { message: string } | undefined;
}

function createFakeSupabase(options: FakeOptions = {}) {
  const ops: RecordedOp[] = [];
  const oldItemIds = options.oldItemIds ?? ["old-1", "old-2"];
  let newItemCounter = 0;

  function from(table: string) {
    const op: RecordedOp = { table, action: "select" };
    let returning = false;
    let single = false;

    const execute = () => {
      ops.push(op);
      const error = options.failWhen?.(op);
      if (error) return { data: null, error };

      if (table === "order_items" && op.action === "select") {
        return { data: oldItemIds.map((id) => ({ id })), error: null };
      }
      if (table === "order_items" && op.action === "insert") {
        const rows = (op.payload as any[]).map(() => ({
          id: `new-${++newItemCounter}`,
        }));
        return { data: returning ? rows : null, error: null };
      }
      if (table === "orders" && op.action === "update") {
        const row = { id: op.filter?.value, ...op.payload };
        return { data: single ? row : [row], error: null };
      }
      return { data: null, error: null };
    };

    const builder: any = {
      select() {
        if (op.action === "select") op.action = "select";
        returning = true;
        return builder;
      },
      insert(payload: any) {
        op.action = "insert";
        op.payload = payload;
        return builder;
      },
      update(payload: any) {
        op.action = "update";
        op.payload = payload;
        return builder;
      },
      delete() {
        op.action = "delete";
        return builder;
      },
      eq(column: string, value: any) {
        op.filter = { column, op: "eq", value };
        return builder;
      },
      in(column: string, value: any[]) {
        op.filter = { column, op: "in", value };
        return builder;
      },
      single() {
        single = true;
        return builder;
      },
      then(resolve: any, reject: any) {
        return Promise.resolve(execute()).then(resolve, reject);
      },
    };
    return builder;
  }

  return {
    client: { from } as unknown as Parameters<typeof updateOrderWithItems>[0],
    ops,
    labels: () =>
      ops.map(
        (o) =>
          `${o.table}.${o.action}${o.filter ? `(${o.filter.column} ${o.filter.op} ${JSON.stringify(o.filter.value)})` : ""}`,
      ),
  };
}

function makePayload(
  overrides: Partial<UpdateOrderPayload> = {},
): UpdateOrderPayload {
  return {
    customer_id: "cust-1",
    customer_name: "Ana",
    customer_address_id: "addr-1",
    delivery_type: "delivery",
    delivery_fee: 1000,
    payment_method: "cash",
    source: null,
    commission_rate: null,
    discount_type: "none",
    discount_value: 0,
    discount_amount: 0,
    items: [
      {
        burger_id: "b1",
        burger_name: "Burger",
        quantity: 2,
        unit_price: 5000,
        subtotal: 10000,
        extras: [
          {
            extra_id: "e1",
            extra_name: "Bacon",
            quantity: 1,
            unit_price: 500,
            subtotal: 500,
          },
        ],
      },
      {
        burger_id: "b2",
        burger_name: "Other",
        quantity: 1,
        unit_price: 3000,
        subtotal: 3000,
        extras: [],
      },
    ],
    notes: null,
    ...overrides,
  };
}

const isOldDelete = (o: RecordedOp) =>
  o.action === "delete" &&
  JSON.stringify(o.filter?.value) === JSON.stringify(["old-1", "old-2"]);

describe("updateOrderWithItems", () => {
  it("happy path: inserts new rows, updates order, deletes old rows last", async () => {
    const fake = createFakeSupabase();
    const result = await updateOrderWithItems(fake.client, "order-1", makePayload());

    expect(fake.labels()).toEqual([
      'order_items.select(order_id eq "order-1")',
      "order_items.insert",
      "order_item_extras.insert",
      'orders.update(id eq "order-1")',
      // Single statement: order_item_extras cascades (ON DELETE CASCADE).
      'order_items.delete(id in ["old-1","old-2"])',
    ]);
    expect(result).toMatchObject({ id: "order-1" });

    // New extras point at the NEW item ids, the old delete never targets them.
    const extrasInsert = fake.ops.find(
      (o) => o.table === "order_item_extras" && o.action === "insert",
    )!;
    expect(extrasInsert.payload).toEqual([
      {
        order_item_id: "new-1",
        extra_id: "e1",
        extra_name: "Bacon",
        quantity: 1,
        unit_price: 500,
        subtotal: 500,
      },
    ]);
    const deletes = fake.ops.filter((o) => o.action === "delete");
    for (const d of deletes) {
      expect(d.filter?.value).not.toContain("new-1");
      expect(d.filter?.value).not.toContain("new-2");
    }
  });

  it("orders UPDATE fails: old rows are never deleted, new rows are removed, original error rethrown", async () => {
    const original = { message: 'invalid input syntax for type uuid: "optimistic-x"' };
    const fake = createFakeSupabase({
      failWhen: (o) => (o.table === "orders" && o.action === "update" ? original : undefined),
    });

    await expect(
      updateOrderWithItems(fake.client, "order-1", makePayload()),
    ).rejects.toBe(original);

    expect(fake.ops.some(isOldDelete)).toBe(false);
    const deletes = fake.ops.filter((o) => o.action === "delete");
    expect(deletes.map((d) => `${d.table}:${JSON.stringify(d.filter?.value)}`)).toEqual([
      'order_item_extras:["new-1","new-2"]',
      'order_items:["new-1","new-2"]',
    ]);
  });

  it("a failing compensation never masks the original error", async () => {
    const original = { message: "orders boom" };
    const fake = createFakeSupabase({
      failWhen: (o) => {
        if (o.table === "orders" && o.action === "update") return original;
        if (o.action === "delete") return { message: "cleanup boom" };
      },
    });

    await expect(
      updateOrderWithItems(fake.client, "order-1", makePayload()),
    ).rejects.toBe(original);
  });

  it("items INSERT fails: nothing is deleted and orders is never updated", async () => {
    const original = { message: "items boom" };
    const fake = createFakeSupabase({
      failWhen: (o) => (o.table === "order_items" && o.action === "insert" ? original : undefined),
    });

    await expect(
      updateOrderWithItems(fake.client, "order-1", makePayload()),
    ).rejects.toBe(original);

    expect(fake.ops.some((o) => o.action === "delete")).toBe(false);
    expect(fake.ops.some((o) => o.table === "orders")).toBe(false);
  });

  it("extras INSERT fails: new items are cleaned up, old intact, orders never updated", async () => {
    const original = { message: "extras boom" };
    const fake = createFakeSupabase({
      failWhen: (o) =>
        o.table === "order_item_extras" && o.action === "insert" ? original : undefined,
    });

    await expect(
      updateOrderWithItems(fake.client, "order-1", makePayload()),
    ).rejects.toBe(original);

    expect(fake.ops.some(isOldDelete)).toBe(false);
    expect(fake.ops.some((o) => o.table === "orders")).toBe(false);
    const deletes = fake.ops.filter((o) => o.action === "delete");
    expect(deletes.every((d) => JSON.stringify(d.filter?.value) === '["new-1","new-2"]')).toBe(true);
    expect(deletes.some((d) => d.table === "order_items")).toBe(true);
  });

  it("final old-delete fails: throws a descriptive error and deletes nothing else", async () => {
    const fake = createFakeSupabase({
      failWhen: (o) =>
        o.table === "order_items" && o.action === "delete" ? { message: "fk boom" } : undefined,
    });

    await expect(
      updateOrderWithItems(fake.client, "order-1", makePayload()),
    ).rejects.toThrow(/order was saved.*old items could not be removed/i);

    const deletes = fake.ops.filter((o) => o.action === "delete");
    // only the failed old items delete (extras cascade); no compensation of new rows
    expect(deletes).toHaveLength(1);
    expect(deletes.every(isOldDelete)).toBe(true);
  });

  it("computes totals: items + extras - discount + delivery + adjustment", async () => {
    const fake = createFakeSupabase();
    await updateOrderWithItems(
      fake.client,
      "order-1",
      makePayload({
        discount_type: "amount",
        discount_value: 1000,
        discount_amount: 1000,
        discount_percentage: 0,
        discount_fixed: 1000,
        price_adjustment: 200,
      }),
    );
    const update = fake.ops.find((o) => o.table === "orders")!;
    // 10000 + 500 + 3000 = 13500; -1000 + 1000 + 200 = 13700
    expect(update.payload.total_amount).toBe(13700);
    expect(update.payload.commission_amount).toBe(0);
    expect(update.payload).toMatchObject({
      discount_type: "amount",
      discount_value: 1000,
      discount_percentage: 0,
      discount_fixed: 1000,
      discount_amount: 1000,
      price_adjustment: 200,
      delivery_fee_pending: false,
      customer_address_id: "addr-1",
    });
    expect(typeof update.payload.updated_at).toBe("string");
  });

  it("freezes PedidosYa commission at the given rate over the final total", async () => {
    const fake = createFakeSupabase();
    await updateOrderWithItems(
      fake.client,
      "order-1",
      makePayload({ source: "pedidosya", commission_rate: 25, delivery_fee: 0 }),
    );
    const update = fake.ops.find((o) => o.table === "orders")!;
    expect(update.payload.total_amount).toBe(13500);
    expect(update.payload.commission_amount).toBe(3375);
    expect(update.payload.commission_rate).toBe(25);
    expect(update.payload.source).toBe("pedidosya");
  });

  it("order with zero old items: no old deletes are issued", async () => {
    const fake = createFakeSupabase({ oldItemIds: [] });
    await updateOrderWithItems(fake.client, "order-1", makePayload());

    expect(fake.ops.some((o) => o.action === "delete")).toBe(false);
    expect(fake.ops.some((o) => o.table === "orders" && o.action === "update")).toBe(true);
  });
});
