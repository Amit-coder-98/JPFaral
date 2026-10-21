import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { buildStudentDivisionRepairSql } from "../maintenance/studentDivisionRepair.mjs";
import { collectionCases } from "./collectionCases.mjs";
import { receiptNumberCases } from "./receiptNumberCases.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const admin = randomUUID(),
  staff = randomUUID(),
  inactive = randomUUID();
const productId = randomUUID(),
  studentId = randomUUID();
let cluster, pool, testPassword, legacyOrderId;
const legacySeedId = randomUUID();
const upgradeName = "202610130001_marathi_rate_card.sql";
const deletionName = "202610140001_order_deletion.sql";
const deletionOverrideName = "202610140002_collected_order_deletion.sql";
const testCleanupName = "202610140003_test_order_cleanup.sql";
const collectionName = "202610160001_collection_checkout.sql";
const receiptName = "202610160002_reusable_receipt_numbers.sql";
const revisedRateName = "202610210001_nutritious_laddu_rate.sql";
const collectionSql = () => fs.readFile(path.join(root, "supabase/migrations", collectionName), "utf8");
const testCleanupSql = () => fs.readFile(path.join(root, "supabase/migrations", testCleanupName), "utf8");
const deletionOverrideSql = () => fs.readFile(path.join(root, "supabase/migrations", deletionOverrideName), "utf8");
const deletionSql = () => fs.readFile(path.join(root, "supabase/migrations", deletionName), "utf8");
const upgradeSql = () =>
  fs.readFile(path.join(root, "supabase/migrations", upgradeName), "utf8");
const approvedRates = [
  ["मोतीचूर लाडू", 110],
  ["बेसन लाडू (तुपातील)", 165],
  ["रवा लाडू (तुपातील)", 140],
  ["पौष्टिक लाडू (तुपातील)", 150],
  ["करंजी (तुपातील)", 140],
  ["शंकरपाळी", 110],
  ["चिरोटे", 125],
  ["बालुशाही", 110],
  ["काजू कतली", 350],
  ["साधा चिवडा (मुरमुरे)", 100],
  ["मका चिवडा", 110],
  ["पोहे चिवडा", 110],
  ["गहू चिवडा", 100],
  ["मसाला शेव", 120],
  ["भावनागरी शेव", 120],
  ["बारीक शेव", 120],
  ["चकली", 110],
  ["खारी बुंदी", 115],
  ["खारी शंकरपाळी", 120],
  ["लाल एडमी", 100],
  ["हिरवे एडमी", 100],
  ["पेरी स्टिक", 100],
  ["मिंट स्टिक", 100],
  ["मूग बाईट", 100],
  ["पालक चुरचुरे", 100],
  ["चटपटीत चुरचुरे", 100],
];
const input = (overrides = {}) => ({
  studentId,
  customerName: "Test customer",
  customerPhone: "9876543210",
  items: [{ productId, name: "Forged name", price: 123.5, quantity: 0.5 }],
  advance: 10,
  paymentMethod: "Cash",
  utr: "",
  collectionDate: "2026-10-20",
  collectorType: "Student",
  collectorName: "Test student",
  ...overrides,
});
async function asUser(actor, sql, args = [], role = "authenticated") {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
      actor ?? "",
    ]);
    const result = await client.query(sql, args);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
const save = (
  data = input(),
  actor = staff,
  id = null,
  version = null,
  status = "Confirmed",
  requestId = randomUUID(),
) =>
  asUser(actor, "select public.save_order($1,$2,$3,$4,$5) id", [
    data,
    requestId,
    id,
    version,
    status,
  ]).then((r) => r.rows[0].id);
const row = (id) =>
  pool
    .query("select * from public.orders where id=$1", [id])
    .then((r) => r.rows[0]);
const pay = (
  id,
  amount,
  method = "Cash",
  reference = "",
  kind = "receipt",
  actor = staff,
  request = randomUUID(),
) =>
  asUser(actor, "select public.record_payment($1,$2,$3,$4,$5,$6) id", [
    id,
    amount,
    method,
    reference,
    request,
    kind,
  ]).then((r) => r.rows[0].id);

async function executeRepair(sql) {
  const client = await pool.connect();
  try {
    return await client.query(sql);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

before(
  async () => {
    const dbDir = path.join(root, ".test-db", randomUUID());
    testPassword = randomUUID();
    cluster = new EmbeddedPostgres({
      databaseDir: dbDir,
      user: "postgres",
      password: testPassword,
      port: 55439,
      persistent: true,
      postgresFlags: ["-h", "127.0.0.1"],
      onLog: () => {},
      onError: () => {},
    });
    await cluster.initialise();
    await cluster.start();
    const initial = cluster.getPgClient();
    await initial.connect();
    await initial.query(
      "create database jpfaral_security_tests template template0 encoding 'UTF8' locale 'C'",
    );
    await initial.end();
    pool = new pg.Pool({
      host: "127.0.0.1",
      port: 55439,
      user: "postgres",
      password: testPassword,
      database: "jpfaral_security_tests",
      max: 12,
    });
    // The native test server uses a random local password; no production database is used.
    await pool.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    for (const name of (
      await fs.readdir(path.join(root, "supabase/migrations"))
    )
      .filter((n) => n.endsWith(".sql") && n !== upgradeName && n !== deletionName && n !== deletionOverrideName && n !== testCleanupName && n !== collectionName && n !== receiptName && n !== revisedRateName)
      .sort()) {
      try {
        await pool.query(
          await fs.readFile(
            path.join(root, "supabase/migrations", name),
            "utf8",
          ),
        );
      } catch (error) {
        error.message = `${name}: ${error.message}`;
        throw error;
      }
    }
    await pool.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3),($4,$5,$6),($7,$8,$9)",
      [
        admin,
        "admin@test.invalid",
        { full_name: "Test admin", role: "super_admin", active: true },
        staff,
        "staff@test.invalid",
        { full_name: "Test staff" },
        inactive,
        "inactive@test.invalid",
        { full_name: "Inactive staff" },
      ],
    );
    await pool.query(
      "update public.profiles set role='super_admin',active=true where id=$1",
      [admin],
    );
    await pool.query("update public.profiles set active=true where id=$1", [
      staff,
    ]);
    await pool.query(
      "insert into public.products(id,name,price_per_kg,category) values($1,'Test laddu',123.50,'Sweet')",
      [productId],
    );
    await pool.query(
      "insert into public.students(id,name,phone,standard,division_id) select $1,'Test student','9876543210','5th',id from public.school_divisions where name='Devi Padmini'",
      [studentId],
    );
    // Exercise a genuine upgrade of an existing bill and exact-name catalogue row.
    await pool.query(
      "insert into public.products(id,name,price_per_kg,category) values($1,'मोतीचूर लाडू',400,'Sweet')",
      [legacySeedId],
    );
    legacyOrderId = await save(
      input({
        items: [{ productId: legacySeedId, price: 400, quantity: 0.5 }],
      }),
    );
    await pool.query("update public.products set active=false where id=$1", [
      legacySeedId,
    ]);
    await pool.query(await upgradeSql());
    await pool.query(await deletionSql());
    await pool.query(await deletionOverrideSql());
    await pool.query(await testCleanupSql());
  },
  { timeout: 180000 },
);
after(async () => {
  if (pool) await pool.end();
  if (cluster) await cluster.stop();
});

