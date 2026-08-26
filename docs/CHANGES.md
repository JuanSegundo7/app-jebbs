# Changes summary

Snapshot of everything currently pending in the working tree, grouped by feature area. Written at the point this was first committed — treat as a point-in-time record, not living documentation.

## 1. Finanzas: supplies, expenses, recipes (`scripts/003`–`009`)

Cost-tracking module: a supplies catalog with stock quantity, burger recipes (bill of materials linking a burger to the supplies it consumes), one-off and recurring expenses, a daily debit/credit ledger, and PDF/Excel export. `/costos` and `/gastos` are now thin redirects into `/finanzas`, which hosts four tabs: Resumen, Gastos, Insumos, Recetas.

Key files: `app/(dashboard)/finanzas/page.tsx`, `components/costos/*`, `components/finanzas/*`, `components/shared/period-selector.tsx`, `lib/hooks/use-supplies.ts`, `lib/hooks/use-expenses.ts`, `lib/utils/costing.ts`, `lib/utils/expenses.ts`, `lib/utils/export-ledger.ts`.

## 2. Recipes for extras + meat/fries scaling + negative stock (`scripts/013`–`014`)

Extends the recipe system above so non-burger menu items (sides, drinks, fries) can have their own recipe (`extra_supplies`, mirroring `burger_supplies`). A recipe line can now be flagged as scaling with a burger's patty or fries count (`scales_with: 'meat' | 'fries'`), so a "doble" burger correctly costs more than a "simple" one instead of the same flat total. Manual stock entry (inline edit, create/edit dialog) no longer clamps to zero — negative stock is a legal, correctable state, and the reversal in `useDeleteExpense` no longer floors at zero either.

Key files: `scripts/013-extra-supplies.sql`, `scripts/014-burger-supply-scaling.sql`, `components/costos/recipe-table.tsx` (new — extracted, generic sortable table shared by burgers and extras), `edit-recipe-dialog.tsx` (generalized to burger-or-extra + scaling controls), `recipes-tab.tsx` (renders two tables), `supplies-tab.tsx`, `supply-form-dialog.tsx`, `supply-quantity-input.tsx`.

## 3. Onboarding guided tours

A `nextstepjs`-based tour system, wired app-wide, with tours for `/finanzas` and `/menu`. `/menu` also gained ingredient→supply linking (an ingredient typed in a burger's ingredient list can be matched against the supplies catalog).

Key files: `components/onboarding/*`, `app/(dashboard)/layout.tsx`, `app/(dashboard)/menu/page.tsx`.

## 4. Order source tracking (local vs. PedidosYa) (`scripts/010`–`012`)

`orders.source` (`'local' | 'pedidosya' | null`) plus a frozen `commission_amount`/`commission_rate` pair. The order wizard gained a Local/PedidosYa toggle on step 1: PedidosYa orders skip customer/address creation entirely and are forced to pickup. The commission % is configured in `/precios` and resolved once at order-creation time — never re-read live, so editing an old order can't silently rewrite its numbers.

Legacy orders (`source IS NULL`) were backfilled to `'local'`. `external_income` gained its own `source` column, backfilled by matching description text (pya/peya/pedidosya spelling variants) against historical lump-sum PedidosYa entries logged before this feature existed.

Key files: `scripts/010-order-source.sql`, `scripts/011-backfill-order-source.sql`, `scripts/012-external-income-source.sql`, `components/order-wizard/steps/customer-step.tsx`, `app/(dashboard)/precios/page.tsx`.

## 5. Revenue-by-source analytics

A new card in `/rendimiento` breaking revenue into Local / PedidosYa / Other, matching the existing payment-method breakdown's design. PedidosYa-tagged `external_income` rows fold into the `pedidosya` bucket instead of being dumped into "unknown" alongside every other kind of external income.

Key files: `components/analytics/source-breakdown.tsx`, `lib/hooks/orders/use-orders-history.ts`, `app/(dashboard)/rendimiento/page.tsx`.

## 6. Automatic stock deduction on order completion (`scripts/015`)

When an order reaches `status = 'completed'`, its recipe-resolved stock consumption (burgers, combo contents via the `customizations` JSON, standalone sides, attached extras — each scaled by that specific line's actual meat/fries count, not a default) is subtracted from `supplies.stock_quantity`. Canceling or reactivating a completed order reverses the deduction exactly. Idempotency and reversal both key off a dedicated ledger table (`order_stock_movements`) rather than the order's status field, so a status write can be retried or arrive twice without double-deducting.

Key files: `scripts/015-order-stock-movements.sql`, `lib/utils/stock-consumption.ts` (pure resolver), `lib/hooks/orders/use-order-stock.ts` (Supabase-facing apply/reverse), `lib/hooks/orders/use-orders.ts` (wired into the three mutations that can move an order into/out of `completed`).

## 7. PedidosYa order-experience fixes + manual price adjustment (`scripts/016`)

- A "PedidosYa" badge on order cards (board + mobile) and in `/historial`.
- The order summary step no longer shows the delivery-type radio or the "no address selected" warning for a PedidosYa order — both are meaningless for an order PedidosYa itself delivers — replaced with a fixed notice. Fixed a bug where the on-screen total (and the actually-saved total) silently included the shop's delivery fee for a PedidosYa order, because the underlying `deliveryType` state stayed `"delivery"` even though submission always forced pickup.
- PedidosYa orders no longer trigger the automatic kitchen-ticket print on creation/edit (manual reprint from `/historial` is unaffected).
- A new `price_adjustment` field: PedidosYa's own listed prices differ from the shop's menu, so staff can record that flat difference at order time. It feeds into both the saved total and PedidosYa's commission base (commission is computed off the final total), and shows as its own line in the summary, the order detail modal, and the WhatsApp message — the same places a discount already surfaces, so the total is never silently inflated.

Key files: `scripts/016-order-price-adjustment.sql`, `lib/utils/order-source.ts` (badge config), `components/orders/order-card.tsx`, `order-card-mobile.tsx`, `order-details-modal.tsx`, `components/order-wizard/hooks/use-order-settings.ts`, `use-order-wizard.ts`, `order-wizard-drawer.tsx`, `steps/summary-step.tsx`, `services/order-price-calculator.ts`, `lib/hooks/orders/use-create-order.ts`, `use-update-order.ts`, `services/order-data-loader.ts`, `lib/utils/formatOrderWhatsapp.ts`.

## 8. Chart palette + dependencies

Categorical chart colors (`--chart-1..5`) revalidated for color-vision-deficiency/contrast. Added `exceljs`, `jspdf`, `jspdf-autotable`, `nextstepjs`, `motion`.

Key files: `app/globals.css`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`.

---

## Known follow-ups (not done)

- Editing an already-`completed` order's `source` has no UI path — the toggle is create-only and the edit board only lists `new`/`ready` orders.
- `useCompleteOrder` in `lib/hooks/orders/use-orders.ts` is dead code (zero call sites) and does not deduct stock — flagged in a comment, not deleted, since deleting it isn't a stock change and shouldn't ride along in an unrelated diff.
- A few stray `console.log` debug lines remain (`order-price-calculator.ts`'s SUBTOTAL/DISCOUNT/DELIVERY FEE/TOTAL FINAL, `order-details-modal.tsx`, `order-card.tsx`) — left as-is, not part of any change in this pass.

## Pending migrations

All of `scripts/010` through `scripts/016` (and `003`–`009`, if not already applied) need to be run against Supabase in order, each with its own pre-flight checks documented at the top of the file.
