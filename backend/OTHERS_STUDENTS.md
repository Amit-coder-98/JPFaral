# Others students (1st–4th) — 26 October 2026

Create Order now has **5th … 10th → Stall → Others**. Others is for 1st–4th students who are not in the imported senior directory.

1. Choose **Others** and start typing the student's full name. Existing matches show their class, division and phone (if provided). Select the right student to reuse their permanent ID and previous orders.
2. For a new student, enter their name and standard. Division and student phone are optional. Choose **Save student & use**. The student remains available for future orders even if the current order is saved as a draft or cancelled.
3. Enter the order's actual customer name and 10-digit customer phone. Select products, kg quantities, payments and collection details as usual. An optional student phone does not relax the customer phone requirement.

Repeated normalized name/class/division/phone saves reuse the same record. An absent student phone can be added later; a populated number is never silently replaced. Same-name students with different supplied phones remain separate choices. When more than one identity matches a name/class/division, a new phone-less save asks the operator to select the correct existing student. Student names are not globally unique.

The Students directory includes these saved records and supports 1st–4th filters. Orders, bills and CSV/Excel exports identify Others while retaining the individual student's class and division. Class/division dashboard rows include 1st–4th, with **Stall** and **Others** as the final source filters. Always-visible source totals show orders, drafts, awaiting collections, sales and outstanding amounts; Others also shows the saved-student count. Saved junior students qualify for the existing sales leaderboard. Drafts and deleted orders do not contribute to sales or prize ranks. The Others aggregate is labelled **1st–4th total** and overlaps its detailed class rows; it must not be added to those rows again.

## Database changes and protections

New forward-only migration: [`202610260001_other_students.sql`](supabase/migrations/202610260001_other_students.sql).

The existing `students` table remains the permanent identity store. 5th–10th rows retain their required division FK and the reviewed 12 named divisions. 1st–4th rows use a NULL `division_id` and optional `other_division`; a check constraint rejects unsupported combinations. A narrow `save_other_student` RPC lets active staff create/reuse only junior identities. Auth derives the actor. There are no new direct-write grants, senior-import permissions or RLS changes. Existing audit triggers record student changes.

A trigger fills snapshots only on a new/changed junior association. Normal order edits retain historical student snapshots. Existing financial RPC definitions, numeric calculations, receipt numbers, prices, payments, refunds, deletion protections and audit history are unchanged. The migration backfills no existing business records and can be replayed without changing saved data.

## Review, apply and publish

No production migration is applied automatically. Review pending SQL first:

The linked dry run on 26 October 2026 lists only `202610260001_other_students.sql`. It remains pending. The earlier price migration is no longer in the pending list.

```powershell
cd F:\Spanda\PWE\sweet_sell_management\backend
npm run supabase -- db push --linked --dry-run
```

After reviewing the listed migrations, apply them manually:

```powershell
npm run supabase -- db push --linked
```

Then use the matching frontend build and refresh the app. Before this migration is applied, normal school and Stall orders continue working; **Save student & use** gives a clear migration message and does not pretend that a student was saved.

Local validation commands:

```powershell
cd F:\Spanda\PWE\sweet_sell_management\backend
npm test
cd ..\frontend
npm test
npm run build
npx playwright test tests/e2e/others.spec.ts tests/e2e/stall.spec.ts tests/e2e/checkout.spec.ts
npm run test:integration-browser
```

Database tests use a native local PostgreSQL instance. Browser tests use fictional or simulated Supabase records. No client students, orders or payments are created for verification.