test("the 26 exact Marathi rates are seeded per kg without duplicating an existing product", async () => {
  const products = (
    await pool.query(
      "select id,name,price_per_kg,active from public.products where name=any($1)",
      [approvedRates.map((r) => r[0])],
    )
  ).rows;
  assert.equal(products.length, 26);
  for (const [name, rate] of approvedRates) {
    const product = products.find((p) => p.name === name);
    assert.equal(Number(product.price_per_kg), rate * 4);
  }
  const existing = products.find((p) => p.name === "मोतीचूर लाडू");
  assert.equal(existing.id, legacySeedId);
  assert.equal(existing.active, false);
  const bill = await row(legacyOrderId);
  assert.equal(bill.total_amount, "200.00");
  assert.equal(
    (
      await pool.query(
        "select price_per_kg,line_total from public.order_items where order_id=$1",
        [legacyOrderId],
      )
    ).rows[0].price_per_kg,
    "400.00",
  );
  await asUser(admin, "update public.products set active=true where id=$1", [
    legacySeedId,
  ]);
});

test("reapplying the upgrade preserves IDs, bills, receipts and audit events without duplicate seeds", async () => {
  const snapshot = async () => ({
    products: (await pool.query("select * from public.products order by id"))
      .rows,
    orders: (await pool.query("select * from public.orders order by id")).rows,
    items: (await pool.query("select * from public.order_items order by id"))
      .rows,
    payments: (await pool.query("select * from public.payments order by id"))
      .rows,
    audit: (await pool.query("select * from public.audit_logs order by id"))
      .rows,
  });
  const before = await snapshot();
  await pool.query(await upgradeSql());
  await pool.query(await deletionSql());
  await pool.query(await deletionOverrideSql());
  await pool.query(await testCleanupSql());
  assert.deepEqual(await snapshot(), before);
});

test("ambiguous duplicate catalogue names stop a seed replay atomically", async () => {
  const duplicate = randomUUID();
  await pool.query(
    "insert into public.products(id,name,price_per_kg,category) values($1,'मोतीचूर लाडू',500,'Sweet')",
    [duplicate],
  );
  const before = (await pool.query("select * from public.products order by id"))
    .rows;
  try {
    await assert.rejects(pool.query(await upgradeSql()), /duplicate product/);
    assert.deepEqual(
      (await pool.query("select * from public.products order by id")).rows,
      before,
    );
  } finally {
    await pool.query("delete from public.products where id=$1", [duplicate]);
  }
});

test("quarter kilograms and large quantities use authoritative decimal totals", async () => {
  for (const [quantity, total] of [
    [0.25, "110.00"],
    [0.5, "220.00"],
    [0.75, "330.00"],
    [1, "440.00"],
    [1.25, "550.00"],
    [1.5, "660.00"],
    [10, "4400.00"],
    [100.25, "44110.00"],
    [9999.75, "4399890.00"],
  ]) {
    const id = await save(
      input({
        items: [{ productId: legacySeedId, price: 440, quantity }],
        advance: 0,
      }),
    );
    assert.equal((await row(id)).total_amount, total);
  }
  // Legacy paise snapshots retain PostgreSQL half-up rounding at quarter quantities.
  const id = await save(
    input({ items: [{ productId, price: 123.5, quantity: 0.25 }], advance: 0 }),
  );
  assert.equal((await row(id)).total_amount, "30.88");
});

test("invalid quarter increments, non-finite values and blank quantities roll back even for drafts", async () => {
  await assert.rejects(
    save(
      input({
        items: [{ productId: legacySeedId, price: 440, quantity: 0.3 }],
        advance: 0,
      }),
    ),
    /प्रमाण.*0\.25/,
  );
  const before = (await pool.query("select count(*) from public.orders"))
    .rows[0].count;
  for (const quantity of [
    0.3,
    0,
    -1,
    0.251,
    10000,
    null,
    "",
    "invalid",
    "NaN",
    "Infinity",
    "-Infinity",
  ]) {
    const data = input({
      items: [{ productId: legacySeedId, price: 440, quantity }],
      advance: 0,
    });
    await assert.rejects(save(data));
    await assert.rejects(save(data, staff, null, null, "Draft"));
  }
  assert.equal(
    (await pool.query("select count(*) from public.orders")).rows[0].count,
    before,
  );
  const constraint = (
    await pool.query(
      "select pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.order_items'::regclass and conname='order_items_quantity_quarter_kg_check'",
    )
  ).rows[0].definition;
  assert.match(constraint, /0\.25/);
  assert.match(constraint, /9999\.75/);
});

test("a large order cannot overflow the total column or leave partial records", async () => {
  const ids = [randomUUID(), randomUUID()];
  for (const id of ids)
    await asUser(
      admin,
      "insert into public.products(id,name,price_per_kg,category) values($1,'Maximum rate',1000000,'Sweet')",
      [id],
    );
  const before = (await pool.query("select count(*) from public.orders"))
    .rows[0].count;
  await assert.rejects(
    save(
      input({
        items: ids.map((productId) => ({
          productId,
          price: 1000000,
          quantity: 9999.75,
        })),
        advance: 0,
      }),
    ),
    /overflow/,
  );
  assert.equal(
    (await pool.query("select count(*) from public.orders")).rows[0].count,
    before,
  );
});

test("failed invitation cleanup cascades only unused profiles", async () => {
  const id = randomUUID();
  await pool.query("insert into auth.users(id,email) values($1,$2)", [
    id,
    "cleanup@test.invalid",
  ]);
  await pool.query("delete from auth.users where id=$1", [id]);
  assert.equal(
    (await pool.query("select * from public.profiles where id=$1", [id]))
      .rowCount,
    0,
  );
});

test("profile preferences cannot carry role fields; active access is checked on every call", async () => {
  await asUser(staff, "select public.update_my_profile($1,$2)", [
    "Test staff",
    { accent: "#b56735", compact: true, reduceMotion: false },
  ]);
  for (const preferences of [
    {},
    {
      accent: "#b56735",
      compact: true,
      reduceMotion: false,
      role: "super_admin",
    },
    { accent: null, compact: true, reduceMotion: false },
  ])
    await assert.rejects(
      asUser(staff, "select public.update_my_profile($1,$2)", [
        "Test staff",
        preferences,
      ]),
      /Invalid display preferences/,
    );
  const profile = (
    await pool.query("select * from public.profiles where id=$1", [staff])
  ).rows[0];
  assert.equal(profile.role, "staff");
  await asUser(admin, "select public.admin_update_profile($1,$2,$3,$4)", [
    staff,
    "Test staff",
    "staff",
    false,
  ]);
  try {
    assert.equal(
      (await asUser(staff, "select * from public.students")).rowCount,
      0,
    );
    await assert.rejects(save(), /active authorized/);
  } finally {
    await asUser(admin, "select public.admin_update_profile($1,$2,$3,$4)", [
      staff,
      "Test staff",
      "staff",
      true,
    ]);
  }
});

