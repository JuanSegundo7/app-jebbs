# Porting cost/stock/external-channel logic to dishflow

## Why this doc exists, and why it isn't a diff

`jebbs-dashboard` and `dishflow` share ancestry (`d32f30c` in dishflow: *"initial gastro-dashboard template from jebbs base"*), but dishflow has since generalized its product model — `010-generic-products.sql`, `020-order-items-variant-selections.sql`, `030-order-items-cutover.sql` replace jebbs' hardcoded `burgers`/`combos`/`extras` + `order_items.burger_id/combo_id/extra_id` + a `customizations` JSON shaped around `meatCount`/`friesQuantity`. Dishflow also has its own vertical-adapter system (`docs/cloning-a-new-vertical.md`, the `sushi` vertical work).

Everything below happened in jebbs-dashboard against the burger-specific schema. **Do not port it as code.** Port the *problem → decision → why* for each piece, then re-derive the implementation against dishflow's actual current `generic-products`/`variant-selections` tables — read those (and `cloning-a-new-vertical.md`) before writing anything. Where jebbs' concrete shape is given below, it's there so you know what to look for the equivalent of in dishflow, not to copy.

---

## 1. Recipes for every sellable product, not just the "main" one

**Problem:** jebbs' recipe/BOM table (`burger_supplies`) only accepted a burger id — a side, drink, or add-on had no way to declare what it consumed, so it had zero real cost and could never feed a stock deduction.

**Decision:** add a second, structurally identical recipe table scoped to the other product type (`extra_supplies`), plus a shared `RecipeLineWithDetails` shape and a `useRecipeEditor({kind, id})` facade so the recipe-editing UI didn't need to branch everywhere.

**For dishflow:** you likely don't need two tables at all. If "product" is already one generic entity (not burger-vs-extra), one recipe table (`product_supplies` or similar, `product_id` FK) probably covers every sellable thing already. This is a case where dishflow's own generalization makes the job *easier* than it was in jebbs — check whether such a table already exists before adding one.

**Gotcha:** cost/margin/"alcanza para N" displays need to invalidate together — editing a supply's `cost_per_unit` has to refresh every recipe that uses it, not just the primary product type's cache.

---

## 2. A recipe line that scales with a per-order configuration choice

**Problem:** a recipe was a flat list — a burger sold "doble" (2 patties) cost/consumed identically to "simple" (1 patty), because nothing connected a recipe line to the customer's actual selection at order time.

**Decision:** a recipe line can be flagged as scaling with one configuration knob (`scales_with: 'meat' | 'fries'`). When flagged, the stored `quantity` means "amount **per unit of that knob**" (per patty, per fries portion) — not an already-multiplied total. The effective amount = `quantity × <that knob's count>`, resolved by a small pure helper (`resolveRecipeQuantities`) called once before any cost math, so the cost functions themselves never need to know about scaling.

**Why per-unit, not per-config-total:** it's the only encoding that stays correct if the product's default configuration changes later, and the only one a stock-deduction feature can reuse directly against an *order's own* actual selection instead of the product's default.

**For dishflow:** the "configuration knob" concept generalizes to *whichever selected variant option carries a quantity* (dishflow's `variant-selections` — you'll need to read that schema to know what "quantity of a selection" looks like there). The transferable part is the per-unit storage convention and the "resolve once, up front" pattern — not the literal `meat`/`fries` enum.

**Real gotcha we hit, worth avoiding:** the UI's editable quantity field must always read/write the *base* (per-unit) quantity, never the resolved/effective one — otherwise saving after viewing the effective number silently re-multiplies it every time. Also: flipping a line between "fixed" and "scaled" (either direction) needs a conversion prefill (`quantity / factor` or `quantity × factor`, offered as an editable suggestion, never auto-applied) — we initially only protected one direction of that flip and had to add the other after review.

---

## 3. Stock can go negative, on purpose

