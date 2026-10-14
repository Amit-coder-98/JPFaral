# Implementation and verification

## Paid test-order cleanup and selection — 14 October 2026

Verified the linked project has both deletion migrations applied and the live function correctly supports collected confirmation. JP-0001 remains active, Collected, total ₹1,320 and net recorded receipts ₹1,320. The operator confirmed these were test payments only. The remaining payment safeguard caused the deletion block; frontend eligibility filtering also disabled its row/header checkbox and pruned paid selections.

All active administrator rows are now selectable for review. Added a required reason and an explicit **These are test entries only; no real money was received.** choice for paid test cleanup. New forward-only `202610140003_test_order_cleanup.sql` adds audited `deletion_test_data` and immutable request `test_cleanup` metadata, with a default-false Super Admin-only RPC confirmation. Ordinary deletion retains the real-payment and collected safeguards. Confirmed test cleanup can archive paid/collected entries without inventing a refund, rewriting ledger rows, changing snapshots, removing audit events or reusing bill numbers. Authorization, current-version checks, stable locks, atomic batches, retry consistency and frozen archives remain enforced.

Active reports and order exports exclude archives as before. Live payment totals/CSV exclude only explicitly archived test records; **Payments → Test history** retains labelled transactions and a separate CSV. Historical test bills show original totals and recorded test payments, a test notice, and no collectible balance. SDK calls omit the new flag for ordinary deletion, keeping existing workflows compatible until the migration is reviewed/applied. Missing test-cleanup RPC responses name the required migration. Existing migrations were not edited, and the live dev server on port 5173 remains running.