test("staff direct catalog updates are denied by RLS", async () => {
  assert.equal(
    (
      await asUser(
        staff,
        "update public.products set price_per_kg=1 where id=$1 returning id",
        [productId],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await pool.query("select price_per_kg from public.products where id=$1", [
        productId,
      ])
    ).rows[0].price_per_kg,
    "123.50",
  );
});

test("all exposed tables have RLS and financial tables reject direct writes", async () => {
  const tables = await pool.query(
    "select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'",
  );
  assert.equal(tables.rows.length, 9);
  assert.ok(tables.rows.every((t) => t.relrowsecurity));
  for (const table of [
    "orders",
    "order_items",
    "payments",
    "profiles",
    "students",
    "audit_logs",
  ])
    assert.equal(
      (
        await pool.query(
          "select has_table_privilege('authenticated',$1,'INSERT') permitted",
          ["public." + table],
        )
      ).rows[0].permitted,
      false,
    );
});
test("anonymous requests cannot read records or call financial functions", async () => {
  await assert.rejects(
    asUser(null, "select * from public.students", [], "anon"),
    /permission denied/,
  );
  await assert.rejects(
    asUser(
      null,
      "select public.save_order($1,$2)",
      [input(), randomUUID()],
      "anon",
    ),
    /permission denied/,
  );
});
test("active staff read shared records; inactive staff have no business access", async () => {
  assert.equal(
    (await asUser(staff, "select * from public.students")).rowCount,
    1,
  );
  assert.equal(
    (await asUser(inactive, "select * from public.students")).rowCount,
    0,
  );
  await assert.rejects(save(input(), inactive), /active authorized/);
});
test("user metadata cannot self-assign an administrative role or activation", async () => {
  const id = randomUUID();
  await pool.query(
    "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
    [
      id,
      "forged@test.invalid",
      { full_name: "Forged admin", role: "super_admin", active: true },
    ],
  );
  const profile = (
    await pool.query("select * from public.profiles where id=$1", [id])
  ).rows[0];
  assert.equal(profile.role, "staff");
  assert.equal(profile.active, false);
  await assert.rejects(
    asUser(staff, "update public.profiles set role='super_admin' where id=$1", [
      staff,
    ]),
    /permission denied/,
  );
  await assert.rejects(
    asUser(staff, "select public.admin_update_profile($1,$2,$3,$4)", [
      staff,
      "Bad admin",
      "super_admin",
      true,
    ]),
    /active authorized/,
  );
});
test("catalog and organization operations enforce admin permissions", async () => {
  await assert.rejects(
    asUser(
      staff,
      "insert into public.products(name,price_per_kg,category) values('Denied',20,'Sweet')",
    ),
    /row-level security/,
  );
  await assert.rejects(
    asUser(staff, "select public.update_organization('Denied','','')"),
    /active authorized/,
  );
  await asUser(admin, "select public.update_organization('Test school','','')");
  await assert.rejects(
    asUser(
      admin,
      "insert into public.products(name,price_per_kg,category) values('Invalid',-1,'Sweet')",
    ),
    /check constraint/,
  );
});
test("authoritative decimal totals ignore supplied totals and names", async () => {
  const id = await save(input({ total_amount: 0 }));
  assert.equal((await row(id)).total_amount, "61.75");
  const item = (
    await pool.query("select * from public.order_items where order_id=$1", [id])
  ).rows[0];
  assert.equal(item.product_name, "Test laddu");
  assert.equal(item.line_total, "61.75");
  assert.equal(
    (
      await pool.query(
        "select sum(amount) total from public.payments where order_id=$1",
        [id],
      )
    ).rows[0].total,
    "10.00",
  );
});
test("invalid prices, quantities, duplicate products and item limits roll back", async () => {
  const before = (await pool.query("select count(*) from public.orders"))
    .rows[0].count;
  for (const data of [
    input({ items: [{ productId, price: 1, quantity: 1 }] }),
    input({ items: [{ productId, price: 123.5, quantity: 0 }] }),
    input({ items: [{ productId, price: 123.5, quantity: 0.3 }] }),
    input({ items: [...input().items, ...input().items] }),
    input({ items: Array(31).fill(input().items[0]) }),
    input({ advance: 99 }),
    input({ advance: -1 }),
  ])
    await assert.rejects(save(data));
  assert.equal(
    (await pool.query("select count(*) from public.orders")).rows[0].count,
    before,
  );
  assert.equal(
    (
      await pool.query(
        "select count(*) from public.order_items i left join public.orders o on o.id=i.order_id where o.id is null",
      )
    ).rows[0].count,
    "0",
  );
});
test("online advance requires UTR and a failure leaves no partial order", async () => {
  const before = (await pool.query("select count(*) from public.orders"))
    .rows[0].count;
  await assert.rejects(save(input({ paymentMethod: "Online" })), /UTR/);
  assert.equal(
    (await pool.query("select count(*) from public.orders")).rows[0].count,
    before,
  );
  await save(input({ paymentMethod: "Online", utr: "TEST-" + randomUUID() }));
});
test("concurrent order creation has unique database numbers and idempotent retries", async () => {
  const ids = await Promise.all(Array.from({ length: 12 }, () => save()));
  const numbers = (
    await pool.query(
      "select order_number from public.orders where id=any($1::uuid[])",
      [ids],
    )
  ).rows.map((o) => o.order_number);
  assert.equal(new Set(numbers).size, 12);
  const request = randomUUID();
  const repeated = await Promise.all(
    Array.from({ length: 4 }, () =>
      save(input(), staff, null, null, "Confirmed", request),
    ),
  );
  assert.equal(new Set(repeated).size, 1);
});
test("order numbers do not truncate beyond 9999", async () => {
  await pool.query("select setval('private.order_number_seq',9999)");
  const id = await save();
  assert.equal((await row(id)).order_number, "JP-10000");
});
test("catalog changes preserve historical price and name snapshots", async () => {
  const id = await save();
  const header = await row(id);
  await asUser(
    admin,
    "update public.products set name='Changed name',price_per_kg=200 where id=$1",
    [productId],
  );
  await save(input(), staff, id, header.version);
  assert.equal((await row(id)).total_amount, "61.75");
  assert.equal(
    (
      await pool.query(
        "select product_name from public.order_items where order_id=$1",
        [id],
      )
    ).rows[0].product_name,
    "Test laddu",
  );
  await assert.rejects(save(), /price changed/);
  const fresh = await save(
    input({ items: [{ productId, price: 200, quantity: 0.5 }] }),
  );
  assert.equal((await row(fresh)).total_amount, "100.00");
  await asUser(
    admin,
    "update public.products set name='Test laddu',price_per_kg=123.50 where id=$1",
    [productId],
  );
});
test("stale edits and invalid transitions are rejected; collected bills are immutable", async () => {
  const id = await save();
  const header = await row(id);
  await save(input(), staff, id, header.version);
  await assert.rejects(save(input(), staff, id, header.version), /changed/);
  await assert.rejects(
    asUser(staff, "select public.set_order_status($1,$2,$3)", [
      id,
      "Collected",
      (await row(id)).version,
    ]),
    /transition/,
  );
  for (const status of ["Ready", "Collected"])
    await asUser(staff, "select public.set_order_status($1,$2,$3)", [
      id,
      status,
      (await row(id)).version,
    ]);
  await assert.rejects(
    save(input(), staff, id, (await row(id)).version, "Collected"),
    /cannot be edited/,
  );
});
test("multiple receipts, refunds and retry IDs reconcile without rewriting history", async () => {
  const id = await save();
  const first = (
    await pool.query("select * from public.payments where order_id=$1", [id])
  ).rows[0];
  const request = randomUUID();
  const second = await pay(id, 20, "Cash", "", "receipt", staff, request);
  assert.equal(
    await pay(id, 20, "Cash", "", "receipt", staff, request),
    second,
  );
  await pay(id, 5, "Cash", "", "refund", admin);
  const records = (
    await pool.query(
      "select * from public.payments where order_id=$1 order by paid_at",
      [id],
    )
  ).rows;
  assert.equal(records.length, 3);
  assert.deepEqual(records[0], first);
  assert.equal(
    (
      await pool.query(
        "select sum(case kind when 'receipt' then amount else -amount end) total from public.payments where order_id=$1",
        [id],
      )
    ).rows[0].total,
    "25.00",
  );
  await assert.rejects(pay(id, 100), /exceeds/);
  await assert.rejects(pay(id, 1, "Online"), /UTR/);
  await assert.rejects(pay(id, 1, "Cash", "", "refund"), /active authorized/);
  await assert.rejects(
    save(input({ advance: 40 }), staff, id, (await row(id)).version),
    /immutable/,
  );
});
test("concurrent receipts cannot overpay an order", async () => {
  const id = await save(input({ advance: 0 }));
  const attempts = await Promise.allSettled([pay(id, 50), pay(id, 50)]);
  assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
});
test("imports permit shared family phones, reject duplicates and retry atomically", async () => {
  const rows = [
    {
      name: "Test sibling one",
      phone: "9876543210",
      standard: "5th",
      division: "Devi Padmini",
    },
    {
      name: "Test sibling two",
      phone: "9876543210",
      standard: "6th",
      division: "Mahaveer",
    },
  ];
  const batch = randomUUID();
  const execute = (data, key = batch, actor = admin) =>
    asUser(actor, "select public.import_students($1,$2) result", [
      JSON.stringify(data),
      key,
    ]);
  await assert.rejects(execute(rows, batch, staff), /active authorized/);
  assert.deepEqual((await execute(rows)).rows[0].result, {
    inserted: 2,
    skipped: 0,
  });
  assert.deepEqual((await execute(rows)).rows[0].result, {
    inserted: 0,
    skipped: 2,
  });
  await assert.rejects(execute(rows, randomUUID()), /Duplicate/);
  const before = (await pool.query("select count(*) from public.students"))
    .rows[0].count;
  await assert.rejects(
    execute(
      [
        { ...rows[0], name: "New atomic test" },
        { ...rows[1], division: "Invalid" },
      ],
      randomUUID(),
    ),
    /Invalid/,
  );
  assert.equal(
    (await pool.query("select count(*) from public.students")).rows[0].count,
    before,
  );
});
test("audit events are database-generated, immutable and detailed only for admins", async () => {
  const id = await save();
  const entries = (
    await asUser(admin, "select * from public.audit_logs where record_id=$1", [
      id,
    ])
  ).rows;
  assert.ok(entries.length >= 2);
  assert.ok(entries.every((e) => e.actor_id === staff));
  assert.equal(
    (await asUser(staff, "select * from public.audit_logs")).rowCount,
    0,
  );
  await assert.rejects(
    asUser(admin, "delete from public.audit_logs"),
    /permission denied/,
  );
  const personal = (
    await asUser(staff, "select * from public.my_activity(0,500)")
  ).rows;
  assert.ok(personal.length > 0);
  assert.ok(
    personal.every((e) => e.actor_id === staff && !("previous_values" in e)),
  );
});

test("reviewed student imports support absent phones, preserve existing phones and retry safely", async () => {
  const batch = randomUUID();
  const rows = [
    { name: "No phone child one", standard: "5th", division: "Devi Padmini" },
    {
      name: "No phone child two",
      phone: "",
      standard: "5th",
      division: "Rana Pratap",
    },
  ];
  const execute = (data, key = batch, actor = admin) =>
    asUser(actor, "select public.import_students($1,$2) result", [
      JSON.stringify(data),
      key,
    ]);
  await assert.rejects(execute(rows, batch, staff), /active authorized/);
  assert.deepEqual((await execute(rows)).rows[0].result, {
    inserted: 2,
    skipped: 0,
  });
  assert.deepEqual((await execute(rows)).rows[0].result, {
    inserted: 0,
    skipped: 2,
  });
  const stored = (
    await pool.query(
      "select phone from public.students where name like 'No phone child %'",
    )
  ).rows;
  assert.equal(stored.length, 2);
  assert.ok(stored.every((s) => s.phone === null));
  await assert.rejects(execute(rows, randomUUID()), /Duplicate/);
  await assert.rejects(
    execute([{ ...rows[0], phone: "9876543210" }], randomUUID()),
    /Duplicate/,
  );
  await assert.rejects(
    execute(
      [{ name: "Test student", standard: "5th", division: "Devi Padmini" }],
      randomUUID(),
    ),
    /Duplicate/,
  );
  assert.equal(
    (
      await pool.query("select phone from public.students where id=$1", [
        studentId,
      ])
    ).rows[0].phone,
    "9876543210",
  );
  const before = (await pool.query("select count(*) from public.students"))
    .rows[0].count;
  await assert.rejects(
    execute(
      [
        { ...rows[0], name: "Rollback phone test" },
        { ...rows[1], name: "Invalid phone test", phone: "123" },
      ],
      randomUUID(),
    ),
    /10 digits/,
  );
  await assert.rejects(
    execute(
      [{ ...rows[0], name: "Unreviewed division", division: "A" }],
      randomUUID(),
    ),
    /Invalid standard and division/,
  );
  assert.equal(
    (await pool.query("select count(*) from public.students")).rows[0].count,
    before,
  );
  const phoneLess = (
    await pool.query(
      "select id from public.students where name='No phone child one'",
    )
  ).rows[0].id;
  await assert.rejects(
    save(input({ studentId: phoneLess, customerPhone: "" })),
    /check constraint/,
  );
  const id = await save(
    input({ studentId: phoneLess, customerPhone: "9876543210" }),
  );
  assert.equal((await row(id)).customer_phone, "9876543210");
});

test("missing-phone identities stay unique and the optional-phone migration replays without changing data", async () => {
  await assert.rejects(
    pool.query(
      "insert into public.students(name,phone,standard,division_id) select 'No phone child one',null,'5th',id from public.school_divisions where name='Devi Padmini'",
    ),
    /unique constraint/,
  );
  const before = (await pool.query("select * from public.students order by id"))
    .rows;
  await pool.query(
    await fs.readFile(
      path.join(
        root,
        "supabase/migrations/202610130002_student_report_import.sql",
      ),
      "utf8",
    ),
  );
  assert.deepEqual(
    (await pool.query("select * from public.students order by id")).rows,
    before,
  );
  assert.equal(
    (
      await pool.query(
        "select indnullsnotdistinct from pg_index where indexrelid='public.students_identity'::regclass",
      )
    ).rows[0].indnullsnotdistinct,
    true,
  );
});

test("reviewed division repair preserves identities, contact data, orders, receipts and immutable audit history", async () => {
  const batch = randomUUID();
  const childName = "Repair eighth B's $jpfaral_repair$";
  await asUser(admin, "select public.import_students($1,$2)", [
    JSON.stringify([
      { name: "Repair eighth A", standard: "8th", division: "Rani Channamma" },
      { name: childName, standard: "8th", division: "Rani Channamma" },
    ]), batch,
  ]);
  const child = (await pool.query("select * from public.students where name=$1", [childName])).rows[0];
  const orderId = await save(input({studentId: child.id}));
  const orderBefore = await row(orderId);
  const paymentsBefore = (await pool.query("select * from public.payments where order_id=$1 order by id", [orderId])).rows;
  const auditBefore = (await pool.query("select * from public.audit_logs where record_id=$1 order by created_at,id", [child.id])).rows;
  const count = Number((await pool.query("select count(*) from public.students")).rows[0].count);
  const changes = [{id:child.id,name:child.name,standard:"8th",from:"Rani Channamma",to:"Rani Laxmibai",batch}];
  await executeRepair(buildStudentDivisionRepairSql(changes,count,{dryRun:true}));
  assert.deepEqual((await pool.query("select * from public.students where id=$1", [child.id])).rows[0],child);
  assert.deepEqual((await pool.query("select * from public.audit_logs where record_id=$1 order by created_at,id", [child.id])).rows,auditBefore);
  await executeRepair(buildStudentDivisionRepairSql(changes,count));
  const after = (await pool.query("select * from public.students where id=$1", [child.id])).rows[0];
  assert.equal(after.division_id,8);
  for (const field of Object.keys(child).filter(k=>!['division_id','updated_at'].includes(k))) assert.deepEqual(after[field],child[field]);
  assert.equal((await pool.query("select division_id from public.students where name='Repair eighth A'")).rows[0].division_id,7);
  assert.deepEqual(await row(orderId),orderBefore);
  assert.deepEqual((await pool.query("select * from public.payments where order_id=$1 order by id", [orderId])).rows,paymentsBefore);
  const audits = (await pool.query("select * from public.audit_logs where record_id=$1 order by created_at,id", [child.id])).rows;
  assert.deepEqual(audits.slice(0,-1),auditBefore);
  assert.equal(audits.at(-1).action,'Edited');
  assert.equal(audits.at(-1).previous_values.division_id,7);
  assert.equal(audits.at(-1).updated_values.division_id,8);
  assert.equal(audits.at(-1).actor_id,null);
  await executeRepair(buildStudentDivisionRepairSql(changes,count));
  assert.deepEqual((await pool.query("select * from public.students where id=$1", [child.id])).rows[0],after);
  assert.deepEqual((await pool.query("select * from public.audit_logs where record_id=$1 order by created_at,id", [child.id])).rows,audits);
});

test("division repair aborts stale batches, identities, counts and invalid targets without changing students", async () => {
  const child = (await pool.query("select * from public.students where name='Repair eighth A'")).rows[0];
  const count = Number((await pool.query("select count(*) from public.students")).rows[0].count);
  const correction = {id:child.id,name:child.name,standard:"8th",from:"Rani Channamma",to:"Rani Laxmibai",batch:child.import_batch_id};
  for (const changed of [{batch:randomUUID()},{name:"Different student"},{to:"Kabir"},{from:"Wrong previous division"}]) {
    await assert.rejects(executeRepair(buildStudentDivisionRepairSql([{...correction,...changed}],count)), /repair aborted/);
  }
  await assert.rejects(executeRepair(buildStudentDivisionRepairSql([correction],count+1)), /Directory count changed/);
  assert.deepEqual((await pool.query("select * from public.students where id=$1", [child.id])).rows[0],child);
  assert.throws(()=>buildStudentDivisionRepairSql([correction,correction],count),/duplicate/);
});

test("division maintenance grants no student-write access to staff or anonymous callers", async () => {
  const child = (await pool.query("select * from public.students where name='Repair eighth A'")).rows[0];
  const count = Number((await pool.query("select count(*) from public.students")).rows[0].count);
  const sql = buildStudentDivisionRepairSql([{id:child.id,name:child.name,standard:"8th",from:"Rani Channamma",to:"Rani Laxmibai",batch:child.import_batch_id}],count);
  for (const [actor,role] of [[staff,'authenticated'],[admin,'authenticated'],[null,'anon']]) {
    await assert.rejects(asUser(actor,sql,[],role), /permission denied/);
  }
  assert.deepEqual((await pool.query("select * from public.students where id=$1", [child.id])).rows[0],child);
});

async function deletionOrder(status = "Confirmed") {
  const price = Number((await pool.query("select price_per_kg from public.products where id=$1", [productId])).rows[0].price_per_kg);
  return save(input({ advance: 0, items: [{ productId, price, quantity: 0.5 }] }), staff, null, null, status);
}
const deletionTargets = async (ids) => Promise.all(ids.map(async (id) => ({ id, version: (await row(id)).version })));
const removeOrders = (orders, reason = "Test orders entered by mistake", request = randomUUID(), actor = admin, role = "authenticated") =>
  asUser(actor, "select public.delete_orders($1,$2,$3) result", [orders === null ? null : JSON.stringify(orders), reason, request], role);

test("administrator bulk deletion retains snapshots, emits authentic audits and hides orders from staff", async () => {
  const ids = [await deletionOrder("Draft"), await deletionOrder(), await deletionOrder()];
  await asUser(staff, "select public.set_order_status($1,'Ready',$2)", [ids[2], (await row(ids[2])).version]);
  const before = await pool.query("select * from public.order_items where order_id=any($1) order by id", [ids]);
  const totals = await Promise.all(ids.map(async (id) => (await row(id)).total_amount));
  const result = await removeOrders(await deletionTargets(ids));
  assert.equal(result.rows[0].result.deleted, 3);
  for (const [i,id] of ids.entries()) {
    const order = await row(id);
    assert.ok(order.deleted_at);
    assert.equal(order.deleted_by, admin);
    assert.equal(order.total_amount, totals[i]);
    assert.equal(order.deletion_reason, "Test orders entered by mistake");
    assert.equal((await asUser(staff, "select * from public.orders where id=$1", [id])).rowCount, 0);
    assert.equal((await asUser(staff, "select * from public.order_items where order_id=$1", [id])).rowCount, 0);
    assert.equal((await asUser(admin, "select * from public.orders where id=$1", [id])).rowCount, 1);
    const audit = (await asUser(admin, "select * from public.audit_logs where record_id=$1 and action='Deleted'", [id])).rows;
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actor_id, admin);
    assert.equal(audit[0].updated_values.deletion_reason, order.deletion_reason);
    assert.equal(audit[0].previous_values.deleted_at, null);
  }
  assert.deepEqual((await pool.query("select * from public.order_items where order_id=any($1) order by id", [ids])).rows, before.rows);
});