**Problem:** four separate `Math.max(0, …)` clamps (an inline stock-edit field, the create/edit dialog, and a stock-reversal calculation) silently floored any correction at zero. There is no DB `CHECK` preventing negative values in either project's lineage — the clamp was pure, accidental UI behavior, not a deliberate constraint.

**Decision:** remove all of them. A stocktake correction, or a sale that outran what was logged as purchased, is a legitimate negative value — it's information ("you're short N units"), not an error state.

**Real gotcha:** removing the JS-level clamp isn't enough if the `<input>` still has `min="0"` — inside a real `<form>`, the browser's native constraint validation blocks submission of a negative value even though your handler would accept it. Both have to go together.

**For dishflow:** almost certainly a direct, low-risk port — this logic is not product-type-specific at all. Just verify dishflow's own stock-entry UI for the same clamp pattern.

---

## 4. Automatic stock deduction when an order completes

**Problem:** stock was 100% manual (restock a purchase, or an expense linked to a supply bumps it). Selling something never moved it.

**The hard part, and the actual transferable method:** enumerate *every physical shape a sold line can take* on an order, and for each, resolve which recipe(s) apply and by what multiplier. In jebbs that was: a direct product line; a product bundled inside a combo/set (read from a JSON blob describing what was actually selected inside it); a standalone side sold as its own line; an extra/topping attached to any of the above (which, in jebbs, is priced by its **own** quantity, never multiplied by the parent line's quantity — verify the equivalent invariant in dishflow, don't assume it carries over blindly).

