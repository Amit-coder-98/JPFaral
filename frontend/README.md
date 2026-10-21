# JPfaral frontend

**21 October 2026:** To record a forgotten advance, open the same order → **Edit order** → **Add advance / payment**. Enter only the additional amount received. The receipt number stays the same, the balance updates and previous payment records remain intact. If other order details changed, **Save changes & add payment** saves those edits first. This fix needs no new database migration. See the [order/payment workflow](../backend/ORDER_WORKFLOW_UPDATE.md).

**18 October 2026:** [Inventory & Cooking](COOKING_PLAN.md) totals product demand by order or collection dates, with separate collected quantities, receipt breakdowns and kitchen print/CSV sheets. It is read-only and needs no database migration.

For the 16 October checkbox catalogue, collection payments, class summaries and student leaderboard, follow [the coordinated database/frontend release instructions](../backend/ORDER_WORKFLOW_UPDATE.md).

For the later request to reuse deleted receipt numbers, follow [the additional migration and release instructions](../backend/RECEIPT_NUMBERING.md). The operator applied `202610160002_reusable_receipt_numbers.sql`; all nine migrations are verified applied to the linked project. Other environments must apply it before publishing this matching frontend.

The approved React/Vite UI uses Supabase Auth and a persistent PostgreSQL repository. Students, orders and payments start empty in a new project. Migrations initialize the twelve divisions, organization defaults, and the 26 approved Marathi products. The current linked project has 521 reviewed students; see the [student audit](../backend/STUDENT_DATA_AUDIT.md). `../DynamicReport.xls` is preserved.

## Run with a new Supabase project

Complete [backend setup](../backend/README.md) first, including migrations and your first Super Admin. Use Node.js 24 (verified with Node 24.13).

From the project directory in PowerShell:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
```

Edit `.env.local` locally:

```dotenv
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Use the project URL and **publishable** key from Supabase project settings. A legacy `anon` key is also accepted. No service-role or secret key belongs in this file, browser code, or a `VITE_` variable. Restart Vite after changing configuration.

```powershell
npm run dev
```

Open http://127.0.0.1:5173. Sign in with the administrator account you created. Missing configuration displays a setup error; it does not open the fictional workspace.

## Explicit development preview

To view the existing UI without a database:

```powershell
$env:VITE_DATA_MODE = 'mock'
npm run dev
```

The preview contains fictional students, orders, products, and staff. Its changes remain in memory and reset on refresh. Public demo accounts use `diwali2026`; role preview is available only in this mode. Some legacy mock editing behavior is retained for UI regression coverage. Production builds reject mock mode. Clear the override before building:

```powershell
Remove-Item Env:VITE_DATA_MODE
npm run build
npm run preview
```

## Application structure

- `src/app/`: routing, session restoration, active-profile checks, access guards, workspace refresh, notifications.
- `src/services/`: configuration, Supabase client, authentication, repository contracts and adapters, import and form validation.
- `src/data/reference.ts`: real standard/division mappings.
- `src/data/rateCard.ts`: the 26 approved Marathi names and printed 250g rates.
- `src/utils/pricing.ts`: canonical rate conversion, quantity validation, numeric limits and rate display.
- `src/utils/quantity.ts`, `src/components/orders/QuantityInput.tsx`: decimal-safe editable quantity entry in kg.
- `src/components/orders/ProductChecklist.tsx`, `CollectionDialog.tsx`: checkbox product selection and atomic final-payment/collection checkout.
- `src/utils/schoolSummary.ts`, `src/components/reports/SchoolOverview.tsx`: division totals and sales-ranked student standings.
- `src/pages/Inventory.tsx`, `src/utils/cookingPlan.ts`: exact quarter-kg cooking requirements and complete kitchen exports from shared confirmed orders.
- `src/styles/responsive.css`: shared containment, desktop/tablet/phone breakpoints, touch controls and landscape layouts; loaded after the existing design stylesheet.
- `src/data/mock.ts`, `src/services/mockRepository.ts`: explicit development fixtures only.
- `src/pages/`: the existing dashboards, students, catalog, orders, payment ledger, staff, reports, settings, and activity.
- `src/components/`: reusable layout, tables, charts, bill, student picker, and receipt/refund dialog.
- `src/utils/`: INR rounding, Indian dates, safe filtered CSV exports.
- `tests/unit/`: business rules, configuration boundaries, and repository HTTP contract tests.
- `tests/e2e/`: existing UI regression workflows with explicit mock mode.
- `tests/integration-browser/`: Supabase-mode UI with simulated Auth/PostgREST responses; these are not hosted-service tests.

Database calls stay inside services. The adapter retrieves records in bounded 500-row batches, including pages beyond PostgREST's default limit. Tables paginate and filter the complete loaded workspace, so filtered exports do not silently truncate. This favors the current seasonal workspace; very large multi-year datasets will need server-filtered screens and aggregate reporting rather than loading all history into the browser.

## Pricing and quantities