test("staff, inactive accounts, anonymous callers and direct SQL cannot bypass deletion authorization", async () => {
  const id = await deletionOrder("Draft");
  const targets = await deletionTargets([id]);
  for (const [actor,role] of [[staff,'authenticated'],[inactive,'authenticated'],[null,'anon']])
    await assert.rejects(removeOrders(targets, "Wrong caller", randomUUID(), actor, role), /authorized|permission denied/);
  await assert.rejects(asUser(admin, "delete from public.orders where id=$1", [id]), /permission denied/);
  await assert.rejects(asUser(admin, "update public.orders set deleted_at=now() where id=$1", [id]), /permission denied/);
  await assert.rejects(asUser(admin, "select private.set_order_status_before_deletion($1,'Ready',1)", [id]), /permission denied/);
  assert.equal((await row(id)).deleted_at, null);
});

test("paid, collected, stale or missing rows reject the entire bulk transaction without audits", async () => {
  const good = await deletionOrder();
  const paid = await deletionOrder();
  await pay(paid, 10);
  const collected = await deletionOrder();
  await asUser(staff, "select public.set_order_status($1,'Ready',$2)", [collected, (await row(collected)).version]);
  await asUser(staff, "select public.set_order_status($1,'Collected',$2)", [collected, (await row(collected)).version]);
  for (const [target,pattern] of [[paid,/Refund/],[collected,/collected/i],[randomUUID(),/not found/]]) {
    const targets = [ ...(await deletionTargets([good])), { id: target, version: target === paid || target === collected ? (await row(target)).version : 1 } ];
    await assert.rejects(removeOrders(targets), pattern);
    assert.equal((await row(good)).deleted_at, null);
  }
  const stale = await deletionTargets([good]);
  await asUser(staff, "select public.set_order_status($1,'Ready',$2)", [good, stale[0].version]);
  await assert.rejects(removeOrders(stale), /changed/);
  assert.equal((await pool.query("select count(*) from public.audit_logs where record_id=$1 and action='Deleted'", [good])).rows[0].count, '0');
});