**In dishflow's terms:** you'll need to walk `order_items` + whatever `variant-selections` actually stores per line, and figure out the modern equivalent of "a bundle's contents are described somewhere separate from the line itself" (in jebbs it was a JSON column; dishflow's `020`/`030` migrations suggest this may now be normalized into real rows — if so, this whole "parse JSON defensively" section may not even apply to you, which would be a simplification, not a loss).

**Idempotency — this part IS directly transferable, schema-agnostic:** deduction is driven by a dedicated ledger table (`order_stock_movements`: `order_id`, `supply_id`, `quantity` — always positive, meaning "amount subtracted"), not by the order's status field. Before deducting, check which supplies already have a ledger row for this order and skip only those — this makes a retried or duplicated "mark completed" write a safe no-op *per supply*, not an all-or-nothing gate. Reversal reads the ledger for that order, adds every recorded quantity back, and deletes the rows.

**Ordering matters for crash-safety, and this generalizes too:** decrement stock *then* write the ledger row (never the reverse) — if the process dies in between, a retry re-decrements that one supply (an over-deduction, self-correcting on the very next retry since the ledger now blocks it) rather than the alternative failure (a ledger row claiming a deduction that never happened, which would *inflate* stock on reversal). Reversal mirrors this: delete the ledger row *then* add stock back. Both directions are deliberately biased toward "stock reads lower than truth" as the safe failure mode, never higher.

**No RPC, no DB transaction** — this was a deliberate choice matching the codebase's existing convention (every stock write anywhere is a plain client-side read-then-write, no Postgres functions anywhere in the project). If dishflow has since introduced RPCs for anything, this would be a good candidate to reconsider doing properly-atomically instead of copying the constraint.

---

## 5. Order source (local vs. an external ordering channel) + frozen commission

**Problem:** no way to tag which channel an order came from, or to charge a commission for channels that take one.

**Decision:** `orders.source` (nullable — `NULL` means "unknown/legacy", never silently treated as the default channel) plus a **frozen** `commission_amount`/`commission_rate` pair, resolved once at order-creation time from a configured percentage and never re-read live afterward. This is the important part to keep: if the configured commission % changes later, every already-placed order must keep showing the rate it actually had, not the current one. The same freezing pattern already existed in this codebase for discounts (`discount_type/value/amount` are computed once and stored, not recomputed on read) — commission just follows the same convention.

**Channel-specific UX gates, generalized:** several UI sections only make sense for the shop's own local flow (address entry, an internally-triggered delivery type, an auto-printed kitchen ticket) and are actively *wrong* to show for an order placed through an external channel that handles its own fulfillment. The pattern: derive one `effectiveX` value per such concern from the order's source, computed in exactly one place, and use that derived value *everywhere* it's displayed or persisted — not just at final submission. We shipped a real bug where the submitted total correctly zeroed out a local-delivery fee for an external-channel order, but the *on-screen* total during editing still added it, because the display math read the raw (never-reset) form field instead of the same derived value the submit path used.

---

## 6. Revenue-by-source analytics

**Decision:** a breakdown card splitting revenue by source, mirroring an existing payment-method breakdown card's shape. The one non-obvious trick: manually-logged "external income" entries (money that came in outside the normal order flow) need their *own* source tag so the ones belonging to the external channel can be folded into that channel's bucket — otherwise every such entry dumps into "unknown," which both undercounts the channel and overcounts "unknown."

---

## 7. Manual price adjustment for platform markup

**Problem:** an external channel's own listed prices can differ from the shop's menu prices (the platform's own markup). There was no way to record that difference, so an order's total always priced the sale using the shop's internal menu.

**Decision we explicitly rejected, and why:** modeling this as a negative discount. The existing discount math zeroes any value `≤ 0`, and — more importantly — *every* place a discount is displayed (order summary, a customer-facing message, an order-detail view) is gated on `discount_amount > 0`. A negative discount would inflate the total in total silence, with no line anywhere explaining why. If dishflow has an equivalent discount mechanism, check whether it has the same display-gating before even considering the negative-value shortcut.

**What we built instead:** a dedicated flat `price_adjustment` field, entered once per order, added into the total *before* the commission calculation reads that total (so the platform's commission is correctly charged on the price it actually charged, not the shop's internal menu price) — and displayed as its own line everywhere a discount already shows, so the total is never silently different from what the line items add up to.

---

## Cross-cutting conventions worth carrying over as-is

- **No DB `CHECK` constraints anywhere in this schema lineage** — every new column/table's migration comment says so explicitly, and validates shape/range in the UI/TS layer instead. Keep doing this in dishflow unless you have a specific reason to diverge.
- **Every migration script is defensive**: a WHY comment, pre-flight `information_schema`/`pg_tables` checks written as SQL comments for a human to run separately first, wrapped in `BEGIN`/`COMMIT`, `ADD COLUMN` never `ADD COLUMN IF NOT EXISTS` (so a pre-existing column of the wrong type fails loudly instead of silently matching), and a documented undo with a real caveat, not boilerplate. Match this style for any new migration.
- **Supabase's single-object `.upsert()` only writes the columns present in the payload.** If a field's absence is meant to mean "leave unchanged" that's fine implicitly — but if the intent is ever "clear this back to null/default," it must be passed explicitly. We had to be deliberate about this for the recipe-scaling flag specifically.
- **A JSX `{/* comment */}` is not valid between a component's prop attributes** — only as element children. Use a `//` line comment there instead if you need to explain a prop inline; this actually broke a build once during this work.
- **Operator-precedence gotcha found and fixed along the way, worth grepping for in dishflow too:** `x ?? 0 > 0` parses as `x ?? (0 > 0)`, not `(x ?? 0) > 0` — `??` binds looser than `>`. It "worked" only because `0` is falsy. Search dishflow for the same pattern.

## Suggested order if/when this gets implemented in dishflow

1. Recipes for every product type (§1) — foundational, low risk, likely simpler in dishflow than it was here.
2. Negative stock (§3) — independent, small, no schema dependency on anything else here.
3. Configuration-scaled recipe lines (§2) — needs dishflow's variant-selection shape understood first.
4. Order source + frozen commission + channel UX gates (§5) — foundational for §6/§7.
5. Revenue-by-source analytics (§6).
6. Price adjustment (§7) — depends on §5's commission plumbing.
7. Automatic stock deduction (§4) — do this last; it depends on §1 and §3 being in place, and is the piece most likely to need real redesign against dishflow's order-line schema rather than a mechanical port.
