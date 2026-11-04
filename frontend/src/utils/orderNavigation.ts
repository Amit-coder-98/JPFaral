import type { Order } from "../types";

export const studentOrdersPath = (studentId?: string) =>
  studentId ? `/orders?${new URLSearchParams({ student: studentId })}` : "/orders";

// Keep return navigation local and based on stable student IDs, never names.
// A stale student link with no remaining active orders returns to the full list.
export function orderListReturnPath(
  order: Pick<Order, "studentId"> | undefined,
  state: unknown,
  orders: Pick<Order, "studentId" | "deletedAt">[],
): string {
  const hasOrders = (studentId: string) =>
    orders.some(item => !item.deletedAt && item.studentId === studentId);
  const returnTo = state && typeof state === "object" && "returnTo" in state ? state.returnTo : undefined;
  if (typeof returnTo === "string" && (returnTo === "/orders" || returnTo.startsWith("/orders?"))) {
    const studentId = new URLSearchParams(returnTo.split("?")[1]).get("student");
    return !studentId || hasOrders(studentId) ? returnTo : "/orders";
  }
  return order?.studentId && hasOrders(order.studentId) ? studentOrdersPath(order.studentId) : "/orders";
}