test("fully refunded deletions retain immutable receipts and cannot be edited, paid, collected or reopened", async () => {
  const id = await deletionOrder();
  const creationRequest = (await row(id)).request_id;
  await pay(id, 10);
  await pay(id, 10, 'Cash', '', 'refund', admin);
  const payments = (await pool.query("select * from public.payments where order_id=$1 order by id", [id])).rows;
  const items = (await pool.query("select * from public.order_items where order_id=$1 order by id", [id])).rows;
  await removeOrders(await deletionTargets([id]));
  assert.deepEqual((await pool.query("select * from public.payments where order_id=$1 order by id", [id])).rows, payments);
  assert.deepEqual((await pool.query("select * from public.order_items where order_id=$1 order by id", [id])).rows, items);
  await assert.rejects(save(input({ advance: 0 }), admin, id, (await row(id)).version), /Deleted/);
  await assert.rejects(save(input({ advance: 0 }), staff, null, null, 'Confirmed', creationRequest), /Deleted/);
  await assert.rejects(pay(id, 1), /Deleted/);
  await assert.rejects(asUser(admin, "select public.set_order_status($1,'Ready',$2)", [id, (await row(id)).version]), /Deleted/);
  await assert.rejects(pool.query("update public.orders set customer_name='Changed' where id=$1", [id]), /Deleted/);
  await assert.rejects(pool.query("delete from public.order_items where order_id=$1", [id]), /Deleted/);
  await assert.rejects(asUser(admin, "delete from public.payments where order_id=$1", [id]), /permission denied/);
});

