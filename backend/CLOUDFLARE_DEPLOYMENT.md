# Deploy JPfaral to Cloudflare

The dashboard screenshots show Cloudflare Workers, with Build, Deploy and Preview command fields. The repository now supports this workflow using frontend/wrangler.jsonc: Cloudflare hosts the React/Vite frontend, and Supabase continues to provide PostgreSQL, authentication, protected order/payment functions and staff management.

Repository: https://github.com/Amit-coder-98/JPFaral

The first application commit is already pushed to the main branch. Do not repeat Git initialization or recreate the database. Local environment files, the source student spreadsheet, private notes and staff setup links remain excluded from Git.

## 1. Configure the screen shown in Cloudflare

Select the repository and set:

| Field | Value |
| --- | --- |
| Project name | jpfaral |
| Build command | npm run build |
| Deploy command | npx wrangler deploy |
| Preview command | npx wrangler versions upload |
| Enable Preview builds | Off for the first production setup |
| Protect with Cloudflare Access | Off; JPfaral uses its existing Supabase login |
| Production branch | main |

Expand **Advanced settings** and set **Root directory** to **frontend**. This is essential: the repository root intentionally has no package.json. Cloudflare must install dependencies and run commands inside frontend, where both package.json and wrangler.jsonc are located.

The Worker name must match the configuration name jpfaral. If you choose another name later, change the configuration name in a reviewed commit too. Existing projects have these settings under **Settings > Build**.

See [Workers build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

## 2. Add build variables before deploying

Under **Advanced settings > Build variables/secrets**, add:

| Variable | Value |
| --- | --- |
| NODE_VERSION | 24.13.0 |
| VITE_DATA_MODE | supabase |
| VITE_SUPABASE_URL | Copy the existing value from frontend/.env.local |
| VITE_SUPABASE_PUBLISHABLE_KEY | Copy the existing publishable key from frontend/.env.local |

These are **build** values, because Vite embeds browser configuration during the build. Adding them only as Worker runtime variables will not configure the frontend. Changes require a new build. Use a browser-safe publishable key and keep server secret/service-role keys out of Vite variables.

Wrangler is a locked frontend development dependency so Cloudflare uses the project's validated CLI version. The Vite app and its UI remain unchanged. Configure preview environments separately if preview builds are enabled later; the current staff function permits one frontend origin.

See [build variables](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#build-variables-and-secrets).

## 3. Validate locally and deploy

For future changes, run from frontend:

~~~powershell
cd F:\Spanda\PWE\sweet_sell_management\frontend
npm test
npm run build
npx wrangler deploy --dry-run
~~~

The dry run validates the asset deployment configuration without uploading it. Cloudflare's Git build performs the actual deployment after you select **Deploy** or retry a failed deployment with corrected settings. The old ENOENT at /opt/buildhome/repo/package.json means Root directory was not frontend.

The configuration serves only built dist assets. It uses **single-page-application** routing so /students, /orders/UUID and /auth/setup can be opened or refreshed directly. No custom Worker script or duplicate backend is needed. See [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/).

## 4. Record the permanent HTTPS address

After deployment succeeds, copy the assigned production address, normally https://jpfaral.YOUR_ACCOUNT.workers.dev. Use the actual address shown by Cloudflare; YOUR_ACCOUNT is an example placeholder. The earlier pages.dev examples apply only to Cloudflare Pages projects.

## 5. Update Supabase Auth and the staff function

In the existing Supabase project, open **Authentication → URL Configuration**:

- **Site URL:** the exact permanent Cloudflare HTTPS origin, without an application path.
- **Redirect URLs:** add that origin followed by `/auth/setup`.

For example, if the actual address is `https://jpfaral.YOUR_ACCOUNT.workers.dev`, the redirect is `https://jpfaral.YOUR_ACCOUNT.workers.dev/auth/setup`. Use the assigned URL, not an example that belongs to another account. Do not use broad wildcard production redirects. Existing local redirects may remain for continued local testing.

Edit the existing ignored `backend/supabase/functions/.env.local` to set `APP_ORIGIN` to the exact permanent HTTPS origin, without a trailing slash. If this file does not exist, copy `.env.example` and replace its local origin first:

```powershell
cd F:\Spanda\PWE\sweet_sell_management\backend
# Only if the file does not already exist:
Copy-Item supabase/functions/.env.example supabase/functions/.env.local
```

After editing `APP_ORIGIN`, run:

```powershell
cd F:\Spanda\PWE\sweet_sell_management\backend
npm run supabase -- secrets set --env-file supabase/functions/.env.local
npm run supabase -- functions deploy manage-staff
```

Keep the existing JWT verification and handler authorization enabled. Changing this origin permits staff management from the production address; the former local origin is no longer permitted by this function's single-origin policy.

See [Auth redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls), [Edge secrets](https://supabase.com/docs/guides/functions/secrets), and [function deployment](https://supabase.com/docs/guides/functions/deploy).

## 6. Enable invitations and password recovery

Configure **Authentication → SMTP Settings** with a working email provider before sending invitations/recovery emails to staff. Supabase's default SMTP restricts recipients to project-team addresses and is not intended for production staff delivery. Existing accounts with completed passwords can log in without a new invitation; accounts whose setup is incomplete need a fresh setup/recovery link for the deployed address. The old private local setup links point to `127.0.0.1` and cannot be used from staff devices.

See [Supabase SMTP configuration](https://supabase.com/docs/guides/auth/auth-smtp). Enter email-provider credentials in Supabase directly; keep passwords and privileged keys out of chat and the frontend.

## 7. Verify the live deployment

Sign in as the administrator, check the existing students/products/orders, open an order bill, and directly reload `/students`, `/orders`, and `/auth/setup`. Verify a staff account can access order entry but cannot access administrator screens. Check invitation/recovery delivery and the complete password-setup/login flow using a fresh link to the deployed hostname. Check bills, exports and responsive layouts on a phone. Test financial writes with explicitly identified test entries and review their cleanup afterward.

For the existing project, check migration history rather than resetting/recreating data:

```powershell
cd F:\Spanda\PWE\sweet_sell_management\backend
npm run supabase -- db push --linked --dry-run
```

The operator reported completing the latest cleanup migration. If the dry run lists other pending migrations, review them and the linked project before applying anything. Frontend deployments do not apply database migrations automatically.

Future pushes to the production `main` branch trigger new Workers builds. Deploy new Supabase migrations/functions separately when a release changes them. Changing the production hostname requires updating Supabase Auth redirects and `APP_ORIGIN` again.

## Alternative: an existing Pages project

For a Cloudflare Pages project, select production branch `main`, root directory `frontend`, build command `npm run build`, and build output directory `dist`. Use the same build variables. Pages hosts the generated assets directly and does not use the Workers Deploy/Preview command fields. Its permanent hostname ends in `.pages.dev`; use that actual hostname for Auth redirects and `APP_ORIGIN`. The current screenshots show Workers, so follow sections 1–7 above for that project.
