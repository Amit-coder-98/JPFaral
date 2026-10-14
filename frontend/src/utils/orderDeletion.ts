import type { Order } from "../types";

export const MAX_ORDER_DELETIONS = 100;
export interface OrderDeletionTarget { id: string; version: number }
export interface OrderDeletionInput {
  orders: OrderDeletionTarget[];
  reason: string;
  requestId: string;
  allowCollected?: boolean;
  testCleanup?: boolean;
}
export function orderDeletionBlock(order: Order, allowCollected = false, testCleanup = false): string | null {
  if (order.deletedAt) return "This order is already deleted.";
  if (!Number.isFinite(order.advance) || order.advance < 0) return "Invalid payment balance. Refresh the order before deleting.";
  if (order.status === "Collected" && !allowCollected && !testCleanup) return "Collected orders require explicit deletion confirmation.";
  if (order.advance !== 0 && !testCleanup)
    return "Refund received payments before deleting this order.";
  return null;
}
export function validateOrderDeletion(input: OrderDeletionInput) {
  if (input.allowCollected !== undefined && typeof input.allowCollected !== "boolean")
    throw new Error("Collected-order confirmation must be a boolean.");
  if (input.testCleanup !== undefined && typeof input.testCleanup !== "boolean")
    throw new Error("Test-data confirmation must be a boolean.");
  if (!input.requestId || input.orders.length < 1 || input.orders.length > MAX_ORDER_DELETIONS)
    throw new Error("Choose 1 to 100 orders to delete.");
  if (new Set(input.orders.map((order) => order.id)).size !== input.orders.length
    || input.orders.some((order) => !order.id || !Number.isInteger(order.version) || order.version < 1))
    throw new Error("Select each order once with its current version.");
  if (input.reason.trim().length < 3 || input.reason.trim().length > 500)
    throw new Error("Enter a deletion reason of 3 to 500 characters.");
}
