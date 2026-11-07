import { describe, expect, it } from "vitest";
import { backendError, BackendQuotaError, BackendRestrictionError, QUOTA_MESSAGE, signInError } from "../../src/services/backendErrors";
import { changeSignature } from "../../src/utils/workspaceRefresh";

describe("hosted authentication failures", () => {
  it("identifies the live quota restriction without blaming passwords", () => {
    for (const error of [{ status: 402, message: "Service restricted: exceed_egress_quota" }, { message: "Service restricted: exceed_egress_quota" }]) {
      expect(signInError(error)).toBeInstanceOf(BackendQuotaError);
      expect(signInError(error).message).toBe(QUOTA_MESSAGE);
      expect(backendError(error, "Unable to load records").message).toBe(QUOTA_MESSAGE);
    }
  });
  it("does not label an unspecified billing restriction as a known egress quota", () => {
    expect(signInError({status:402})).toBeInstanceOf(BackendRestrictionError);
    expect(signInError({status:402}).message).toContain("Billing and Usage");
    expect(signInError({status:402})).not.toBeInstanceOf(BackendQuotaError);
  });
  it("distinguishes invalid credentials, rate limits and temporary service failures", () => {
    expect(signInError({ status: 400, code: "invalid_credentials" }).message).toContain("Check your credentials");
    expect(signInError({ status: 429 }).message).toContain("Too many sign-in attempts");
    for (const error of [{ status: 503 }, { name: "AuthRetryableFetchError" }, { message: "Failed to fetch" }])
      expect(signInError(error).message).toContain("temporarily unavailable");
  });
});

describe("compact workspace change checks", () => {
  const records = [
    { id: "a", updated_at: "2026-11-07T10:00:00+00:00", paid_at: "2026-11-07T09:00:00+00:00" },
    { id: "b", updated_at: "2026-11-07T11:00:00+00:00", paid_at: "2026-11-07T12:00:00+00:00" },
  ];
  it("matches a full snapshot with a one-row metadata response", () => {
    expect(changeSignature(records, "updated_at")).toBe(changeSignature([records[1]], "updated_at", 2));
    expect(changeSignature([...records].reverse(), "updated_at")).toBe(changeSignature(records, "updated_at"));
  });
  it("detects additions, removals, edits and new immutable payment entries", () => {
    const before = changeSignature(records, "updated_at");
    expect(changeSignature([records[1]], "updated_at", 3)).not.toBe(before);
    expect(changeSignature([records[1]], "updated_at", 1)).not.toBe(before);
    expect(changeSignature([{ ...records[0], updated_at: "2026-11-07T12:00:00+00:00" }], "updated_at", 2)).not.toBe(before);
    expect(changeSignature(records, "paid_at")).toBe(changeSignature([records[1]], "paid_at", 2));
  });
  it("handles empty tables and equal-timestamp ID ordering consistently", () => {
    expect(changeSignature([], "updated_at")).toBe(changeSignature([], "updated_at", 0));
    const tied = [{ ...records[0], id: "a" }, { ...records[0], id: "b" }];
    expect(changeSignature(tied, "updated_at")).toBe(changeSignature([tied[1]], "updated_at", 2));
  });
  it("compares PostgreSQL microseconds before using the ID tie-breaker", () => {
    const rows = [{id:"z",updated_at:"2026-11-07T10:00:00.123111+00:00"}, {id:"a",updated_at:"2026-11-07T10:00:00.123999+00:00"}];
    expect(changeSignature(rows,"updated_at")).toBe(changeSignature([rows[1]],"updated_at",2));
  });
});