The catalogue and administrator price input use **दर पाव किलो (250 ग्रॅम)**. Enter the printed 250g rate; the service stores four times that amount as the canonical per-kg price. Order entry shows a searchable product checklist. Checking a product enables its editable numeric **प्रमाण** input with a visible **kg** suffix; unchecked products remain disabled and are excluded from totals and saved items. Enter 0.25, 0.5, 0.75, 1, 10 and larger supported quantities directly in kg. Decimal text conversion prevents invalid small fractions from being rounded into valid increments.

Rates display per 250g; **किंमत रुपये** is calculated from the canonical kg snapshot and positive 250g increments. Invalid, blank, negative, non-finite, or non-quarter quantities cannot be saved, including drafts. The Supabase adapter saves kilograms, and PostgreSQL independently validates quarter-kg increments and computes authoritative NUMERIC totals. Bills, reports and exports retain canonical kg quantities.

The existing `numeric(6,2)` column supports quantities up to 9,999.75 kg, replacing the former 100 kg cap. The order-total column supports ₹9,999,999,999.99; exceeding it rejects the whole order. The thirty-item limit applies to distinct rows, independently of each item's quantity. Legacy snapshots are never repriced: their displayed 250g rate may have up to four decimal places to preserve the exact old per-kg rate and original rounded totals. CSV/Excel order exports include item names, 250g snapshot rates, kg quantities, and line totals.

