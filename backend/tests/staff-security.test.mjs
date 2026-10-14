import { test } from "node:test";
import assert from "node:assert/strict";
import { createManageStaffHandler } from "../supabase/functions/_shared/manageStaff.ts";
const origin = "https://jpfaral.test";
const body = {
  operation: "invite",
  name: "Test staff",
  email: "staff@test.invalid",
  role: "staff",
  active: true,
};
function fixture(role = "super_admin", active = true, valid = true) {
  let privilegedCalls = 0,
    deleted = 0,
    provisioned = 0;
  const user = {
    auth: {
      getUser: async () => ({
        data: { user: valid ? { id: "caller" } : null },
        error: null,
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { role, active }, error: null }),
        }),
      }),
    }),
    rpc: async () => {
      provisioned++;
      return { error: null };
    },
  };
  const admin = {
    auth: {
      admin: {
        inviteUserByEmail: async () => {
          privilegedCalls++;
          return { data: { user: { id: "invitee" } }, error: null };
        },
        deleteUser: async () => {
          deleted++;
          return { error: null };
        },
      },
    },
  };
  const handler = createManageStaffHandler({
    appOrigin: origin,
    userClient: () => user,
    adminClient: () => admin,
  });
  const call = (data = body, token = "valid") =>
    handler(
      new Request(origin + "/functions/manage-staff", {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify(data),
      }),
    );
  return {
    user,
    call,
    counts: () => ({ privilegedCalls, deleted, provisioned }),
  };
}
test("missing/invalid authentication never reaches the Admin Auth API", async () => {
  const f = fixture();
  assert.equal((await f.call(body, null)).status, 401);
  assert.equal(f.counts().privilegedCalls, 0);
  const invalid = fixture("super_admin", true, false);
  assert.equal((await invalid.call()).status, 401);
  assert.equal(invalid.counts().privilegedCalls, 0);
});
test("staff and inactive administrators cannot invite users", async () => {
  for (const f of [fixture("staff"), fixture("super_admin", false)]) {
    assert.equal((await f.call()).status, 403);
    assert.equal(f.counts().privilegedCalls, 0);
  }
});
test("a verified administrator can invite staff; invitations cannot assign administrator roles", async () => {
  const f = fixture();
  assert.equal((await f.call({ ...body, role: "super_admin" })).status, 400);
  assert.equal(f.counts().privilegedCalls, 0);
  assert.equal((await f.call()).status, 201);
  assert.deepEqual(f.counts(), {
    privilegedCalls: 1,
    deleted: 0,
    provisioned: 1,
  });
});
test("a failed provisioning operation compensates by removing the new Auth user", async () => {
  const f = fixture();
  f.user.rpc = async () => ({ error: { message: "Permission revoked" } });
  assert.equal((await f.call()).status, 409);
  assert.equal(f.counts().deleted, 1);
});
test("cross-origin requests are rejected before authorization or privileged access", async () => {
  const f = fixture();
  const handler = createManageStaffHandler({
    appOrigin: origin,
    userClient: () => {
      throw new Error("Should not run");
    },
    adminClient: () => {
      throw new Error("Should not run");
    },
  });
  assert.equal(
    (
      await handler(
        new Request(origin, {
          method: "POST",
          headers: { Origin: "https://untrusted.test" },
        }),
      )
    ).status,
    403,
  );
  assert.equal(f.counts().privilegedCalls, 0);
});
