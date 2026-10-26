import type { OrderInput, Student, Order } from "../types";
import { isOtherStandard } from "./otherStudents";

// The existing database represents direct orders with a NULL student_id and a
// customer collector. No placeholder student or additional schema field is needed.
export const isStallOrder = (order: Pick<OrderInput, "studentId" | "collectorType">) =>
  !order.studentId && order.collectorType === "Customer";
export const orderSourceLabel = (order: Pick<OrderInput, "studentId" | "collectorType"> & Pick<Order,"studentSnapshot">, students:Student[] = []) =>
  isStallOrder(order) ? "Stall" : isOtherStandard(order.studentSnapshot?.standard ?? students.find(student=>student.id===order.studentId)?.standard) ? "Others" : "Student";
