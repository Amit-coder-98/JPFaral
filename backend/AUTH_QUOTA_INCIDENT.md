# Authentication restriction — 7 November 2026

The live JPfaral site serves successfully (HTTP 200), but this Supabase project's Auth health, settings and password sign-in endpoints returned HTTP 402 with `exceed_egress_quota`. Supabase's public status reported operational services, and the management API reported the project healthy. This is an organization usage restriction, rather than evidence of incorrect staff passwords or a deleted database.

To restore service, the organization owner must review **Supabase → Organization → Billing / Usage**. For Free, upgrading the organization to Pro lifts an egress restriction; for Pro with Spend Cap, disabling the cap permits chargeable overages. Alternatively, quota restrictions clear after the billing cycle resets. Review the current amounts in the dashboard. Code optimizations cannot remove data transfer already accumulated or lift the provider's billing restriction. No billing change was performed by this code update, and no production records or passwords were altered.

Official recovery instructions: https://supabase.com/docs/guides/platform/billing-faq

Previously, each visible tab downloaded the complete workspace every 30 seconds and on focus, including all historical orders, items, payments and audit events. This is an avoidable source of egress (up to 120 full snapshots per tab-hour); the actual organization usage breakdown must be checked in Supabase Usage.

The update replaces periodic/focus full downloads with a throttled check once per minute: verify the current Auth user and active profile, then fetch only one ID/timestamp plus count per mutable table. Counts detect additions/removals; database-maintained update timestamps detect edits, collections and payments. The full snapshot reloads only if those signatures change. Explicit Refresh records and successful saves still reload authoritative data. Repeated focus events and concurrent background checks share a request; unchanged SIGNED_IN events do not reload the workspace. Hidden tabs skip checks. Quota failures pause background requests for five minutes; manual refresh remains available after recovery. Invalid sessions, inactive users and changed permissions still clear access.

Sign-in distinguishes a quota restriction, temporary connection/server failure, rate limiting and invalid credentials. The design and existing authorization/RLS, receipts, payment rules and database calculations are preserved. This update requires no database migration. Its effectiveness depends on actual traffic; this does not promise that any production volume will fit the Free plan.

Validation uses local/simulated responses for quota, unchanged/changed data, backoff, manual recovery and deactivation. Real sign-in must be checked again after the organization owner restores service. Do not report authentication restored solely because the frontend deployed.
