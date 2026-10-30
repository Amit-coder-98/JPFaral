# JPfaral Supabase backend

**16 October 2026 update:** checkbox products, kg quantities, collection checkout and student standings were released. The operator also applied `202610160002_reusable_receipt_numbers.sql`; a read-only linked migration-history check confirms all nine migrations are applied. See [reuse of deleted receipt numbers](RECEIPT_NUMBERING.md) for the numbering rule and frontend release verification.

The backend is PostgreSQL migrations, protected database functions, RLS policies, and a Supabase Edge Function. There is no separate Express server. The frontend and backend have independent packages; run npm commands inside the corresponding folder.

**Historical status (14 October 2026):** the linked project has all six migrations through `202610140002_collected_order_deletion.sql` applied, verified against remote migration history and the live deletion function. The new `202610140003_test_order_cleanup.sql` has **not been applied**. The remaining test order JP-0001 is Collected with ₹1,320 recorded as received; the user confirmed no real money was received. That payment balance caused the deletion block and disabled selection. All 521 imported students have been checked against the source report and the user-confirmed mappings. Exactly 44 incorrect eighth-standard B assignments were corrected; both eighth-standard divisions now have 44 students. See the [full student audit](STUDENT_DATA_AUDIT.md). This does not verify hosted email delivery or deployment of the frontend/Edge Function.

## Files

- `supabase/migrations/202610110001_schema.sql`: normalized tables, constraints, database bill sequence, immutable audit triggers, fail-closed Auth profile trigger, reference divisions, and RLS/grants.
- `supabase/migrations/202610110002_operations.sql`: transactional order saves, status transitions, separate receipts/refunds, atomic reviewed imports, restricted profile/preferences, organization and administrator operations.
- `supabase/migrations/202610130001_marathi_rate_card.sql`: forward-only, replay-safe quarter-kg constraint/RPC upgrade and exact 26-product Marathi catalogue seed.
- `supabase/migrations/202610130002_student_report_import.sql`: optional real student phones, NULL-safe duplicate protection, and transactional import/retry support.
- `supabase/migrations/202610140001_order_deletion.sql`: reviewed administrator single/bulk deletion, retained history, guarded financial functions, immutable retry requests and deletion audits.
- `supabase/migrations/202610140002_collected_order_deletion.sql`: explicit Super Admin confirmation for collected test/mistaken orders, with audited override and unchanged payment/history protection.
- `supabase/migrations/202610140003_test_order_cleanup.sql`: explicitly confirmed Super Admin cleanup of paid/collected test entries, retained immutable ledger, and audited test classification.
- `supabase/functions/manage-staff/index.ts`: Edge entry point and server environment configuration.
- `supabase/functions/_shared/manageStaff.ts`: verified caller authorization, direct password-based account creation, profile provisioning/compensation, and protected account updates.
- `supabase/config.toml`: local services, disabled registration, password rules, and JWT verification for the function.
- `tests/database.test.mjs`: actual migrations on a disposable native PostgreSQL 17 cluster with an Auth identity test shim.
- `tests/staff-security.test.mjs`: server authorization, both creation roles, credential validation, duplicate protection and provisioning compensation tests.

## Review and enable order deletion

The Orders list provides a trash button for one order and checkboxes for multiple orders. All active orders, including paid/collected orders, can be selected for review. **Delete selected** appears after selecting a row. The header checkbox selects the current page; selections can continue across pages, up to 100 orders per request. Changing filters clears the selection. The confirmation lists the exact orders, statuses and recorded payment balances and requires a reason of 3 to 500 characters. Cancel makes no change. Selection does not bypass database checks.

Only an active Super Admin can delete. Ordinary deletion requires net receipts of zero; collected mistaken entries additionally need acknowledgement. For a real paid order, record an actual refund through **Record payment → Refund** before deletion. For entries created solely for testing, enter a reason and check **These are test entries only; no real money was received.** This explicit test confirmation allows paid and collected test orders to be archived together. It never adds a fictitious refund or edits/deletes existing payment records. Do not classify an order with real receipts as test data.

