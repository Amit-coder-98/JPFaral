# Client corrections — 21 October 2026

The frontend uses the attached rate card's exact 1–26 product sequence in the order checklist, product catalogue, bill display, product report and kitchen plan/export. Existing product names and historical prices remain unchanged. Products outside the approved card remain accessible after the approved list. The checklist shows the printed item numbers.

Orders now defaults to **Show full list**. **Orders on day** and **Today's orders** select a complete Indian calendar day; **All dates** removes the date filter. Optional 8/25/50-row pagination is available. Search, status, class/division and staff filters still apply; exports include the full filtered result. The dashboard's **View today's full list** opens that day's orders (the staff dashboard retains its personal staff filter). The Supabase adapter uses exact row counts and the actual batch length to continue beyond server row limits, including limits smaller than 500.

Payments defaults to **Daily summary**: payment day in IST, cash net, online net, gross receipts, refunds, net received and transaction count. **View list** opens every transaction for that day; the Transactions view has no hidden row limit. The date controls and Today shortcut use payment dates, independently of when orders were placed. Daily CSV includes every filtered day. Amounts are summed in integer paise. Live payments and deleted test history remain separate; refunds retain their original method and payment date.

## Revised price — production step required

`202610210001_nutritious_laddu_rate.sql` changes only the existing exact-name **पौष्टिक लाडू (तुपातील)** product to INR 700/kg, displayed and entered as **INR 175 per 250 g**. It checks for exactly one matching product and fails atomically if the name is absent or duplicated. Reapplying the same rate creates no additional writes or audits. Product availability, IDs, order item snapshots, payments, receipt allocation and RLS policies are unchanged. Existing confirmed items retain INR 600/kg (INR 150 per 250 g) where that was their saved price. Newly selected items use the current database price; a stale browser price is rejected by the existing save RPC.

The migration has **not** been applied to production by Codex. Frontend deployment alone does not change live product prices. After reviewing the migration, run:

```powershell
cd F:\Spanda\PWE\sweet_sell_management\backend
npm run supabase -- db push --linked --dry-run
npm run supabase -- db push --linked
```

The preview should list only `202610210001_nutritious_laddu_rate.sql`. After applying, click **Refresh records** (or reload), verify the product shows INR 175/250 g, and check an existing bill still shows its saved rate. Do not change previous applied migrations or reset production data.

Verification covers quarter-kg revised and historical amounts, migration replay without duplicate audit events or ledger changes, old-order edits retaining their snapshot, new orders at 175, stale price rejection, admin-only catalogue writes, all 26 product positions, 1,201 orders/items/payments behind a 100-row server cap, IST midnight payment boundaries, refunds and excluded test payments. Browser checks cover complete lists, date filtering, day reconciliation/export, collection checkout, receipt reuse/deletion, print and responsive layouts.

Passed locally: 73 backend tests, 136 frontend unit tests, 51 browser scenarios across verification runs, eight simulated Supabase-mode browser checks and the production build. Browser scenarios use synthetic fixtures and do not modify real orders. The linked production dry run confirms only the rate migration above is pending.
