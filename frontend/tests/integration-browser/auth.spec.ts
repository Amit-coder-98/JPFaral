import { test, expect, type Page } from "@playwright/test";

// UI integration with simulated service responses. Actual Auth/RLS behavior is
// covered separately by database tests and still needs hosted-project acceptance.
const id = "a1111111-1111-4111-8111-111111111111";
async function service(page: Page, role = "super_admin") {
  let active = true,
    invalid = false,
    expired = false;
  const identity = {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: "member@test.invalid",
    email_confirmed_at: "2026-10-11T10:00:00Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-10-11T10:00:00Z",
    updated_at: "2026-10-11T10:00:00Z",
  };
  const encoded = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({ sub: id, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  await page.route("https://fixture.supabase.co/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const send = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname.endsWith("/token"))
      return invalid
        ? send(
            {
              error: "invalid_grant",
              error_description: "Invalid login credentials",
              code: "invalid_credentials",
            },
            400,
          )
        : send({
            access_token: token,
            refresh_token: "test-refresh-token",
            expires_in: 3600,
            token_type: "bearer",
            user: identity,
          });
    if (url.pathname.endsWith("/user"))
      return expired
        ? send({ message: "JWT expired", code: "bad_jwt" }, 401)
        : send(identity);
    if (url.pathname.endsWith("/logout")) return route.fulfill({ status: 204 });
    if (url.pathname.includes("/rest/v1/")) {
      const table = url.pathname.split("/").at(-1);
      const rows =
        table === "profiles"
          ? [
              {
                id,
                full_name: "Test Member",
                email: identity.email,
                role,
                active,
                preferences: {},
              },
            ]
          : table === "organization_settings"
            ? [
                {
                  id: true,
                  organization: "Test school",
                  address: "",
                  contact: "",
                },
              ]
            : [];
      return send(
        request.headers().accept?.includes("object") ? rows[0] : rows,
      );
    }
    return send({ error: "Unhandled simulated service request" }, 400);
  });
  return {
    deactivate: () => {
      active = false;
    },
    invalid: () => {
      invalid = true;
    },
    expire: () => {
      expired = true;
    },
    setupLink: () =>
      `/auth/setup#access_token=${token}&refresh_token=test-refresh-token&expires_in=3600&token_type=bearer&type=recovery`,
  };
}
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("member@test.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Sign in to workspace", exact: true })
    .click();
}
test("missing configuration blocks the workspace without fictional records", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:5175/dashboard");
  await expect(
    page.getByText("Supabase configuration required", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("VITE_SUPABASE_URL", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
});

test("Supabase-mode paid collected test selection sends explicit cleanup and preserves separate history on refresh",async({page})=>{
  await service(page);
  const orderId="b1111111-1111-4111-8111-111111111111";
  const order:Record<string,unknown>={id:orderId,order_number:"JP-0001",version:4,status:"Collected",total_amount:"1320.00",
    student_name:"Test Student",student_standard:"5th",student_division:"Devi Padmini",customer_name:"Test Customer",
    customer_phone:"9876543210",collection_date:"2026-10-20",collector_type:"Student",collector_name:"Test Student",
    created_by:id,updated_by:id,created_at:"2026-10-14T10:00:00Z",updated_at:"2026-10-14T10:00:00Z",deleted_at:null};
  const payment={id:"test-payment",order_id:orderId,amount:"1320.00",kind:"receipt",method:"Cash",received_by:id,paid_at:"2026-10-14T10:00:00Z"};
  const item={id:"test-item",order_id:orderId,product_id:"test-product",product_name:"मोतीचूर लाडू",price_per_kg:"440.00",quantity_kg:"3.00",position:0};
  let requests=0;
  for(const [table,rows] of [['orders',[order]],['payments',[payment]],['order_items',[item]]] as const)
    await page.route(`https://fixture.supabase.co/rest/v1/${table}*`,route=>route.fulfill({contentType:"application/json",body:JSON.stringify(rows)}));
  await page.route("https://fixture.supabase.co/rest/v1/rpc/delete_orders",async route=>{
    const body=route.request().postDataJSON();
    expect(body.p_orders).toEqual([{id:orderId,version:4}]);
    expect(body.p_allow_collected).toBe(true);
    expect(body.p_test_cleanup).toBe(true);
    expect(body.p_reason).toBe("Test data only, no real money");
    expect(body).not.toHaveProperty("actor");
    requests++;
    Object.assign(order,{deleted_at:"2026-10-14T11:00:00Z",deleted_by:id,deletion_reason:body.p_reason,deletion_collected_override:true,deletion_test_data:true,version:5});
    return route.fulfill({contentType:"application/json",body:JSON.stringify({deleted:1})});
  });
  await login(page);
  await page.locator('nav a[href="/orders"]').click();
  await page.getByLabel("Select JP-0001",{exact:true}).check();
  await expect(page.getByLabel("Select JP-0001",{exact:true})).toBeChecked();
  await page.getByRole("button",{name:"Delete selected",exact:true}).click();
  await page.getByLabel("Reason for deletion",{exact:false}).fill("Test data only, no real money");
  await expect(page.getByRole("button",{name:"Confirm delete",exact:true})).toBeDisabled();
  expect(requests).toBe(0);
  await page.getByLabel("These are test entries only; no real money was received.").check();
  await page.getByRole("button",{name:"Confirm delete",exact:true}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("No results found",{exact:true})).toBeVisible();
  expect(requests).toBe(1);
  await page.reload();
  await expect(page.getByText("No results found",{exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Payments",exact:true}).click();
  await expect(page.getByText("No results found",{exact:true})).toBeVisible();
  await page.getByLabel("Payment records").selectOption("test");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("₹1,320.00");
  await expect(page.locator("tbody")).not.toContainText("Refund");
  await page.getByRole("link",{name:"JP-0001 · Test",exact:true}).click();
  await expect(page.locator(".bill")).toContainText("Deleted test order");
  await expect(page.locator(".bill")).toContainText("₹1,320.00");
  await expect(page.locator(".bill .balance")).toContainText("₹0.00");
});
test("Supabase login restores on refresh, shows empty real workspace, and signs out", async ({
  page,
}) => {
  await service(page);
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
  await expect(page.getByLabel("Preview as")).toHaveCount(0);
  await expect(page.getByText("No orders yet", { exact: true })).toBeVisible();
  await expect(page.locator(".dashboard-charts, .welcome-banner, .workspace-chip, .season-note")).toHaveCount(0);
  await expect(page.locator(".demo-pill")).toHaveText("Super Admin");
  await expect(
    page
      .locator(".stat-card")
      .filter({ hasText: "Total orders" })
      .locator("strong"),
  ).toHaveText("0");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in to workspace", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sign in to workspace", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
});
test("staff navigation and route guards deny administrative screens", async ({
  page,
}) => {
  await service(page, "staff");
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Staff", exact: true }),
  ).toHaveCount(0);
  await page.goto("/staff");
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
  await page.goto("/students");
  await expect(
    page.getByRole("button", { name: "Import students", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Inventory & Cooking", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Inventory & cooking plan", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print cook sheet", exact: true })).toBeDisabled();
  await expect(page.getByText("No confirmed orders for these filters", { exact: true })).toBeVisible();
});
test("deactivation clears an already-open workspace on refresh", async ({
  page,
}) => {
  const mock = await service(page);
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
  mock.deactivate();
  await page.getByRole("button", { name: "Refresh records" }).click();
  await expect(
    page.getByRole("button", { name: "Sign in to workspace", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator("form")
      .getByText("This account is inactive", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
});
test("invalid credentials keep the user outside the workspace", async ({
  page,
}) => {
  const mock = await service(page);
  mock.invalid();
  await login(page);
  await expect(
    page.getByText("Unable to sign in. Check your credentials and try again."),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
});
test("expired identity verification clears cached business access", async ({
  page,
}) => {
  const mock = await service(page);
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
  mock.expire();
  await page.getByRole("button", { name: "Refresh records" }).click();
  await expect(
    page.getByRole("button", { name: "Sign in to workspace", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("form").getByText("Your session expired", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
});
test("password recovery completes setup then requires a fresh login", async ({
  page,
}) => {
  const mock = await service(page);
  await page.goto(mock.setupLink());
  await expect(
    page.getByRole("heading", { name: "Set your password" }),
  ).toBeVisible();
  await page
    .getByLabel("New password", { exact: false })
    .fill("a-new-password-123");
  await page
    .getByLabel("Confirm password", { exact: false })
    .fill("a-new-password-123");
  await page
    .getByRole("button", { name: "Save password", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign in to workspace", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
});
