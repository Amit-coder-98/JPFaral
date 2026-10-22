import type { OrderInput } from "../types";

// The existing database represents direct orders with a NULL student_id and a
// customer collector. No placeholder student or additional schema field is needed.
export const isStallOrder = (order: Pick<OrderInput, "studentId" | "collectorType">) =>
  !order.studentId && order.collectorType === "Customer";
export const orderSourceLabel = (order: Pick<OrderInput, "studentId" | "collectorType">) =>
  isStallOrder(order) ? "Stall" : "Student";