The linked dry run lists only the new cleanup migration. It has **not been applied**, and JP-0001 has **not been deleted** by this implementation. Follow [the review and application instructions](README.md#review-and-enable-order-deletion). Hosted deletion must be verified after the operator applies the migration; browser service fixtures do not establish live deployment.

Verification: **52 backend tests, 107 frontend unit tests, seven deletion browser workflows, 19 responsive/scrolling checks, eight simulated Supabase browser checks and the production build passed**. The new browser service scenario reproduces Collected/₹1,320/version 4, verifies a selectable checkbox, default blocked submission, explicit test flag/current version/derived actor contract, archived state after refresh, separated retained receipts and the read-only historical bill. New native PostgreSQL tests verify paid collected snapshots, no invented refunds, immutable test metadata, role restrictions, stale/missing/duplicate targets, batch rollback, defaults and migration replay. The new history filter initially added phone scrolling; grouping its two filters corrected this, and all four pagination sizes plus affected phone/desktop layouts were rerun successfully. Previously applied migrations remain unchanged.

## Collected test-order override — 14 October 2026

The operator applied `202610140001_order_deletion.sql`, verified against linked migration history, then reported that a collected test order remained blocked. Added forward-only `202610140002_collected_order_deletion.sql`; the applied first deletion migration remains unchanged (SHA256 `CFA2F3C4D3B6B3C5556F2B23F10AA0F0FE495951AFDBAA621B5C3E182337AE5A`).

The collected-order dialog now requires a reason and explicit test/mistake acknowledgement. Eligible collected orders can also be included in a bulk selection. The Super Admin-only RPC requires the collected override, records it in immutable retry metadata and the Deleted audit/header, and preserves the original Collected status, bills and items. Omitted/NULL overrides retain the default restriction. Paid orders still require net receipts of zero; role, version, atomicity, payment/audit immutability, archived-read restrictions and blocked post-deletion writes remain intact. There is only one public RPC overload, and old three-argument callers keep default false behavior.

Linked dry run lists only `202610140002_collected_order_deletion.sql`; it has not been applied and no existing live order was removed. Follow [review/application commands](README.md#review-and-enable-order-deletion).

Verification: **49 backend tests, 104 frontend unit tests, six deletion browser workflows and the production build passed**. New coverage checks explicit true/false/NULL override choices, default three-argument compatibility, one unambiguous RPC, role/payment/version restrictions, immutable audit flags, mixed-batch rollback, retry flag consistency and phone confirmation controls. The prior applied migration's hash is unchanged. The migration was previewed with the linked-project dry run, without applying it.

## Reviewed single and bulk order deletion — 14 October 2026

Inspected the four applied migrations, live order/item/payment columns and RLS, financial RPC signatures, repository mapping, validations and existing business tests. Added the forward-only `202610140001_order_deletion.sql`; the previous migration hashes remain unchanged. It adds deletion metadata, private immutable batch retry records, administrator-only atomic deletion, database-generated Deleted audits, archived-read restrictions and guards around unchanged financial implementations. No orders, items, payments, sequence values or existing audits are physically removed or rewritten.

The Orders list now has single trash actions and page-scoped eligible checkboxes, persistent selection across pages, clear-on-filter behavior, exact confirmation previews, required reasons and a 100-target limit. Paid and collected orders explain the block; fully refunded, uncollected orders can be removed without erasing their ledger. Archived orders are separated from all active calculations and normal selectors, while administrator historical bills/audit links and payment identity remain readable. Archived bills are marked as deleted, have no collectible balance and cannot be edited, paid or collected. New numbering continues past archived bills.

The linked-project dry run lists only `202610140001_order_deletion.sql`. The migration has not been applied and no real order was deleted during implementation. Follow [review and application commands](README.md#review-and-enable-order-deletion). Local database tests exercise actual SQL; UI/Auth service fixtures do not establish hosted deployment or live deletion success.

Verification: **45 backend tests, 102 frontend unit tests, 37 UI browser tests, seven simulated Supabase Auth checks and the production build passed**. Native PostgreSQL coverage includes admin/staff/inactive/anonymous permissions, single/bulk snapshots and audits, net receipts/refunds, fully refunded history, stale/missing/duplicate targets, atomic rollback, matching/changed retry payloads, overlapping deletions, payment races, the 100-target boundary, migration replay and blocked private/direct writes. Browser checks exercise cancellation and reason entry, selection across pages and filter reset, active totals, read-only historical bills, retained payment identity, paid/collected explanations, staff controls, all responsive routes and A4 printing. Existing migration hashes remain unchanged and the user's Supabase-mode dev server on port 5173 was retained.

## List-page scrolling and administration — 13 October 2026

Students, orders, payments, staff and activity now use viewport-aware pagination. The shared table measures actual row/header heights and available space for records and pagination, without changing page size when the user scrolls. List spacing is reduced while retaining readable fields and touch targets. The catalogue shows one grid row of product cards per page; every product remains searchable and accessible. Route navigation resets the previous document scroll position. Import previews, long forms, reports and bill printing retain their complete content.

The dashboard focuses on financial totals, ready collections, recent orders and activity. Removed the decorative welcome/season panels, inactive workspace switcher and redundant chart/team summaries. Empty workspaces show an order-creation action without empty charts. The live header uses the actual account role. New staff invitations are fixed to Data Entry Staff, while existing authorized administrators retain account management.

The user authorized two staff accounts and confirmed local testing before deployment. Generated private Auth invitation links without sending email, verified the exact `http://127.0.0.1:5173/auth/setup` redirect, activated both profiles as `staff`, and independently verified both Auth/profile identities in the linked database. Passwords remain unset pending the named users' setup. The temporary HTML/JSON are ignored by Git, outside the frontend, and contain no privileged API key. No browser grants, RLS policies or migrations were changed. The linked database still has 521 students and 26 products.

Verification: **94 frontend unit tests, 32 UI browser tests, seven simulated Supabase Auth checks and the production build passed**. Browser coverage includes all twelve routes at ten widths, reduced list scrolling on laptops/tablets/phones, every record in the 528-row development fixture without omissions or repeats, all 26 catalogue products, sorting/filtering, resize behavior, route scroll reset and A4 printing. Dashboard and Students screenshots were inspected. The four applied migration hashes remain unchanged. The user's dev server on 5173 was retained. Real staff password completion, email delivery and deployment remain separate from these verified checks.

## Responsive device layouts — 13 October 2026

Added `frontend/src/styles/responsive.css`, loaded after the existing design stylesheet. It centralizes fluid containment, 1440/1024/768/640/380px layout changes, coarse-pointer control sizing, safe-area spacing, dynamic viewport height and short-landscape behavior. Phone order rows use labelled cards, tablet navigation uses a drawer, and dense data tables remain scrollable within the page. The summary follows the form on smaller laptops; the quantity column has enough room for both typed digits and kg/gm units. Existing screen branding and print rules are retained.

The drawer manages keyboard focus, Escape, background inertness and scroll locking, including switching from a collapsed desktop sidebar to a tablet and back. Dialog headings keep their close control available while long forms scroll. Touch inputs use 16px text, and primary controls, switches and payment choices have 44px targets. Responsive styles apply only to screen media, preserving A4 bill printing.

New browser coverage checks twelve main routes at ten widths from 320 to 2560px, populated import previews, valid large quantities, validation messages, readable quantity fields, navigation focus/restoration, short landscape dialogs, login and resizing. All **94 frontend unit tests, 24 browser tests and the production build passed**. Phone and laptop screenshots were inspected, including the corrected 1280px quantity field; the print test retained a one-page A4 bill. Tests use Chromium with simulated touch/viewport sizes, rather than a physical-device or all-browser certification. The user's dev server on 5173 remains running, and no database migration or data write is part of this change.

## Editable kg/gm order quantities — 13 October 2026

Added a kg/gm unit selector beside the editable quantity input in every order row. Users can enter 250/500/750 gm or decimal/large kg quantities. Unit switching converts the current value without changing its physical amount; blank and invalid entries remain invalid. Decimal text conversion and integer quarter-unit validation prevent floating-point rounding from accepting invalid fractions. Stable row keys retain the chosen unit and typed value when another row is removed, and new/reset rows start in kg.

The order adapter and schema continue using canonical kg quantities. PostgreSQL still independently validates positive quarter-kg increments and calculates NUMERIC totals. Product rates, bills, exports, historical snapshots, payments, RLS and audit behavior remain unchanged. No migration, production data write or deployment was required for this UI change.

Verification covers gram/kg equivalents, amount-preserving switching, invalid/blank/negative/oversized entries, very small invalid fractions, row removal/addition, save/edit/bills and mobile/tablet layouts. All **94 frontend unit tests, 35 backend tests, 13 browser workflows and the production build passed**. Desktop/mobile screenshots were inspected; the user's dev server on 5173 remains running.

## Full student audit and eighth-standard correction — 13 October 2026

Read all 521 saved students and compared them with all 521 source rows in the unchanged XLS. Every name and standard matched, without missing, extra or ambiguous identities. The user confirmed the saved A/B mappings for standards 5, 6, 7, 9 and 10. Found 44 source `B-Rani Laxmi` students incorrectly assigned to Rani Channamma alongside the 44 source A students.

Prepared a guarded data repair using `maintenance/studentDivisionRepair.mjs`. Native PostgreSQL tests verify rollback, stale input rejection, replay, student ID/contact preservation, historical order/payment snapshots, audit immutability and unchanged client write restrictions. After a successful rolled-back preview on the linked project, committed the 44 requested corrections. A fresh full-directory comparison confirms zero remaining mismatches and 44 students in each eighth-standard division. All student IDs and import batches remain unchanged. The database contains 521 original creation audits and exactly 44 division-edit audits. No migration was modified or applied during this repair.

The importer now displays all report groups and counts, including previously hidden 8th A. It recognizes the explicit `Rani Laxmi` report spelling, blocks contradictory named mappings and merged A/B groups, and checks consistent code mappings. Directory filters show student counts; the summary shows actual standards/divisions present. The existing styling remains intact.

Verification: **60 frontend unit tests, 35 backend tests (30 native PostgreSQL + 5 mocked Edge tests), all 12 browser workflows and the production build passed**. The original XLS is still 106,496 bytes with its original modification time. All four existing migrations are now verified as applied by the operator; no new migration is needed for this data repair. See [full audit and class counts](STUDENT_DATA_AUDIT.md).

## Student school-report import fix — 13 October 2026

The user reported `__EMPTY` column names and zero valid rows when uploading the original XLS. The old reader treated the first title row as headers. The supplied file has actual headers on row 4, 521 student rows, a Marathi `पूर्ण नाव` column, no phones, and report division codes/abbreviations.

The user confirmed that student phones may be absent, with real customer phones still mandatory on confirmed orders, and declined the proposed automatic A/B mapping. The importer now detects report headers, provides worksheet/header controls, recognizes Marathi names, preserves source row numbers in validation errors, and requires explicit named-division choices for unresolved codes. Empty phones stay empty in the UI and are sent as NULL; no contacts or division assignments are invented. Unused source columns, including birthdays, are not sent to Supabase.

Added `202610130002_student_report_import.sql`: nullable student phones, NULL-safe exact identity uniqueness, ambiguity checks, unchanged administrative authorization, and transactional batch retries. Current catalogue/pricing migrations, RLS, snapshots, order customer-phone checks, payments and audit protections remain unchanged.

Verification: 59 frontend unit tests, 32 backend tests (27 native PostgreSQL and five mocked Edge tests), all 12 UI browser workflows, and the production build passed. Tests include the actual unchanged 521-row XLS fixture and a synthetic report workflow that imports without phones only after explicit division mapping, then rejects an order without a customer phone. Browser tests ran on port 5177; the user's server on 5173 was retained.

At completion of the original parser work, remote dry run listed only `202610130002_student_report_import.sql`; it had not been applied and implementation tests had imported no real students. The operator subsequently applied it and imported 521 students, verified and corrected in the audit above. The supplied XLS retains its original 106,496-byte size and modification time.

## Marathi rate card update — 13 October 2026

Inspected the linked project's applied migration history, product/item numeric types, quantity constraint, transactional function, and RLS policies using read-only queries. Both October 11 migrations are applied, and the catalogue was empty at inspection. Their SHA256 hashes remain unchanged.

Added `supabase/migrations/202610130001_marathi_rate_card.sql`. It retains per-kg storage, supports positive quarter-kilogram quantities up to the existing numeric capacity (9,999.75 kg), replaces the checked order-save function, and seeds exactly the 26 supplied Marathi products. It preserves historical item prices, totals, receipts, audit events, existing product IDs/availability and authorization policies. Reapplying the seed creates no duplicate records or redundant audit events; ambiguous existing names stop it for review.

The UI retains its design. Product price entry/display now uses the 250g rate; typed kg quantities replace the dropdown. Product forms multiply the entered rate by four before saving. The shared calculation utility uses integer paise and quarter units with PostgreSQL-compatible half-up rounding. Bills and CSV/Excel exports display snapshot rates per 250g, including exact fractional-paise legacy rates where required.

| Check                                  | Actual result                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Frontend unit tests                    | 50 passed                                                                                                  |
| Backend tests                          | 30 passed: 25 native PostgreSQL tests and 5 mocked Edge handler tests                                      |
| UI browser workflows                   | 11 passed, including editable kg quantities, Marathi rates, rate conversion, bills and filtered CSV export |
| Simulated Supabase Auth browser checks | 7 passed                                                                                                   |
| Production TypeScript/Vite build       | Passed                                                                                                     |
| Linked project migration dry run       | Only `202610130001_marathi_rate_card.sql` pending; nothing applied                                         |

Coverage includes 0.25, 0.5, 0.75, 1, 1.25, 1.5, 10, 100.25 and 9,999.75 kg; 250g display/conversion; invalid/non-finite quantities and draft rejection; numeric total overflow rollback; exact Marathi catalogue values; replay/duplicate safety; genuine pre-upgrade historical bills; existing permissions, concurrency, receipts/refunds and audit rules.

This upgrade has **not** been applied or deployed to production. Follow [review and application instructions](README.md#review-and-apply-the-marathi-rate-card-upgrade), applying the migration before deploying the matching frontend. Native PostgreSQL uses a minimal Auth identity shim; browser/Auth contract tests use simulated responses.

## Original integration verification — 11 October 2026

- [x] Supabase configuration with placeholders, startup validation, and explicit development mock mode.
- [x] Normalized schema, decimal constraints, sequence numbering, transactional operations, immutable audit triggers, and RLS.
- [x] Auth integration: login/logout, verified profile identity, refresh restoration, inactive/expired account handling, invitation/recovery password setup, and profile/password updates.
- [x] Supabase repository, persistent order/catalog/student workflows, ledger, collections, staff management, settings, dashboard, reports, and filtered exports.
- [x] Atomic reviewed imports, family-phone review, exact duplicate rejection, and safe batch retries.
- [x] Backend security/business tests and frontend unit/browser regression tests.
- [x] Project setup, bootstrap, deployment, backup/recovery, and hosted acceptance documentation.
- [ ] Create/link a hosted Supabase project and apply migrations.
- [ ] Configure hosted Auth, custom SMTP, redirects, and first administrator.
- [ ] Deploy the Edge Function and frontend, import reviewed real students, and pass hosted end-to-end acceptance.

## Results on 11 October 2026

| Check                                                     | Actual result                 | Scope                                                                                                                                                                          |
| --------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend `npm test`                                        | 24 passed                     | 19 tests on native PostgreSQL 17 plus 5 mocked Edge authorization/compensation tests                                                                                           |
| Frontend `npm test`                                       | 24 passed                     | Business rules, configuration, rounding, import identity/review, pagination, snapshots, ledger, and simulated HTTP repository contract                                         |
| Frontend `npm run test:e2e`                               | 10 passed                     | Explicit mock UI workflows, extra receipts/refunds, shared-family import review, exports, mobile/tablet layouts and print                                                      |
| Frontend `npm run test:integration-browser`               | 7 passed                      | Supabase-mode UI with simulated service responses: config error, login/restoration/logout, staff routes, deactivation, expired session, invalid credentials, password recovery |
| Frontend `npm run build`                                  | Passed                        | TypeScript and production Vite bundle                                                                                                                                          |
| Chromium check of compiled production build               | Passed                        | Missing configuration blocks fictional records; a deep SPA route loads the setup state without script errors                                                                   |
| `npx deno check supabase/functions/manage-staff/index.ts` | Passed                        | Edge entry point and pinned SDK imports                                                                                                                                        |
| `npm audit` in each package                               | Zero vulnerabilities reported | Installed frontend and backend dependency trees                                                                                                                                |

The browser checks found and verified a fix for concurrent sign-in/session callbacks. Login now completes a single explicit identity load; stale callbacks cannot restore a signed-out workspace. The repository derives the UI identity from Auth `getUser`, not editable cached session metadata. `DynamicReport.xls` remains 106,496 bytes with its original modification time.

These results verify the application implementation and database rules in the stated local environments. Native PostgreSQL uses minimal test-only `auth.users`/`auth.uid()` shims; browser and Edge contract tests use simulated responses. Hosted Auth, SMTP delivery, PostgREST, Edge gateway behavior, production SPA redirects and persistence in a real project have **not** been verified. No production database, real student import, staff email, or deployment has been performed.

Follow [backend setup](README.md) and [frontend run instructions](../frontend/README.md). The backend README contains the outstanding hosted acceptance checklist. Full workspace reads are batched, while screen filtering/pagination remains local; very large histories need server-filtered views and aggregates.
