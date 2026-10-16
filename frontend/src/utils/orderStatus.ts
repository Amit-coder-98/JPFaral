import type { OrderStatus } from "../types";
/** Preserve old database snapshots while removing the retired workflow step. */
export const orderStatusLabel = (status: OrderStatus) => status === "Ready" ? "Confirmed" : status;
