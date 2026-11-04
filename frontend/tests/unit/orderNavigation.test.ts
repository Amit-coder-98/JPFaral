import { describe, expect, it } from "vitest";
import { orderListReturnPath, studentOrdersPath } from "../../src/utils/orderNavigation";

describe("returning from order collection", () => {
  const orders = [{ studentId: "student-1" }, { studentId: "student-1" }, { studentId: "student-2" }];

  it("returns to the same student's orders, including after collection", () => {
    expect(orderListReturnPath({ studentId: "student-1" }, null, orders)).toBe("/orders?student=student-1");
    expect(studentOrdersPath("student & 1")).toBe("/orders?student=student+%26+1");
  });

  it("keeps the originating list's filters through receipt and edit navigation", () => {
    const returnTo = "/orders?student=student-1&status=Confirmed&standard=5th&division=Devi+Padmini&pageSize=25";
    expect(orderListReturnPath({ studentId: "student-1" }, { returnTo }, orders)).toBe(returnTo);
    expect(orderListReturnPath({ studentId: "student-1" }, { returnTo: "/orders?from=2026-11-04&to=2026-11-04" }, orders))
      .toBe("/orders?from=2026-11-04&to=2026-11-04");
    expect(orderListReturnPath({ studentId: "student-1" }, { returnTo: "/orders" }, orders)).toBe("/orders");
  });

  it("falls back to all orders for Stall, missing students and students with only deleted orders", () => {
    const archived = [{ studentId: "student-1", deletedAt: "2026-11-04T10:00:00Z" }];
    expect(orderListReturnPath({ studentId: "" }, null, orders)).toBe("/orders");
    expect(orderListReturnPath(undefined, null, orders)).toBe("/orders");
    expect(orderListReturnPath({ studentId: "student-1" }, null, archived)).toBe("/orders");
    expect(orderListReturnPath(undefined, { returnTo: "/orders?student=student-1" }, archived)).toBe("/orders");
  });

  it("does not accept an external or unrelated return destination", () => {
    for (const returnTo of ["https://example.com/orders", "//example.com/orders", "/orders/new", "/students", 123, null]) {
      expect(orderListReturnPath({ studentId: "student-1" }, { returnTo }, orders)).toBe("/orders?student=student-1");
    }
  });
});
