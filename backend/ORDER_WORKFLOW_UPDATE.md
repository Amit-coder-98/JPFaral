# Order selection, collection checkout and student standings

The 16 October 2026 update preserves the existing UI and Marathi rate card. Products are selected from a searchable checkbox list. Only checked products have enabled quantity inputs and are saved. Quantities are entered in kg, in positive 0.25 kg increments; PostgreSQL remains authoritative for numeric totals and the existing 30-product limit.

Orders now follow Draft → Confirmed → Collected. Open a confirmed order and choose **Collect order**. The dialog displays the total, net payments already received and the remaining amount. Record the actual remaining payment as Cash or Online (UTR required), then confirm handover. Partial receipts remain available through **Record payment**; collection requires a zero remaining balance. Fully paid orders require handover confirmation without creating another payment.

**Missed an advance after saving?** Open the same order → **Edit order** → **Payment details** → **Add advance / payment**. Enter only the additional amount received, select Cash or Online (with UTR), and save. The same receipt opens with its updated received total and remaining balance. Earlier payment entries remain separate. If you also changed order details, **Save changes & add payment** saves those edits first; cancelling the payment does not undo those explicitly saved edits. This shortcut needs no database migration and avoids deleting/recreating an order to record a forgotten advance. The order-detail page's **Record payment** button remains available too.

`collect_order` saves the final receipt and collection atomically. Authorization is derived from Auth, never from browser actor fields. Version locks reject stale forms; request IDs make a matching retry safe; reused payment references or conflicting receipts roll back the whole transaction. Original advances, receipts, refunds, bill numbers and audit entries remain intact. The order detail page shows the separate payment transactions. Existing historical Ready snapshots remain stored unchanged and appear as Confirmed in current operational views; creating a new Ready transition is blocked.

Dashboard graphs are replaced by school-wide class/division totals and student sales standings. Counts include directory students, distinct participating students, confirmed orders, outstanding collections, collected orders, drafts, sales, payments received and outstanding money. Gifts are ranked by total non-draft, non-deleted sales value, as confirmed by the operator. Equal sales share a rank. Class summaries and rankings can be exported as CSV. Current directory divisions are used after student assignment repairs; historical order snapshots remain unchanged.

The Orders table has a separate **List no.** for active numbering within the current view. A later clarification replaces the original permanent printed-number policy: the operator wants deleted receipt numbers reused for new orders. Follow the additional [receipt-number migration and release instructions](RECEIPT_NUMBERING.md). Permanent UUIDs and internal references retain distinct historical identities; active customer receipts use available slots. Existing saved bills retain their numbers.

## Review and release

The operator applied `supabase/migrations/202610160001_collection_checkout.sql` on 16 October 2026. A read-only linked migration-history check confirms all eight versions through checkout are applied. The checkout frontend was published and its files matched the tested build. The additional receipt-number migration is pending and is covered separately above. Existing migrations must not be edited.

Verification passed: 62 backend tests, 119 frontend unit tests, the full 44-test browser suite, eight simulated Supabase browser checks and the production build. After moving **Collect order** into the page header for visibility, seven affected checkout/mobile browser checks and the production build passed again. Browser tests use local fixtures; the SQL tests use native local PostgreSQL.

To repeat the checks locally:

```powershell
cd F:\Spanda\PWE\sweet_sell_management\backend
npm test

cd F:\Spanda\PWE\sweet_sell_management\frontend
npm test
npm run build
$env:JPFARAL_E2E_PORT = "5177"
npm run test:e2e
npm run test:integration-browser
```

For another environment where the migration is pending, preview it without applying it:

```powershell
cd F:\Spanda\PWE\sweet_sell_management\backend
npm run supabase -- db push --linked --dry-run
```

After reviewing the SQL, apply pending migrations manually, then deploy the matching frontend. This application step is already complete for the current linked project:

```powershell
cd F:\Spanda\PWE\sweet_sell_management\backend
npm run supabase -- db push --linked
```

Coordinate the migration and frontend release: the old UI's Ready operation is retired by this migration, while the new checkout needs its new RPC. In Cloudflare, retain root directory `frontend`, the working production Supabase build values, build command `npm run build`, and the existing Worker deployment configuration. Publishing the frontend alone does not install a database migration.

After both releases, verify one advance-paid order, one fully prepaid order, Cash/Online handling, the preserved advance and final receipt, zero final balance, class totals and student ranking. Native PostgreSQL and browser fixtures validate the implementation locally; they do not establish hosted deployment or actual money received. This update sends no invitations and changes no production business records automatically.