test("concurrent deletion retries are idempotent and a changed retry payload is rejected", async () => {
  const ids = [await deletionOrder(), await deletionOrder()];
  const targets = await deletionTargets(ids);
  const request = randomUUID();
  const results = await Promise.all([removeOrders(targets, 'Duplicate test batch', request), removeOrders([...targets].reverse(), 'Duplicate test batch', request)]);
  assert.ok(results.every((result) => result.rows[0].result.deleted === 2));
  assert.equal((await pool.query("select count(*) from public.audit_logs where record_id=any($1) and action='Deleted'", [ids])).rows[0].count,'2');
  await assert.rejects(removeOrders(targets, 'Changed retry reason', request), /already been used/);
  await assert.rejects(removeOrders(targets.slice(0,1), 'Duplicate test batch', request), /already been used/);
  await assert.rejects(pool.query("update private.order_deletion_batches set reason='tampered' where request_id=$1", [request]), /immutable/);
});

test("overlapping deletions commit only one atomic batch", async () => {
  const ids = [await deletionOrder(), await deletionOrder(), await deletionOrder()];
  const targets = await deletionTargets(ids);
  const results = await Promise.allSettled([removeOrders(targets.slice(0,2)), removeOrders(targets.slice(1))]);
  assert.equal(results.filter((result) => result.status==='fulfilled').length,1);
  const orders = (await pool.query("select * from public.orders where id=any($1)", [ids])).rows;
  assert.equal(orders.filter((order) => order.deleted_at).length,2);
  assert.equal((await pool.query("select count(*) from public.audit_logs where record_id=any($1) and action='Deleted'", [ids])).rows[0].count,'2');
});

test("concurrent payment and deletion cannot leave a deleted order with received money", async () => {
  const id = await deletionOrder();
  const targets = await deletionTargets([id]);
  const result = await Promise.allSettled([pay(id,10), removeOrders(targets)]);
  assert.equal(result.filter((entry) => entry.status==='fulfilled').length,1);
  const order = await row(id);
  const net = Number((await pool.query("select coalesce(sum(case kind when 'receipt' then amount else -amount end),0) as total from public.payments where order_id=$1", [id])).rows[0].total);
  assert.ok(order.deleted_at ? net===0 : net===10);
});

test("malformed deletion payloads and more than 100 rows cannot change orders", async () => {
  const id = await deletionOrder();
  const targets = await deletionTargets([id]);
  const bad = [null,{},[],[targets[0],targets[0]],[{id,version:0}],[{id,version:1.25}], [{id:'bad uuid',version:1}], [{...targets[0],actor_id:admin}], Array.from({length:101},() => targets[0])];
  for (const payload of bad) await assert.rejects(removeOrders(payload));
  await assert.rejects(removeOrders(targets,'  '));
  await assert.rejects(removeOrders(targets,'x'.repeat(501)));
  await assert.rejects(removeOrders(targets,'Valid reason',null));
  assert.equal((await row(id)).deleted_at,null);
});