Deletion retains the order, historical items, bill number, original totals, receipts/refunds and prior audit events. It records the actor, time and reason and emits a database-generated **Deleted** event. The frontend separates deleted orders from active lists, student order counts, dashboard totals, collection notifications, reports and order exports. Administrators can follow deletion audit/payment links to a clearly marked, read-only historical bill; no remaining amount is collectible on the deleted order. Explicitly archived test payments are excluded from **Live payments** and its CSV; administrators can inspect and export them through **Payments → Payment records → Test history**. Real historical receipts/refunds remain in the live ledger. Test bills identify recorded amounts as test payments. Staff cannot read archived headers/items. No bill number is reused.

`delete_orders(p_orders jsonb,p_reason text,p_request_id uuid,p_allow_collected boolean default false,p_test_cleanup boolean default false)` validates distinct IDs/current versions, locks headers in stable order, and checks payments with NUMERIC arithmetic. Bulk requests commit together or roll back completely. Concurrent edits/payments/collection prevent stale deletion. An identical retry, including reordered targets, produces no extra event; changed payloads or confirmation choices cannot reuse a request ID. NULL/omitted confirmations mean false. Immutable retry metadata retains both choices; test archives record `deletion_test_data=true` in the header and database audit. Original status and bill/items/payments are retained. Old three/four-argument clients keep default real-payment protection, and the old overload is dropped to avoid PostgREST ambiguity. Ordinary frontend deletion omits the new flag so it also remains compatible before this migration. Archived headers/items cannot be changed, and save/payment/status RPCs reject them, including old creation retries. Financial implementations and public financial signatures, direct-write restrictions, payment immutability and audit protections remain intact.

Review [the new migration](supabase/migrations/202610140003_test_order_cleanup.sql), then run these commands from PowerShell:

```powershell
cd F:\Spanda\PWE\sweet_sell_management\backend
npm run supabase -- db push --linked --dry-run
```

The dry run should list only `202610140003_test_order_cleanup.sql` on this linked project. After checking the project and reviewing the SQL:

```powershell
npm run supabase -- db push --linked
```

Refresh JPfaral after the migration succeeds. As Super Admin, select JP-0001, click **Delete selected**, enter the testing reason, check **These are test entries only; no real money was received.**, then **Confirm delete**. Until the new migration is applied, test cleanup reports the missing migration clearly. No existing live order was deleted during implementation; no production migration was applied automatically. Both prior deletion migrations were applied by the operator and verified before preparing this follow-up. The migration reloads the PostgREST schema after commit. Keep applied migrations immutable; do not replay older financial/deletion migrations over the new guarded functions on the linked project.

## Import the school student report

The supplied `DynamicReport.xls` has three title rows, headers on row 4 and 521 student rows. It contains `पूर्ण नाव`, `Class`, and `Division`, with no phone-number column. The application now detects that header, preserves source row numbers in errors, and lets you choose a worksheet or override its header row.

The user confirmed that student phones may be absent; a real ten-digit **customer** phone is still required on every confirmed order. Missing student phones are stored as NULL, never invented. Provided phones must still contain ten digits. Exact identity duplicates are protected even when phones are absent, and a missing phone cannot be used to duplicate an existing same-name/class record with contact data. Existing phones and students are never overwritten by import.

The linked project already has the optional-phone migration applied and its 521 students imported. For another project that still needs the migration, first review pending migrations from `backend`:

```powershell
npm run supabase -- db push --linked --dry-run
```

Confirm the pending files and target project. The current linked project has no pending migration for this division repair. For a project with unapplied migrations, after review:

```powershell
npm run supabase -- db push --linked
```

For a new directory, sign in as Super Admin, open **Students → Import students**, and select the original XLS. The mappings should be **Student name → पूर्ण नाव**, **Standard → Class**, **Division → Division**, and **Phone → No phone column**. **Match report divisions** shows every source group and its student count, including both 8th A and B. Explicit named values are matched, including the report's `Rani Laxmi` spelling for `Rani Laxmibai`; bare A/B codes need the confirmed named choices from the [audit table](STUDENT_DATA_AUDIT.md). Different source codes cannot be combined into one named division. Import remains disabled until all rows validate. The original file is unchanged; birthdays and unused report columns are not sent to Supabase. **Do not reimport the existing 521 students**; refresh and inspect the directory instead.