The Marathi rate-card migration is already applied to the linked project. Before deploying this frontend update, review and apply the new [collection checkout migration](../backend/ORDER_WORKFLOW_UPDATE.md#review-and-release).

## Connected workflows

Login/logout, persisted session restoration, invitation/recovery password setup, current-password verification, confirmed email changes, and active-account checks use Supabase Auth. Credentials are never placed in notifications or audit events.

Order creation uses one transactional RPC for its header, historical item snapshots, advance receipt, and audit events. The database allocates bill numbers and calculates decimal totals. Version checks reject stale edits. Existing receipts are immutable: use **Record payment** for partial receipts or administrator refunds. The ledger drives received amounts, balances, dashboards, reports, and exports. Orders follow Draft → Confirmed → Collected. **Collect order** shows payments already received and records the exact outstanding balance with handover in one transaction. Fully prepaid orders need only handover confirmation; no duplicate receipt is created. Collection requires full payment, and collected orders cannot be edited. Historical Ready rows remain stored unchanged and display as Confirmed.

Super Admins manage products, organization settings, reviewed imports, and staff invitations. Staff can update their own profile and display preferences, work with shared records, and view their limited activity summary. Detailed before/after audit records remain administrator-only. Server checks enforce these permissions independently of navigation.

Super Admins can remove test/mistaken orders from **All Orders** using the trash icon or row checkboxes followed by **Delete selected**. Select-all applies to administrator rows on the current page; selections persist across pages and clear when filters change. Each confirmation previews the selected orders and requires a reason. The backend accepts up to 100 distinct, versioned targets in one atomic request. Collected test/mistaken orders require an extra confirmation checkbox. Ordinary deletion requires received money to be fully refunded first. Paid test entries can instead be archived with the explicit confirmation that no real money was received; their immutable transactions remain in **Payments → Test history**. A blocked single-delete dialog provides a link to review the order.

Deletion removes orders from active lists, counts, balances, collection notifications, reports and order exports, while retaining bill snapshots, receipts/refunds, bill numbering and immutable audit history. Administrators can open the marked, read-only historical bill through audit/payment links. Deleted orders cannot be edited, paid or collected. The ledger keeps all recorded transactions. The database enforces permissions, current versions, concurrent-payment checks and retry protection; browser selection alone does not authorize deletion.

All three [order deletion migrations](../backend/README.md#review-and-enable-order-deletion) and the collection checkout migration are applied to the linked project. Active **List no.** values start at 1 within the current view and exclude archived orders. After the additional receipt-reuse migration, new **Receipt no.** values use the lowest available active slot. Deleting JP-0008 frees that number; if all active orders are deleted, the next receipt starts at JP-0001. Saved receipts retain their numbers, while permanent internal references and UUIDs distinguish old and new orders. Deleted orders are excluded from active counts, sales and balances. Bills, payments, audit links and exports use the correct customer receipt and stable record identity. Tests cover reuse, distinct archived histories, authorization, atomic bulk behavior, retries, paid restrictions, collected test overrides and phone layouts.

Imports support CSV, XLSX, and XLS, up to 10 MB and 2,000 reviewed rows per transaction. The importer detects actual headers below report titles, supports Marathi names such as `पूर्ण नाव`, provides worksheet/header controls, and reports the original spreadsheet row numbers. **Match report divisions** shows every source group with its row count, including both eighth-standard groups. Explicit names are matched; the report's `Rani Laxmi` spelling maps to canonical `Rani Laxmibai`. Bare A/B codes still require a confirmed choice, and different codes cannot map to the same named division. The original `DynamicReport.xls` has headers on row 4 and 521 student rows. Directory division filters display counts; do not reimport the existing 521 students.

Student phones are optional after applying `202610130002_student_report_import.sql`; missing phones remain NULL in PostgreSQL and display as **Not provided**. Supplied phones must contain ten digits and preserve leading zeros as text. A customer's real ten-digit phone remains required on confirmed orders. Review row errors and shared-phone warnings before importing. Exact identities, including missing phones, are protected; ambiguous same-name/class records with missing contact information require review. The same batch can be retried safely, and existing records are never overwritten. Parsing stays local; birthdays and other unused source columns are not sent to the database. See the [school report import guide](../backend/README.md#import-the-school-student-report).

## Responsive layouts

The existing branding and desktop design are retained. Responsive rules are centralized in `src/styles/responsive.css` and apply to screen media, keeping printable bills separate. Layouts use fluid widths and `minmax(0, 1fr)` columns; dense directory/report tables scroll within their own keyboard-focusable regions instead of widening the page.

Below 1440px the order summary follows the form, leaving enough space for product checkboxes and typed kg quantities. At 1024px and below, navigation becomes a drawer with scroll locking, focus management, Escape handling and inactive background content. Below 768px, page actions, filters, login and dialogs reflow. Phone order rows become labelled cards below 640px; very narrow screens use a single column below 380px. Touch controls have at least 44px targets and editable fields use 16px text. Dynamic viewport height, safe-area spacing, short landscape layouts and desktop resize handling keep navigation/dialog actions accessible. Existing bill/report print rules are preserved.

`tests/e2e/responsive.spec.ts` checks all twelve main routes at 320, 375, 390, 768, 820, 1024, 1280, 1440, 1920 and 2560px widths, including touch simulation, readable quantity fields, large quantities, validation messages, populated import forms, navigation focus/restoration, landscape dialogs, login and resizing a collapsed desktop sidebar. Tests run in Chromium and do not imply physical-device or all-browser certification.

Students, orders, payments, staff and activity tables automatically fit their page size to the available screen height, up to eight rows. Filters, totals and pagination retain readable spacing; every record stays searchable and accessible through pagination. Scrolling does not change the page size. Small screens keep at least one row and allow the space needed for filters. The catalogue shows one row of product cards per page, according to the grid's column count, with all 26 products accessible. Opening another route starts at the top. Long forms and report content retain normal document scrolling; printable bills and report output remain complete.

The dashboard shows operational totals, awaiting collections, school-wide class/division summaries, student sales standings, recent orders and activity. Dashboard graphs have been removed. Class summaries include directory and participating students, orders, drafts, awaiting/collected counts, sales, receipts and outstanding money. Gift rankings use total sales value from non-draft, non-deleted orders; ties share a rank. Both summaries support CSV exports. Empty workspaces show a create-order action. The header identifies the actual account role; explicit development previews still identify fictional data.

`tests/e2e/scrolling.spec.ts` checks list pagination on laptops, tablets and phones, complete directory traversal, resizing, sorting, filters, empty results, all catalogue pages and navigation scroll reset.

## Staff access for local testing

The two requested staff accounts have been created in the linked project as active **Data Entry Staff**. Their one-time setup links are kept privately in `../backend/supabase/.temp/staff-local-setup.html`, outside the frontend and ignored by Git. Open that file in a browser on this computer while JPfaral runs at `http://127.0.0.1:5173`. Sign out of the administrator account, let each named user set their own password (at least twelve characters), and then sign in using their email. No invitation emails or passwords were assigned by this local setup. The links expire according to Auth settings; do not publish the file.

For future users, open **Staff Management → Add staff member**, enter the full name and email, and select **Send invitation**. New invitations create Data Entry Staff. Existing accounts can be managed by a Super Admin. Configure the public application URL, permitted Auth redirects, Edge `APP_ORIGIN` and working SMTP when deploying; verify actual delivery and password setup before sharing access from other devices.

## Verification and deployment

For the Cloudflare Workers setup shown in the dashboard, follow the [complete Cloudflare deployment steps](../backend/CLOUDFLARE_DEPLOYMENT.md). `wrangler.jsonc` deploys `dist` as static assets with an `index.html` fallback for application routes. Supabase remains the database/Auth/backend. The guide covers the exact dashboard commands, production build variables, Auth redirects, and staff-function configuration, with Pages settings for projects that use Pages.

```powershell
npm test
npx playwright install chromium
npm run test:e2e
npm run test:integration-browser
npm run build
```

Browser tests use the full Chromium channel on Windows. The UI regression server explicitly uses mock mode; integration-browser tests simulate network responses and verify session/permission UI behavior. Neither substitutes for the hosted-project acceptance checks in the backend guide.

Deploy `dist/` to a static host with HTTPS. Configure **every application route** to serve `index.html` (for example, `/orders/UUID`, `/reports`, and `/auth/setup`). Configure production Vite values at build time and the exact production origin/redirect in Supabase and the Edge Function. Vite environment changes require a rebuild. Keep Auth links out of analytics/logs. Test invitation and recovery links through the deployed SPA before sharing access.
