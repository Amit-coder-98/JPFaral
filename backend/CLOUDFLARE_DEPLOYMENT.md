# Deploy JPfaral to Cloudflare Pages

Cloudflare Pages hosts the React/Vite frontend. Supabase continues to provide PostgreSQL, authentication, protected order/payment functions, and the `manage-staff` Edge Function. Use the existing Supabase project and data; deployment does not require another student import or a new database.

Repository: https://github.com/Amit-coder-98/JPFaral

As checked on 14 October 2026, this GitHub repository is empty. The local application currently sits inside a parent Git repository at `F:\Spanda`, so initialize a separate repository inside the application folder before the first push.

## 1. Build and push the application

Check that `frontend/.env.local` has the real Supabase URL and browser-safe publishable key with `VITE_DATA_MODE=supabase`. Build from the frontend folder:

```powershell
cd F:\Spanda\PWE\sweet_sell_management\frontend
npm run build
```

Initialize the application repository. These instructions are for the currently empty GitHub repository and the first push:

```powershell
cd F:\Spanda\PWE\sweet_sell_management
git init -b main
git rev-parse --show-toplevel
```

The printed repository root must be `F:/Spanda/PWE/sweet_sell_management`. Then stage the application source, inspect what is staged, and commit/push:

```powershell
git remote add origin https://github.com/Amit-coder-98/JPFaral.git
git add .gitignore frontend backend
git diff --cached --stat
git commit -m "Prepare JPfaral for deployment"
git push -u origin main
```

Sign in to GitHub through its normal browser/credential-manager prompt if needed. Keep `.env.local`, `imp.txt`, `node_modules`, generated `dist`, `.test-db`, and `backend/supabase/.temp` out of the commit. The project ignore file excludes these. The private staff setup HTML/JSON and invitation links must remain on this computer. Do not stage the parent `F:\Spanda` repository.

## 2. Connect Cloudflare Pages to GitHub

In Cloudflare, open **Workers & Pages → Create application → Pages → Connect to Git** (some screens say **Import an existing Git repository**). Authorize access to **Amit-coder-98/JPFaral**, select it, and choose an available Pages project name, such as `jpfaral`.

Set:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | React (Vite) |
| Root directory | `frontend` |
| Build command | `npm run build` |
| Build output directory | `dist` |

`dist` is relative to the selected `frontend` root. The repository root intentionally has no `package.json`; do not run the build there. Cloudflare installs frontend dependencies using its package files. Keep `frontend/package-lock.json` in Git.

See [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/) and [build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/).

## 3. Set production build variables

Add these in the Pages production environment before the first build:

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `24.13.0` (the locally validated Node version) |
| `VITE_DATA_MODE` | `supabase` |
| `VITE_SUPABASE_URL` | The same project URL as `frontend/.env.local` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The same publishable key as `frontend/.env.local` |

The `.env.local` file is intentionally not pushed; Cloudflare needs these values configured separately. Vite embeds the browser configuration during the build, so variable changes require a new deployment. Never use a service-role or server secret key as a `VITE_` variable.

Only configure preview environments against an intended test project. The staff function currently permits one frontend origin, so a different preview hostname will not be allowed to manage staff.

See [build variables](https://developers.cloudflare.com/pages/configuration/build-configuration/#environment-variables) and [Node version selection](https://developers.cloudflare.com/pages/configuration/build-image/).

## 4. Deploy and record the assigned HTTPS URL

Select **Save and Deploy**. Wait for a successful build and deployment, then copy the permanent production address shown by Cloudflare, for example `https://YOUR_PROJECT.pages.dev`. The exact hostname depends on project-name availability.

The existing app has no top-level `404.html`; Pages' default SPA fallback serves the app for routes such as `/students`, `/orders/UUID`, and `/auth/setup`. See [SPA serving](https://developers.cloudflare.com/pages/configuration/serving-pages/#single-page-application-spa-rendering).

## 5. Update Supabase Auth and the staff function

In the existing Supabase project, open **Authentication → URL Configuration**:

- **Site URL:** the exact permanent Cloudflare HTTPS origin, without an application path.
- **Redirect URLs:** add that origin followed by `/auth/setup`.

For example, if the actual address is `https://jpfaral.pages.dev`, the redirect is `https://jpfaral.pages.dev/auth/setup`. Use the assigned URL, not an example that belongs to another account. Do not use broad wildcard production redirects. Existing local redirects may remain for continued local testing.

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

Future pushes to the production `main` branch trigger new Pages builds. Deploy new Supabase migrations/functions separately when a release changes them. Changing the production hostname requires updating Supabase Auth redirects and `APP_ORIGIN` again.