The migration retains RLS, audit triggers, customer/order constraints and append-only receipts. Reapplying it does not change student values. Apply it before attempting a phoneless import on an older schema. The latest repair updated 44 existing division assignments without inserting or deleting students, changing IDs, or rewriting order/payment history.

## Review and apply the Marathi rate-card upgrade

Previously applied migrations remain unchanged. The new file is `supabase/migrations/202610130001_marathi_rate_card.sql`.

The migration retains `products.price_per_kg` and historical `order_items.price_per_kg`. It replaces the old half-kg/100 kg check with positive 0.25 kg increments up to 9,999.75 kg, the existing `numeric(6,2)` capacity. It replaces `save_order` with the same transactional/authorization/snapshot behavior plus quarter-kg validation. The generated NUMERIC line-total expression, ledger, RLS and audit triggers are retained.

Catalogue seeding locks catalogue writes, matches exact supplied names, reuses existing IDs and preserves availability choices. It updates current rates/categories where needed, without updating any order or receipt. Missing names receive deterministic IDs. Replays do not create duplicate products or audit events when the desired catalogue is already present. Ambiguous existing exact-name duplicates abort the migration for review; no rows are merged or deleted. Replaying later intentionally restores the printed rates; future price changes belong in a new reviewed migration or the administrator UI.

From the repository root:

```powershell
cd backend
npm run supabase -- migration list
npm run supabase -- db push --linked --dry-run
```

For a project with only the two base migrations, dry run lists `202610130001` for the rate card and the newer student-import migration. This linked project already has all four migrations applied. Review the SQL and project selection before applying any pending files. Dry run lists pending migrations; it does not execute or validate their SQL. Local PostgreSQL tests validate the migrations and pre-existing snapshots.

After review, the operator can apply it with:

```powershell
npm run supabase -- db push --linked
```

