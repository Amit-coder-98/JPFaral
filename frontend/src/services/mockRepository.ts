import { seedData } from "../data/mock";
import { orderDeletionBlock, validateOrderDeletion, type OrderDeletionInput } from "../utils/orderDeletion";
import type {
  AppState,
  Order,
  OrderInput,
  OrderStatus,
  Product,
  Settings,
  StaffUser,
  Student,
  PaymentInput,
} from "../types";
import { nextOrderNumber, orderTotal } from "../utils/calculations";
import { now } from "../utils/format";
import { rateMoney } from "../utils/pricing";
import { orderSchema, quantitySchema } from "./validation";
import type { FrontendRepository } from "./contracts";
export class MockRepository implements FrontendRepository {
  readonly mode = "mock";
  private state: AppState;
  private listeners = new Set<() => void>();
  private deletionRequests = new Map<string, string>();
  constructor(initial = seedData()) {
    this.state = initial;
  }
  getSnapshot = () => this.state;
  refresh = async () => {};
  reset = () => { this.deletionRequests.clear(); this.commit(seedData()); };
  saveProfile(name: string, email: string, actor: string) {
    const profile = this.state.staff.find((s) => s.id === actor);
    if (!profile) throw new Error("Account not found");
    this.saveStaff({ ...profile, name, email }, actor);
  }
  recordPayment(input: PaymentInput, actor: string) {
    const order = this.state.orders.find((o) => o.id === input.orderId);
    if (!order || order.status === "Draft")
      throw new Error("Select a confirmed order.");
    if (
      !Number.isFinite(input.amount) ||
      input.amount <= 0 ||
      input.amount * 100 !== Math.round(input.amount * 100)
    )
      throw new Error("Enter a positive amount with up to two decimals.");
    if (input.method === "Online" && !input.utr.trim())
      throw new Error("UTR is required for online payments.");
    const refund = input.kind === "refund";
    if (
      refund &&
      this.state.staff.find((s) => s.id === actor)?.role !== "Super Admin"
    )
      throw new Error("Refunds require an administrator.");
    const received = order.advance + (refund ? -input.amount : input.amount);
    if (received < 0 || received > orderTotal(order))
      throw new Error("Payment exceeds the balance or refundable amount.");
    if (this.state.payments.some((p) => p.id === input.requestId)) return;
    this.commit(
      this.log(
        {
          ...this.state,
          orders: this.state.orders.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  advance: received,
                  version: (o.version ?? 1) + 1,
                  paymentMethod: input.method,
                  utr: input.utr,
                  editedBy: actor,
                  editedAt: now(),
                }
              : o,
          ),
          payments: [
            ...this.state.payments,
            {
              id: input.requestId,
              orderId: order.id,
              amount: input.amount,
              method: input.method,
              utr: input.utr,
              kind: input.kind,
              receivedBy: actor,
              date: now(),
            },
          ],
        },
        actor,
        "Created",
        "Payment",
        order.number,
        `Recorded ${input.kind} for ${order.number}`,
      ),
    );
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private commit(state: AppState) {
    this.state = state;
    this.listeners.forEach((fn) => fn());
  }
  private log(
    state: AppState,
    actor: string,
    action: AppState["logs"][number]["action"],
    recordType: string,
    recordId: string,
    summary: string,
    changes: AppState["logs"][number]["changes"] = [],
  ) {
    return {
      ...state,
      staff: state.staff.map((s) =>
        s.id === actor ? { ...s, lastActivity: now() } : s,
      ),
      logs: [
        {
          id: crypto.randomUUID(),
          userId: actor,
          action,
          recordType,
          recordId,
          timestamp: now(),
          summary,
          changes,
        },
        ...state.logs,
      ],
    };
  }
  saveOrder(
    input: OrderInput,
    actor: string,
    status: OrderStatus = "Confirmed",
    id?: string,
  ) {
    input.items.forEach((item) => quantitySchema.parse(item.quantity));
    const clean =
      status === "Draft" ? structuredClone(input) : orderSchema.parse(input);
    if (!this.state.staff.some((s) => s.id === actor && s.active))
      throw new Error("Select an active demo staff account.");
    if (
      status !== "Draft" &&
      !this.state.students.some((s) => s.id === clean.studentId)
    )
      throw new Error("The student was not found.");
    const previous = id
      ? this.state.orders.find((o) => o.id === id)
      : undefined;
    if (id && this.state.deletedOrders?.some((order) => order.id === id)) throw new Error("Deleted orders cannot be saved or reopened.");
    if (id && !previous) throw new Error("This order no longer exists.");
    const timestamp = now();
    const order: Order = {
      ...clean,
      utr: clean.paymentMethod === "Cash" ? "" : clean.utr.trim(),
      id: previous?.id ?? crypto.randomUUID(),
      number: previous?.number ?? nextOrderNumber([...this.state.orders, ...(this.state.deletedOrders ?? [])]),
      version: previous ? (previous.version ?? 1) + 1 : 1,
      status,
      createdBy: previous?.createdBy ?? actor,
      createdAt: previous?.createdAt ?? timestamp,
      editedBy: actor,
      editedAt: timestamp,
    };
    const payments = this.state.payments.filter((p) => p.orderId !== order.id);
    const oldPayment = this.state.payments.find((p) => p.orderId === order.id);
    if (order.advance > 0 && status !== "Draft")
      payments.push({
        id: oldPayment?.id ?? crypto.randomUUID(),
        orderId: order.id,
        amount: order.advance,
        method: order.paymentMethod,
        utr: order.utr,
        receivedBy:
          oldPayment?.amount === order.advance ? oldPayment.receivedBy : actor,
        date:
          oldPayment?.amount === order.advance ? oldPayment.date : timestamp,
      });
    const auditFields: (keyof OrderInput)[] = [
      "studentId",
      "customerName",
      "customerPhone",
      "items",
      "advance",
      "paymentMethod",
      "utr",
      "collectionDate",
      "collectorType",
      "collectorName",
    ];
    const changes = previous
      ? auditFields
          .filter(
            (key) =>
              JSON.stringify(previous[key]) !== JSON.stringify(order[key]),
          )
          .map((key) => ({
            field: key,
            before:
              typeof previous[key] === "object"
                ? JSON.stringify(previous[key])
                : String(previous[key]),
            after:
              typeof order[key] === "object"
                ? JSON.stringify(order[key])
                : String(order[key]),
          }))
      : [];
    this.commit(
      this.log(
        {
          ...this.state,
          orders: previous
            ? this.state.orders.map((o) => (o.id === order.id ? order : o))
            : [order, ...this.state.orders],
          payments,
        },
        actor,
        previous ? "Edited" : "Created",
        "Order",
        order.number,
        `${previous ? "Updated" : "Created"} ${status === "Draft" ? "a draft" : "an order"} for ${order.customerName || "a customer"}`,
        changes,
      ),
    );
    return order;
  }
  setOrderStatus(id: string, status: OrderStatus, actor: string) {
    const order = this.state.orders.find((o) => o.id === id);
    if (!order) throw new Error("Order not found");
    this.commit(
      this.log(
        {
          ...this.state,
          orders: this.state.orders.map((o) =>
            o.id === id
              ? { ...o, status, version: (o.version ?? 1) + 1, editedAt: now(), editedBy: actor }
              : o,
          ),
        },
        actor,
        "Updated",
        "Order",
        order.number,
        `Collection status changed to ${status}`,
        [{ field: "Status", before: order.status, after: status }],
      ),
    );
  }
  deleteOrders(input: OrderDeletionInput, actor: string) {
    validateOrderDeletion(input);
    if (!this.state.staff.some((user) => user.id === actor && user.active && user.role === "Super Admin"))
      throw new Error("An active Super Admin is required to delete orders.");
    const signature = JSON.stringify({ actor, reason: input.reason.trim(), allowCollected: input.allowCollected ?? false, testCleanup: input.testCleanup ?? false, orders: [...input.orders].sort((a,b) => a.id.localeCompare(b.id)) });
    const prior = this.deletionRequests.get(input.requestId);
    if (prior) {
      if (prior !== signature) throw new Error("Deletion request ID has already been used.");
      return;
    }
    const targets = input.orders.map((target) => {
      const order = this.state.orders.find((item) => item.id === target.id);
      if (!order) throw new Error("Order not found or already deleted. Refresh the list.");
      if ((order.version ?? 1) !== target.version) throw new Error("This order changed. Refresh before deleting.");
      const blocked = orderDeletionBlock(order, input.allowCollected, input.testCleanup);
      if (blocked) throw new Error(blocked);
      return order;
    });
    const deletedAt = now();
    const ids = new Set(targets.map((order) => order.id));
    let state: AppState = {
      ...this.state,
      orders: this.state.orders.filter((order) => !ids.has(order.id)),
      deletedOrders: [...(this.state.deletedOrders ?? []), ...targets.map((order) => ({
        ...order, deletedAt, deletedBy: actor, deletionReason: input.reason.trim(),
        deletionCollectedOverride: order.status === "Collected" && !!(input.allowCollected || input.testCleanup),
        deletionTestData: input.testCleanup ?? false,
        version: (order.version ?? 1) + 1, editedBy: actor, editedAt: deletedAt,
      }))],
    };
    for (const order of targets) state = this.log(state, actor, "Deleted", "Order", order.number,
      `Deleted ${order.number}: ${input.reason.trim()}`,
      [{ field: "Deletion reason", before: "", after: input.reason.trim() },
        ...(order.status === "Collected" ? [{field:"Collected-order override",before:"false",after:"true"}] : []),
        ...(input.testCleanup ? [{field:"Test data",before:"false",after:"true"}] : [])]);
    this.deletionRequests.set(input.requestId, signature);
    this.commit(state);
  }
  saveProduct(product: Product, actor: string) {
    if (
      !product.name.trim() ||
      !Number.isFinite(product.price) ||
      product.price <= 0
    )
      throw new Error("Enter a product name and a positive price.");
    const exists = this.state.products.some((p) => p.id === product.id);
    this.commit(
      this.log(
        {
          ...this.state,
          products: exists
            ? this.state.products.map((p) =>
                p.id === product.id ? product : p,
              )
            : [...this.state.products, product],
        },
        actor,
        exists ? "Edited" : "Created",
        "Product",
        product.name,
        `Updated ${product.name} · ${rateMoney(product.price)} / 250 ग्रॅम`,
      ),
    );
  }
  saveStaff(user: StaffUser, actor: string) {
    if (!user.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email))
      throw new Error("Enter a name and valid email address.");
    if (
      this.state.staff.some(
        (s) =>
          s.id !== user.id &&
          s.email.toLowerCase() === user.email.toLowerCase(),
      )
    )
      throw new Error("This email is already in use.");
    if (
      user.id === actor &&
      (!user.active || user.role !== "Super Admin") &&
      this.state.staff.find((s) => s.id === actor)?.role === "Super Admin"
    )
      throw new Error(
        "Keep the current administrator active with their admin role.",
      );
    const exists = this.state.staff.some((s) => s.id === user.id);
    this.commit(
      this.log(
        {
          ...this.state,
          staff: exists
            ? this.state.staff.map((s) => (s.id === user.id ? user : s))
            : [...this.state.staff, user],
        },
        actor,
        exists ? "Edited" : "Created",
        "Staff",
        user.name,
        `${exists ? "Updated" : "Created"} demo account for ${user.name}`,
      ),
    );
  }
  importStudents(students: Student[], actor: string) {
    this.commit(
      this.log(
        { ...this.state, students: [...this.state.students, ...students] },
        actor,
        "Imported",
        "Students",
        `${students.length} students`,
        `Imported ${students.length} student records locally`,
      ),
    );
  }
  saveSettings(settings: Settings, actor: string) {
    this.commit(
      this.log(
        { ...this.state, settings },
        actor,
        "Updated",
        "Settings",
        "Organization",
        "Updated demo organization settings",
      ),
    );
  }
}
