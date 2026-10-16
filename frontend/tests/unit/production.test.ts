import { describe, it, expect, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { readConfiguration } from "../../src/services/config";
import { SupabaseRepository } from "../../src/services/supabaseRepository";
import { lineTotal, metrics } from "../../src/utils/calculations";
import { orderSchema } from "../../src/services/validation";
import { validateImport } from "../../src/services/studentImport";

const env = {
  VITE_SUPABASE_URL: "https://project.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};
const validOrder = {
  studentId: "student",
  customerName: "Customer",
  customerPhone: "9876543210",
  items: [{ productId: "product", name: "Sweet", price: 100, quantity: 0.5 }],
  advance: 0,
  paymentMethod: "Cash",
  utr: "",
  collectionDate: "2026-10-20",
  collectorType: "Student",
  collectorName: "Student",
};
function fixture(active = true, deletionUnavailable = false, collectionUnavailable = false) {
  const tables: Record<string, Record<string, unknown>[]> = {
    profiles: [
      {
        id: "admin",
        full_name: "Administrator",
        email: "admin@test.invalid",
        role: "super_admin",
        active,
        preferences: {},
      },
    ],
    students: Array.from({ length: 501 }, (_, i) => ({
      id: `student-${i}`,
      name: `Student ${i}`,
      phone: "9876543210",
      standard: "5th",
      division_id: "division",
    })),
    school_divisions: [
      { id: "division", name: "Devi Padmini", standard: "5th" },
    ],
    products: [
      {
        id: "product",
        name: "Current name",
        price_per_kg: "200.00",
        active: true,
        category: "Sweet",
      },
    ],
    orders: [
      {
        id: "order",
        order_number: "JP-10001",
        version: 5,
        status: "Confirmed",
        student_id: "student-0",
        student_name: "Original student",
        student_standard: "5th",
        student_division: "Devi Padmini",
        customer_name: "Customer",
        customer_phone: "9876543210",
        collection_date: "2026-10-20",
        collector_type: "Student",
        collector_name: "Student",
        total_amount: "100.00",
        created_by: "admin",
        updated_by: "admin",
        created_at: "2026-10-11T10:00:00Z",
        updated_at: "2026-10-11T10:00:00Z",
      },
    ],
    order_items: [
      {
        id: "item",
        order_id: "order",
        product_id: "product",
        product_name: "Historical name",
        price_per_kg: "100.00",
        quantity_kg: "1.00",
        position: 1,
      },
    ],
    payments: [10, 20, 5].map((amount, i) => ({
      id: `payment-${i}`,
      order_id: "order",
      amount: String(amount),
      method: "Cash",
      kind: i === 2 ? "refund" : "receipt",
      reference: "",
      received_by: "admin",
      paid_at: `2026-10-11T10:00:0${i}Z`,
    })),
    organization_settings: [
      { id: true, organization: "School", contact: "", address: "" },
    ],
    audit_logs: [],
  };
  const calls: {
    path: string;
    body: Record<string, unknown> | null;
    offset: number;
  }[] = [];
  const fetcher = vi.fn(
    async (url: RequestInfo | URL, options?: RequestInit) => {
      const target = new URL(
        typeof url === "string" ? url : url instanceof URL ? url.href : url.url,
      );
      const path = target.pathname;
      calls.push({
        path,
        body: options?.body ? JSON.parse(String(options.body)) : null,
        offset: Number(target.searchParams.get("offset") ?? 0),
      });
      if (path.includes("/rpc/save_order"))
        return new Response(JSON.stringify("order"), {
          headers: { "Content-Type": "application/json" },
        });
      if (path.includes("/rpc/collect_order")) {
        if (collectionUnavailable) return new Response(JSON.stringify({code:"PGRST202",message:"Function not found"}),{status:404,headers:{"Content-Type":"application/json"}});
        const body=JSON.parse(String(options?.body));
        tables.orders[0].status="Collected";
        tables.orders[0].version=Number(tables.orders[0].version)+2;
        if(body.p_amount>0) tables.payments.push({id:"collection-payment",order_id:body.p_id,amount:String(body.p_amount),method:body.p_method,reference:body.p_reference,kind:"receipt",received_by:"admin",paid_at:"2026-10-16T10:00:00Z"});
        return new Response("null",{headers:{"Content-Type":"application/json"}});
      }
      if (path.includes("/rpc/delete_orders")) {
        if (deletionUnavailable) return new Response(JSON.stringify({code:"PGRST202",message:"Function not found"}),
          {status:404,headers:{"Content-Type":"application/json"}});
        const body = JSON.parse(String(options?.body));
        for (const target of body.p_orders) {
          const row = tables.orders.find((order) => order.id === target.id)!;
          row.deleted_at = "2026-10-14T10:00:00Z";
          row.deleted_by = "admin";
          row.deletion_reason = body.p_reason;
          row.deletion_test_data = body.p_test_cleanup ?? false;
          row.version = Number(row.version) + 1;
        }
        return new Response(JSON.stringify({deleted:body.p_orders.length}), { headers: { "Content-Type":"application/json" } });
      }
      const table = path.split("/").at(-1)!;
      let rows = tables[table] ?? [];
      if (target.searchParams.has("id"))
        rows = rows.filter(
          (r) => r.id === target.searchParams.get("id")?.replace("eq.", ""),
        );
      const offset = Number(target.searchParams.get("offset") ?? 0),
        limit = Number(target.searchParams.get("limit") ?? 500);
      const accept = new Headers(options?.headers).get("Accept");
      return new Response(
        JSON.stringify(
          accept?.includes("object")
            ? rows[0]
            : rows.slice(offset, offset + limit),
        ),
        { headers: { "Content-Type": "application/json" } },
      );
    },
  );
  const client = createClient(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      global: { fetch: fetcher },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  vi.spyOn(client.auth, "getUser").mockResolvedValue({
    data: { user: { id: "admin" } as never },
    error: null,
  });
  return { repo: new SupabaseRepository(client), calls };
}
describe("Supabase order deletion contract", () => {
  it("sends exact versions/retry ID without a supplied actor and retains historical snapshots after refresh", async () => {
    const { repo, calls } = fixture();
    await repo.refresh();
    const before = structuredClone(repo.getSnapshot().orders[0]);
    const payments = structuredClone(repo.getSnapshot().payments);
    const batch = { orders:[{id:before.id,version:before.version!}], reason:"  Test entry  ", requestId:crypto.randomUUID() };
    await repo.deleteOrders(batch, "forged_actor");
    expect(calls.find((call) => call.path.endsWith("/rpc/delete_orders"))?.body).toEqual({
      p_orders:batch.orders, p_reason:"Test entry", p_request_id:batch.requestId, p_allow_collected:false,
    });
    expect(repo.getSnapshot().orders).toHaveLength(0);
    expect(repo.getSnapshot().deletedOrders![0]).toMatchObject({id:before.id,items:before.items,deletionReason:"Test entry"});
    expect(repo.getSnapshot().payments).toEqual(payments);
    expect(metrics(repo.getSnapshot().orders,repo.getSnapshot().payments).count).toBe(0);
  });
  it("reports the pending migration clearly and leaves records unchanged when the RPC is unavailable", async () => {
    const { repo } = fixture(true,true);
    await repo.refresh();
    const before = structuredClone(repo.getSnapshot());
    await expect(repo.deleteOrders({orders:[{id:"order",version:5}],reason:"Test order",requestId:crypto.randomUUID()},"admin"))
      .rejects.toThrow("202610140002_collected_order_deletion.sql");
    expect(repo.getSnapshot()).toEqual(before);
  });
  it("sends explicit test confirmation, maps the test archive and reports its required migration",async()=>{
    const {repo,calls}=fixture();
    await repo.refresh();
    const batch={orders:[{id:"order",version:5}],reason:"Only test data",requestId:crypto.randomUUID(),allowCollected:true,testCleanup:true};
    await repo.deleteOrders(batch,"forged_actor");
    expect(calls.find(c => c.path.endsWith('/rpc/delete_orders'))?.body).toMatchObject({p_test_cleanup:true,p_allow_collected:true});
    expect(repo.getSnapshot().deletedOrders![0].deletionTestData).toBe(true);
    const unavailable=fixture(true,true).repo;
    await unavailable.refresh();
    await expect(unavailable.deleteOrders(batch,"admin")).rejects.toThrow("202610140003_test_order_cleanup.sql");
  });
});

describe("production configuration", () => {
  it("requires configuration by default and forbids mock mode in production", () => {
    expect(readConfiguration({}).mode).toBe("supabase");
    expect(readConfiguration({}).error).toContain("Configure");
    expect(readConfiguration({ ...env, PROD: true }).error).toBe("");
    expect(
      readConfiguration({ VITE_DATA_MODE: "mock", PROD: true }).error,
    ).toContain("disabled");
  });
  it("rejects privileged keys and remote HTTP URLs", () => {
    expect(
      readConfiguration({
        ...env,
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_sensitive",
      }).error,
    ).toContain("server secret");
    const privileged = `header.${btoa(JSON.stringify({ role: "service_role" }))}.signature`;
    expect(
      readConfiguration({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: privileged })
        .error,
    ).toContain("Privileged");
    expect(
      readConfiguration({
        ...env,
        VITE_SUPABASE_URL: "http://project.supabase.co",
      }).error,
    ).toContain("HTTPS");
  });
});
describe("financial and import boundaries", () => {
  it("matches decimal half-kilogram rounding and rejects unsupported fractions", () => {
    expect(
      lineTotal({
        productId: "product",
        name: "Sweet",
        price: 0.29,
        quantity: 0.5,
      }),
    ).toBe(0.15);
    expect(
      orderSchema.safeParse({
        ...validOrder,
        items: [{ ...validOrder.items[0], quantity: 0.3 }],
      }).success,
    ).toBe(false);
    expect(
      orderSchema.safeParse({ ...validOrder, advance: 0.001 }).success,
    ).toBe(false);
  });
  it("allows reviewed siblings sharing a phone and blocks exact duplicates", () => {
    const rows = [
      {
        name: "First child",
        phone: "0123456789",
        standard: "5th",
        division: "Devi Padmini",
      },
      {
        name: "Second child",
        phone: "0123456789",
        standard: "5th",
        division: "Devi Padmini",
      },
    ];
    const mapping = {
      name: "name",
      phone: "phone",
      standard: "standard",
      division: "division",
    };
    const result = validateImport(rows, mapping, []);
    expect(result.valid).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.valid[0].phone).toBe("0123456789");
    expect(
      validateImport([rows[0]], mapping, result.valid).errors[0].message,
    ).toContain("Duplicate student record");
  });
});
describe("Supabase adapter contract (simulated HTTP)", () => {
  it("fetches beyond one page and preserves database numbers, snapshots and the net ledger", async () => {
    const { repo, calls } = fixture();
    await repo.refresh();
    const state = repo.getSnapshot();
    expect(state.students).toHaveLength(501);
    expect(
      calls.some((c) => c.path.endsWith("/students") && c.offset === 500),
    ).toBe(true);
    expect(state.orders[0].number).toBe("JP-10001");
    expect(state.orders[0].items[0].price).toBe(100);
    expect(state.orders[0].studentSnapshot?.name).toBe("Original student");
    expect(state.orders[0].advance).toBe(25);
    expect(metrics(state.orders, state.payments).collected).toBe(25);
    repo.reset();
    expect(repo.getSnapshot().orders).toHaveLength(0);
  });
  it("rejects inactive identities before fetching business records", async () => {
    const { repo, calls } = fixture(false);
    await expect(repo.refresh()).rejects.toThrow("inactive");
    expect(calls.some((c) => c.path.endsWith("/orders"))).toBe(false);
    expect(repo.getSnapshot().orders).toHaveLength(0);
  });
  it("keeps the form version and retry key; server derives the actor", async () => {
    const { repo, calls } = fixture();
    await repo.refresh();
    const original = { ...repo.getSnapshot().orders[0], version: 2 };
    await repo.saveOrder(
      original,
      "untrusted-actor",
      "Confirmed",
      "order",
      "retry-key",
    );
    const body = calls.find((c) => c.path.endsWith("/rpc/save_order"))!.body!;
    expect(body.p_version).toBe(2);
    expect(body.p_request_id).toBe("retry-key");
    expect(body).not.toHaveProperty("p_actor");
  });
  it("sends absent student phones as NULL without manufacturing contact details", async () => {
    const { repo, calls } = fixture();
    await repo.refresh();
    await repo.importStudents(
      [
        {
          id: "unused-client-id",
          name: "No phone child",
          phone: "",
          standard: "5th",
          division: "Devi Padmini",
        },
        {
          id: "unused-second-id",
          name: "Phone child",
          phone: "0123456789",
          standard: "5th",
          division: "Rana Pratap",
        },
      ],
      "untrusted-actor",
      "batch-id",
    );
    const body = calls.find((call) =>
      call.path.endsWith("/rpc/import_students"),
    )!.body!;
    expect(body.p_rows).toEqual([
      {
        name: "No phone child",
        phone: null,
        standard: "5th",
        division: "Devi Padmini",
      },
      {
        name: "Phone child",
        phone: "0123456789",
        standard: "5th",
        division: "Rana Pratap",
      },
    ]);
    expect(body.p_batch_id).toBe("batch-id");
    expect(body).not.toHaveProperty("p_actor");
  });
});

describe("collection RPC contract",()=>{
 it("submits one versioned atomic call, derives the actor from Auth and refreshes immutable receipt snapshots",async()=>{
  const {repo,calls}=fixture(); await repo.refresh();
  const requestId=crypto.randomUUID();
  await repo.collectOrder({orderId:"order",version:5,amount:75,method:"Online",utr:"FINAL-75",requestId},"forged-actor");
  expect(calls.filter(call=>call.path.endsWith('/rpc/collect_order'))).toHaveLength(1);
  expect(calls.find(call=>call.path.endsWith('/rpc/collect_order'))?.body).toEqual({p_id:"order",p_version:5,p_request_id:requestId,p_amount:75,p_method:"Online",p_reference:"FINAL-75"});
  expect(repo.getSnapshot().orders[0]).toMatchObject({status:"Collected",advance:100,number:"JP-10001"});
  expect(repo.getSnapshot().orders[0].items[0]).toMatchObject({name:"Historical name",price:100});
  expect(repo.getSnapshot().payments).toHaveLength(4);
 });
 it("identifies the new migration when the deployed RPC is missing",async()=>{
  const {repo}=fixture(true,false,true); await repo.refresh();
  await expect(repo.collectOrder({orderId:"order",version:5,amount:75,method:"Cash",utr:"",requestId:crypto.randomUUID()},"admin")).rejects.toThrow("202610160001_collection_checkout.sql");
 });
});