test("replaying the deletion migration preserves historical bills, audits and permissions", async () => {
  const id = await deletionOrder();
  await removeOrders(await deletionTargets([id]));
  const order = await row(id);
  const audit = (await pool.query("select * from public.audit_logs where record_id=$1 order by id", [id])).rows;
  await pool.query(await deletionSql());
  await pool.query(await deletionOverrideSql());
  await pool.query(await testCleanupSql());
  assert.deepEqual(await row(id),order);
  assert.deepEqual((await pool.query("select * from public.audit_logs where record_id=$1 order by id", [id])).rows,audit);
  assert.equal((await asUser(staff, "select * from public.orders where id=$1", [id])).rowCount,0);
  await assert.rejects(pay(id,1),/Deleted/);
});

test("the maximum 100-order batch succeeds without confusing deletion count with order item limits", async () => {
  const ids = [];
  for (let i=0;i<100;i++) ids.push(await deletionOrder("Draft"));
  const result = await removeOrders(await deletionTargets(ids));
  assert.equal(result.rows[0].result.deleted,100);
  assert.equal((await pool.query("select count(*) from public.orders where id=any($1) and deleted_at is not null", [ids])).rows[0].count,'100');
});

const overrideRemove = (targets, allow, request=randomUUID(), actor=admin) =>
  asUser(actor,"select public.delete_orders($1,$2,$3,$4) result",[JSON.stringify(targets),'Reviewed collected test entry',request,allow]);
async function collectedTestOrder() {
  const id = await deletionOrder();
  await asUser(staff,"select public.set_order_status($1,'Ready',$2)",[id,(await row(id)).version]);
  await asUser(staff,"select public.set_order_status($1,'Collected',$2)",[id,(await row(id)).version]);
  return id;
}
test("collected test deletion requires explicit confirmation and preserves its historical status/items",async()=>{
  const id=await collectedTestOrder();
  const targets=await deletionTargets([id]);
  const items=(await pool.query("select * from public.order_items where order_id=$1 order by id",[id])).rows;
  for(const flag of [false,null]) await assert.rejects(overrideRemove(targets,flag),/Confirm/);
  assert.equal((await row(id)).deleted_at,null);
  await overrideRemove(targets,true);
  const archived=await row(id);
  assert.equal(archived.status,'Collected');
  assert.equal(archived.deletion_collected_override,true);
  assert.deepEqual((await pool.query("select * from public.order_items where order_id=$1 order by id",[id])).rows,items);
  const audit=(await pool.query("select * from public.audit_logs where record_id=$1 and action='Deleted'",[id])).rows;
  assert.equal(audit.length,1);
  assert.equal(audit[0].actor_id,admin);
  assert.equal(audit[0].updated_values.deletion_collected_override,true);
});
test("collected override cannot bypass role, payment or optimistic-version rules",async()=>{
  const id=await collectedTestOrder();
  const targets=await deletionTargets([id]);
  for(const actor of [staff,inactive]) await assert.rejects(overrideRemove(targets,true,randomUUID(),actor),/authorized/);
  await pay(id,10);
  await assert.rejects(overrideRemove(targets,true),/changed/);
  await assert.rejects(overrideRemove(await deletionTargets([id]),true),/Refund/);
  assert.equal((await row(id)).deleted_at,null);
});
test("mixed collected batches are atomic and retries must retain the override choice",async()=>{
  const collected=await collectedTestOrder();
  const normal=await deletionOrder();
  const targets=await deletionTargets([collected,normal]);
  await assert.rejects(overrideRemove(targets,false),/Confirm/);
  assert.equal((await row(normal)).deleted_at,null);
  const request=randomUUID();
  await overrideRemove(targets,true,request);
  await overrideRemove([...targets].reverse(),true,request);
  await assert.rejects(overrideRemove(targets,false,request),/already been used/);
  assert.equal((await row(normal)).deletion_collected_override,false);
  assert.equal((await pool.query("select count(*) from public.audit_logs where record_id=any($1) and action='Deleted'",[[collected,normal]])).rows[0].count,'2');
});
test("override migration replays safely and leaves a single public deletion RPC",async()=>{
  await pool.query(await deletionOverrideSql());
  await pool.query(await testCleanupSql());
  const methods=(await pool.query("select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='delete_orders'")).rows;
  assert.equal(methods.length,1);
  const normal=await deletionOrder();
  // Three-argument callers use default false and remain compatible.
  await removeOrders(await deletionTargets([normal]));
});

const cleanupOrders = (targets, flag=true, request=randomUUID(), actor=admin, role='authenticated') =>
  asUser(actor,'select public.delete_orders($1,$2,$3,$4,$5) result',
    [JSON.stringify(targets),'Test entries only, no real money received',request,true,flag],role);

test('paid collected test cleanup retains original ledger, totals, snapshots and immutable audited confirmation',async()=>{
  const id=await collectedTestOrder();
  await pay(id,10,'Cash');
  await pay(id,5,'Online','TEST-REF-5');
  const targets=await deletionTargets([id]);
  const original=await row(id);
  const payments=(await pool.query('select * from public.payments where order_id=$1 order by id',[id])).rows;
  const items=(await pool.query('select * from public.order_items where order_id=$1 order by id',[id])).rows;
  for(const flag of [false,null]) await assert.rejects(cleanupOrders(targets,flag),/Refund/);
  const request=randomUUID();
  const result=await cleanupOrders(targets,true,request);
  assert.equal(result.rows[0].result.deleted,1);
  const archived=await row(id);
  assert.equal(archived.deletion_test_data,true);
  assert.equal(archived.deletion_collected_override,true);
  assert.equal(archived.status,'Collected');
  assert.equal(archived.total_amount,original.total_amount);
  assert.deepEqual((await pool.query('select * from public.payments where order_id=$1 order by id',[id])).rows,payments);
  assert.deepEqual((await pool.query('select * from public.order_items where order_id=$1 order by id',[id])).rows,items);
  assert.equal(payments.some(p=>p.kind==='refund'),false);
  const audit=(await pool.query("select * from public.audit_logs where record_id=$1 and action='Deleted'",[id])).rows;
  assert.equal(audit.length,1);
  assert.equal(audit[0].actor_id,admin);
  assert.equal(audit[0].updated_values.deletion_test_data,true);
  const batch=(await pool.query('select * from private.order_deletion_batches where request_id=$1',[request])).rows[0];
  assert.equal(batch.test_cleanup,true);
  await cleanupOrders(targets,true,request);
  await assert.rejects(cleanupOrders(targets,false,request),/already been used/);
  await assert.rejects(pay(id,10,'Cash','','refund',admin),/Deleted/);
  await assert.rejects(pool.query('update public.orders set deletion_test_data=false where id=$1',[id]),/Deleted/);
  await assert.rejects(pool.query('update private.order_deletion_batches set test_cleanup=false where request_id=$1',[request]),/immutable/);
  await assert.rejects(asUser(admin,'update public.payments set amount=0 where order_id=$1',[id]),/permission denied/);
  assert.equal((await asUser(staff,'select * from public.orders where id=$1',[id])).rowCount,0);
});

