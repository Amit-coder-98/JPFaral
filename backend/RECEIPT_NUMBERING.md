# Reuse deleted receipt numbers

The operator clarified on 16 October 2026 that deleted receipt numbers should be available for new orders. This replaces the earlier choice to keep all printed receipt numbers permanently reserved.

The database assigns the lowest available positive receipt number among active orders, including drafts. For example, when JP-0001 through JP-0008 are active, deleting JP-0008 lets the next order use JP-0008. Deleting JP-0003 instead frees JP-0003. If no active orders remain, the next receipt is JP-0001. Other active receipts retain their saved numbers; a failed deletion frees nothing. Allocation is protected by a database transaction lock and a unique active-receipt index, so simultaneous saves cannot receive the same active number. Failed saves do not consume a customer receipt number.

Each order keeps its permanent UUID and original globally unique `order_number` as internal references. New customer receipt numbers are saved in `orders.receipt_number`. Existing rows retain their original display through a NULL fallback; no historical rows or ledger entries are backfilled or renumbered. Deleted bills remain marked as deleted, with their original customer, date, items, payments and receipt number. A later order can share that displayed number, but not its record identity. Payment and audit links use UUIDs, never an ambiguous receipt lookup. Payment history and exports distinguish archives and include order record IDs.

The frontend displays the customer receipt consistently in lists, order entry/editing, bills, payments, dashboards and exports. Active list positions and counts continue to exclude deleted records. No existing order, student, real payment or archived receipt is deleted automatically.

## Verification

72 backend tests and 121 frontend unit tests passed, along with eight simulated Supabase browser checks and the production build. The new PostgreSQL cases exercise empty-list restart, middle-number reuse, concurrent allocation/deletion, failed saves and deletions, idempotent save retries, legacy migration/replay, paid collected archives, immutable references and authorization. The HTTP contract test verifies reused display numbers map to separate UUIDs and audit links.

The full browser run covered 45 workflows. Two checks required isolated reruns: the new in-memory reuse test needed SPA navigation rather than resetting its fixture with a full page load, and another run collided with its trace directory. The remaining 43 checks passed. The corrected reuse/history check and the affected pagination check are verified separately with an isolated output directory.

## Review and apply

All eight earlier migrations are applied to the linked project. The new forward-only file is `supabase/migrations/202610160002_reusable_receipt_numbers.sql`. A linked dry run lists only this file. It has not been applied automatically. Previously applied migrations are unchanged.

Review the SQL, then preview:

```powershell
cd F:\Spanda\PWE\sweet_sell_management\backend
npm run supabase -- db push --linked --dry-run
```

After review, apply:

```powershell
npm run supabase -- db push --linked
npm run supabase -- migration list --linked
```

Publish the matching frontend after the migration is applied. A GitHub push to the connected `main` branch triggers Cloudflare's existing deployment. Until this migration and the matching frontend are released, the existing live numbering behavior remains in use. Check the exact commit's successful deployment and refresh the application afterward.

Existing active receipts, including JP-0008, retain their current number. New orders use the available slots; there is no automatic deletion or renumbering of current orders. Verify reuse using a deliberately created test order and the existing reviewed deletion flow. Keep the paid-test confirmation restricted to entries for which no real money was received.