Deploy the matching frontend after the migration succeeds. Before applying, the old backend still rejects quarter-kilogram quantities. Do not reset the linked project or repair its migration history to force the upgrade. After applying, review the 26 rates and test 0.25, 0.75, 10 and 100.25 kg orders, old bills, subsequent payments, and staff restrictions in staging/production. [CLI migration guidance](https://supabase.com/docs/guides/local-development/cli-workflows).

## 1. Create a dedicated Supabase project

Create an account at https://supabase.com and a new project for JPfaral. Use a separate project for staging. Keep its database password, personal access token, and privileged keys in your password manager/server environment.

In Authentication settings:

1. Disable new user signups and anonymous sign-ins. Keep email/password authentication; disable unused providers.
2. Set Site URL to `http://127.0.0.1:5173` for initial development, then the production HTTPS origin.
3. Allow the exact `/auth/setup` URL for invitations and password recovery on each intended origin. Avoid broad wildcard redirects in production.
4. Enable email confirmation and secure email changes, require at least twelve-character passwords, and enable secure password change.
5. Configure custom SMTP and a verified sending domain for password recovery and email changes. Direct administrator-created accounts do not require invitation delivery. Disable provider link rewriting/tracking for one-use Auth links.

Reference: [Auth settings](https://supabase.com/docs/guides/auth/general-configuration), [SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls). Local `config.toml` does not automatically update all hosted dashboard Auth settings.

## 2. Apply migrations to the intended empty project

From the project directory:

```powershell
cd backend
npm ci
npm run supabase -- login
npm run supabase -- link --project-ref YOUR_PROJECT_REF
npm run supabase -- migration list
npm run supabase -- db push --dry-run
```

Check that the linked project is the dedicated JPfaral project and review both migration files. Then apply them:

```powershell
npm run supabase -- db push
```

The two October 11 base migrations create tables/functions and initialize divisions and organization defaults. The October 13 upgrade also seeds the 26 client-approved Marathi products with four times each printed 250g rate. No fictional students/orders are imported. Do not run the base migrations blindly against an existing application schema. Do not use `db reset` against a hosted project. Keep applied migrations immutable; add a new numbered migration for later changes. Reference: [migration workflow](https://supabase.com/docs/guides/deployment/database-migrations).

## 3. Bootstrap the first Super Admin

In the project's Authentication → Users screen, create your real administrator with a unique password or use a delivered invitation. Copy its **Auth user UUID**. The Auth trigger creates an inactive `staff` profile and ignores role/activation supplied in user metadata.

As the project owner, run this one-time statement in the Supabase SQL editor, replacing the placeholder UUID with that user's UUID:

```sql
update public.profiles
set full_name = 'Your administrator name', role = 'super_admin', active = true
where id = 'REPLACE_WITH_REAL_AUTH_USER_UUID'::uuid;

select id, full_name, role, active from public.profiles
where id = 'REPLACE_WITH_REAL_AUTH_USER_UUID'::uuid;
```

Verify that exactly the intended account was activated. Do not add a bootstrap endpoint, hardcoded administrator password, or privileged key to the frontend. Configure the frontend as described in [its README](../frontend/README.md), then sign in.

## 4. Deploy protected staff management

Create a local ignored `supabase/functions/.env.local` by copying `.env.example`. Set only:

```dotenv
APP_ORIGIN=http://127.0.0.1:5173
```

For deployment use the exact production HTTPS origin instead. Each environment has one permitted frontend origin. Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` inside Edge Functions; those privileged values are never Vite configuration.

```powershell
npm run supabase -- secrets set --env-file supabase/functions/.env.local
npm run supabase -- functions deploy manage-staff
```

Keep `verify_jwt = true`. The handler also calls Auth `getUser` to verify the bearer token and reads the caller's current active `super_admin` profile before creating a privileged client. A verified administrator can directly create an active **Data Entry Staff** or **Admin** account. They cannot deactivate or demote their own administrator account through profile updates.

From **Staff Management → Create user**, enter User name, Email address, Password, Confirm password and User type, then create the account. The email is the login username. The backend independently checks password length (at least 12 characters, at most 72 UTF-8 bytes), matching confirmation and the allowed role. Auth creates an email-confirmed identity; the caller's checked `admin_update_profile` RPC assigns its role and activation with database-generated audit. No password enters the profile table or the audit payload. Duplicate emails cannot reset an existing account. A failed provisioning operation attempts to remove only the newly created Auth identity; cleanup failures are reported for review. No invitation email is sent, and the old invitation operation is retired. Email changes and recovery retain their existing secure flows.

Historical local setup used two private invitation links. That workflow is superseded by direct account creation; do not use expired local setup links for new users. For the live application, set the origin explicitly rather than uploading the localhost development environment:

```powershell
npm run supabase -- secrets set APP_ORIGIN=https://jpfaral.prabodhanwe.in --project-ref sbytydizvarzrfsurgeo
npm run supabase -- functions deploy manage-staff --project-ref sbytydizvarzrfsurgeo --use-api
```

The production-origin correction was verified on 30 October 2026: the live origin's preflight returns 204, localhost is rejected, and an authenticated staff member receives 403 for account management. The nine owner-requested staff logins were verified separately. Credentials remain in ignored, access-restricted local files and are never part of the deployment. No browser grants, RLS policies or database migrations are changed by this account-creation update.

Reference: [function deployment](https://supabase.com/docs/guides/functions/deploy), [Auth headers](https://supabase.com/docs/guides/functions/auth-headers), [Admin account creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

## Database behavior and permissions

Every public business table has RLS. Anonymous callers have no business grants. Active staff can read shared students/catalog/order/payment history and work through checked order/payment/collection functions. Only administrators manage catalog, organization, student imports and staff. Financial tables, students, profiles and audit logs have no direct client write grants. Detailed audit reads are administrator-only; `my_activity` exposes only the caller's limited summary.

Amounts use `numeric`, authoritative generated line totals, and quarter-kilogram quantity constraints. Orders contain up to thirty distinct products and preserve item names/prices. The original database sequence keeps globally unique internal references, including after deletion or rollback. After the receipt-reuse migration, customer-facing receipt numbers use the lowest available active slot under a transaction lock; deleted numbers can be reused without modifying their historical records. Optimistic versions prevent silent stale edits. New order/advance writes are atomic; overpayments, malformed quantities, stale catalog prices, and invalid collection transitions roll back.

Order entry uses a searchable product checklist. Only checked products have enabled quantity inputs and are submitted to the protected `save_order`. Quantities are entered directly in kg, in positive 0.25 kg increments, with no unit selector. The database independently validates quantities and computes authoritative financial totals. Stored item snapshots, bills, reports and exports remain in kg.

Payments are append-only receipts/refunds with unique retry identifiers. Online receipts require a UTR; duplicate online receipt references are blocked. Cash references are empty. Receipt/refund changes lock the order so concurrent requests cannot overpay. Net receipts determine balances; refunds require an administrator. After applying the collection checkout migration, `collect_order` records the exact remaining receipt and collection atomically; fully prepaid orders create no extra receipt. New collection requires full payment. Historical collected snapshots are preserved, including any earlier unpaid collections. Existing Ready records display as Confirmed; new Ready transitions are blocked. See the [release steps](ORDER_WORKFLOW_UPDATE.md).

Student import uses a transaction and batch identity. Student phone is optional; supplied values must retain all ten digits, including leading zeros. Shared family phones are allowed. Exact identities, including absent phones, are protected; ambiguous same-name/class records with missing contact data require review. Retry the same batch after an uncertain network result. Whole batches roll back on server validation failure; no existing student is overwritten.

## Local development and tests

Use Node 24 (verified with Node 24.13). The native PostgreSQL tests require no Docker or Supabase credentials:

```powershell
cd backend
npm ci
npm test
npx deno check supabase/functions/manage-staff/index.ts
```

Tests initialize a new ignored `.test-db/UUID` cluster on loopback port 55439 with a random password. Keep that port free. They apply the real migrations and test decimal totals, rollback, concurrent numbering/idempotency, historical snapshots, multiple receipts/refunds, UTR rules, import retries, audit protection, active-account enforcement, RLS and allowed/denied role operations. `auth.users` and `auth.uid()` are minimal test shims; this suite does not run Supabase Auth, PostgREST, or email delivery. The Edge handler tests use mocked SDK responses. Deno type checking checks the Edge runtime imports separately.

For the complete local Supabase stack, install and run Docker Desktop first:

```powershell
npm run supabase -- start
npm run supabase -- status
npm run supabase -- functions serve manage-staff --env-file supabase/functions/.env.local
```

Set the frontend to the local API URL and public/anon key from local status, bootstrap a local administrator in Studio, and use the local email inbox to exercise invitations/recovery. Never copy the local service-role key into the frontend. To recreate **only a disposable local database**, `npm run supabase -- db reset --local` reapplies migrations. Docker-based Supabase and hosted-service acceptance have not been run in this workspace.

## Hosted acceptance before launch

On staging, then your production project, verify:

- Administrator login, refresh restoration, logout, incorrect credentials, and expired session handling.
- Invite delivery, first password setup, recovery, confirmed email changes, and deployed SPA redirects.
- Staff permissions by calling the APIs as staff, not merely checking hidden buttons; anonymous requests denied; deactivation blocks an existing session's next business call.
- Product creation, reviewed real spreadsheet import, atomic invalid-import rejection, and successful retry without duplicates.
- Concurrent order saves with distinct bill numbers, save/refresh persistence, immutable catalog/student snapshots, stale edit rejection, and complete bill details.
- Online UTR validation, separate subsequent receipts, administrator refund, matching ledger/balance/report/export values, and physical collection transitions.
- Unauthorized Edge invitations and fabricated role/actor/audit inputs denied.
- Filtered exports include records beyond the first page and empty/loading/error states remain clear.

The user's 521-student import and the eighth-standard correction have been verified against the linked database. Complete the remaining acceptance checks against the configured project; local and simulated-service tests do not establish frontend/Edge deployment success.

## Deployment, backup, recovery

Build and host `frontend/dist` with HTTPS and an `index.html` fallback for SPA routes. Deploy migrations before the matching frontend/function release. Set the exact frontend build values, Auth redirect URLs, SMTP, and Edge `APP_ORIGIN` for each environment. Keep development, staging and production projects separate. The frontend currently batches the full seasonal workspace; plan server-filtered queries and database reporting before retaining very large multi-year histories.

Enable backups/PITR appropriate to the project's Supabase plan. Store any logical exports securely outside the public frontend and repository. Backups must include the order number sequence, migrations, profiles and their Auth identities, ledger retry IDs, and audit records. Test recovery into a separate staging project, verify references/sequences and balances, and exercise login/invitations before considering a restore successful. Do not restore over production without a reviewed recovery plan. See [database backups](https://supabase.com/docs/guides/platform/backups). The repository does not configure automated backups or deploy infrastructure.