test('test cleanup keeps authorization, stale checks, limits and atomic mixed batches',async()=>{
  const ids=[await deletionOrder(),await collectedTestOrder()];
  await pay(ids[1],10);
  const targets=await deletionTargets(ids);
  for(const [actor,role] of [[staff,'authenticated'],[inactive,'authenticated'],[null,'anon']])
    await assert.rejects(cleanupOrders(targets,true,randomUUID(),actor,role),/authorized|permission denied/);
  await assert.rejects(cleanupOrders([...targets,{id:randomUUID(),version:1}]),/not found/);
  assert.ok((await Promise.all(ids.map(row))).every(o=>o.deleted_at===null));
  await pay(ids[1],5);
  await assert.rejects(cleanupOrders(targets),/changed/);
  assert.equal((await row(ids[0])).deleted_at,null);
  await assert.rejects(cleanupOrders(Array.from({length:101},()=>({id:randomUUID(),version:1}))),/1 to 100/);
  await assert.rejects(cleanupOrders([targets[0],targets[0]]),/only once/);
  await cleanupOrders(await deletionTargets(ids));
  assert.ok((await Promise.all(ids.map(row))).every(o=>o.deletion_test_data===true));
});

test('test cleanup migration replays without changing bills, ledger or audit history and keeps one RPC',async()=>{
  const id=await deletionOrder();
  await pay(id,10);
  await cleanupOrders(await deletionTargets([id]));
  const original=await row(id);
  const payments=(await pool.query('select * from public.payments where order_id=$1 order by id',[id])).rows;
  const logs=(await pool.query('select * from public.audit_logs where record_id=$1 order by id',[id])).rows;
  await pool.query(await testCleanupSql());
  assert.deepEqual(await row(id),original);
  assert.deepEqual((await pool.query('select * from public.payments where order_id=$1 order by id',[id])).rows,payments);
  assert.deepEqual((await pool.query('select * from public.audit_logs where record_id=$1 order by id',[id])).rows,logs);
  const methods=(await pool.query("select pg_get_function_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='delete_orders'")).rows;
  assert.equal(methods.length,1);
  assert.match(methods[0].args,/p_test_cleanup boolean DEFAULT false/);
  const paid=await deletionOrder();
  await pay(paid,10);
  await assert.rejects(removeOrders(await deletionTargets([paid])),/Refund/);
  await assert.rejects(overrideRemove(await deletionTargets([paid]),true),/Refund/);
  await assert.rejects(asUser(admin,'update public.orders set deletion_test_data=true where id=$1',[paid]),/permission denied/);
  await assert.rejects(pool.query('update public.orders set deletion_test_data=true where id=$1',[paid]),/orders_test_deletion_metadata/);
});

collectionCases({test,assert,db:()=>pool,actor:admin,staff,inactive,save,input,productId,row,pay,asUser,migration:collectionSql,cleanup:cleanupOrders,targets:deletionTargets});
receiptNumberCases({test,assert,db:()=>pool,admin,staff,inactive,save,input,productId,row,pay,asUser,
  migration:()=>fs.readFile(path.join(root,"supabase/migrations",receiptName),"utf8"),cleanup:cleanupOrders,targets:deletionTargets});

test("October 21 rate upgrade is idempotent, protects historical bills/payments and retains admin-only catalogue writes", async () => {
  const name = "पौष्टिक लाडू (तुपातील)";
  const product = (await pool.query("select * from public.products where name=$1", [name])).rows[0];
  assert.equal(Number(product.price_per_kg), 600);
  const oldId = await save(input({ items: [{ productId: product.id, price: 600, quantity: 0.25 }], advance: 10 }));
  const before = await row(oldId);
  const items = (await pool.query("select * from public.order_items where order_id=$1", [oldId])).rows;
  const payments = (await pool.query("select * from public.payments order by id")).rows;
  const sql = await fs.readFile(path.join(root,"supabase/migrations",revisedRateName),"utf8");
  await pool.query(sql);
  const afterProduct = (await pool.query("select * from public.products where id=$1", [product.id])).rows[0];
  assert.equal(Number(afterProduct.price_per_kg),700);
  assert.equal(afterProduct.active,product.active);
  assert.deepEqual(await row(oldId),before);
  assert.deepEqual((await pool.query("select * from public.order_items where order_id=$1",[oldId])).rows,items);
  assert.deepEqual((await pool.query("select * from public.payments order by id")).rows,payments);
  const logs = (await pool.query("select * from public.audit_logs order by id")).rows;
  await pool.query(sql);
  assert.deepEqual((await pool.query("select * from public.products where id=$1",[product.id])).rows[0],afterProduct);
  assert.deepEqual((await pool.query("select * from public.audit_logs order by id")).rows,logs);
  await assert.rejects(asUser(staff,"update public.products set price_per_kg=1 where id=$1 returning id",[product.id]).then(result=>{ if (!result.rowCount) throw new Error("RLS denied"); }),/denied|permission/);
  await save(input({ items:[{productId:product.id,price:600,quantity:0.5}],advance:10 }),staff,oldId,before.version);
  assert.equal(Number((await row(oldId)).total_amount),300);
  const newId=await save(input({items:[{productId:product.id,price:700,quantity:0.25}],advance:0}));
  assert.equal(Number((await row(newId)).total_amount),175);
  await assert.rejects(save(input({items:[{productId:product.id,price:600,quantity:0.25}],advance:0})),/price changed/);
});

test("a missed advance appends to the same confirmed receipt and later order edits preserve its cash/online ledger",async()=>{
  const id=await save(input({advance:0}));
  const original=await row(id);
  const request=randomUUID();
  const receipt=await pay(id,20,"Cash","","receipt",staff,request);
  assert.equal(await pay(id,20,"Cash","","receipt",staff,request),receipt);
  await pay(id,10,"Online",`MISSED-${randomUUID()}`);
  const current=await row(id);
  const payments=(await pool.query("select * from public.payments where order_id=$1 order by id",[id])).rows;
  assert.equal(payments.length,2);
  assert.equal(payments.reduce((sum,payment)=>sum+Number(payment.amount),0),30);
  await save(input({advance:30,customerName:"Corrected existing customer"}),staff,id,current.version);
  const edited=await row(id);
  assert.equal(edited.order_number,original.order_number);
  assert.equal(edited.receipt_number,original.receipt_number);
  assert.equal(edited.deleted_at,null);
  assert.deepEqual((await pool.query("select * from public.payments where order_id=$1 order by id",[id])).rows,payments);
  assert.equal(Number(edited.total_amount)-30,31.75);
  await assert.rejects(save(input({advance:0}),staff,id,edited.version),/immutable/);
});
