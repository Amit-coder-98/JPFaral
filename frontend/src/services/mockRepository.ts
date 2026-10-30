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
  CreateUserInput,
  Student,
  PaymentInput,
  CollectionInput,
} from "../types";
import { balance, nextOrderNumber, nextReceiptNumber, orderTotal } from "../utils/calculations";
import { now } from "../utils/format";
import { moneyInPaise, rateMoney } from "../utils/pricing";
import { orderSchema, quantitySchema } from "./validation";
import type { FrontendRepository } from "./contracts";
import { isOtherStandard, normalizeStudentName, validateOtherStudent, type OtherStudentInput } from "../utils/otherStudents";
import { validateCreateUser } from "../utils/userAccounts";
export class MockRepository implements FrontendRepository {
  readonly mode = "mock";
  private state: AppState;
  private listeners = new Set<() => void>();
  private deletionRequests = new Map<string, string>();
  private collectionRequests = new Map<string, string>();
  constructor(initial = seedData()) {
    this.state = initial;
  }
  getSnapshot = () => this.state;
  refresh = async () => {};
  reset = () => { this.deletionRequests.clear(); this.collectionRequests.clear(); this.commit(seedData()); };
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
      moneyInPaise(input.amount) === null || input.amount <= 0
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
    const received = (Math.round(order.advance * 100) + (refund ? -1 : 1) * moneyInPaise(input.amount)!) / 100;
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
          ...(["Order", "Payment"].includes(recordType) ? { orderId: [...state.orders, ...(state.deletedOrders ?? [])].find(order => order.number === recordId)?.id } : {}),
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
      clean.studentId &&
      !this.state.students.some((s) => s.id === clean.studentId)
    )
      throw new Error("The student was not found.");
    const previous = id
      ? this.state.orders.find((o) => o.id === id)
      : undefined;
    if (id && this.state.deletedOrders?.some((order) => order.id === id)) throw new Error("Deleted orders cannot be saved or reopened.");
    if (id && !previous) throw new Error("This order no longer exists.");
    if (previous?.status === "Collected") throw new Error("Collected orders cannot be edited.");
    if (previous && (input as Order).version !== undefined && (input as Order).version !== (previous.version ?? 1))
      throw new Error("This order changed. Refresh before editing.");
    if (previous && previous.status !== "Draft" && clean.advance !== previous.advance)
      throw new Error("Existing receipts are immutable. Record another payment instead.");
    const timestamp = now();
    const selectedStudent = this.state.students.find(student => student.id === clean.studentId);
    const order: Order = {
      ...clean,
      studentSnapshot: previous?.studentId === clean.studentId && previous.studentSnapshot
        ? previous.studentSnapshot : selectedStudent ? {name:selectedStudent.name,standard:selectedStudent.standard,division:selectedStudent.division} : undefined,
      utr: clean.paymentMethod === "Cash" ? "" : clean.utr.trim(),
      id: previous?.id ?? crypto.randomUUID(),
      number: previous?.number ?? nextReceiptNumber(this.state.orders),
      reference: previous ? previous.reference ?? previous.number : nextOrderNumber([...this.state.orders, ...(this.state.deletedOrders ?? [])]),
      version: previous ? (previous.version ?? 1) + 1 : 1,
      status,
      createdBy: previous?.createdBy ?? actor,
      createdAt: previous?.createdAt ?? timestamp,
      editedBy: actor,
      editedAt: timestamp,
    };
    const payments = [...this.state.payments];
    if (order.advance > 0 && status !== "Draft" && (!previous || previous.status === "Draft"))
      payments.push({
        id: crypto.randomUUID(),
        orderId: order.id,
        amount: order.advance,
        method: order.paymentMethod,
        utr: order.utr,
        receivedBy: actor,
        date: timestamp,
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
    if (!this.state.staff.some(user => user.id === actor && user.active)) throw new Error("An active authorized account is required.");
    if (status !== "Collected" || !["Confirmed", "Ready"].includes(order.status)) throw new Error("Invalid collection status transition.");
    if (balance(order) !== 0) throw new Error("Receive the outstanding balance before collection.");
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
  collectOrder(input: CollectionInput, actor: string) {
    if (!this.state.staff.some(user => user.id === actor && user.active)) throw new Error("An active authorized account is required.");
    const signature = JSON.stringify({ ...input, utr: input.method === "Cash" ? "" : input.utr.trim(), actor });
    const order = this.state.orders.find(item => item.id === input.orderId);
    if (!order) throw new Error("Order not found or deleted.");
    const previous = this.collectionRequests.get(input.requestId);
    if (previous) { if (previous !== signature) throw new Error("Collection request ID has already been used."); return; }
    if ((order.version ?? 1) !== input.version) throw new Error("This order changed. Refresh before collection.");
    if (!["Confirmed", "Ready"].includes(order.status)) throw new Error("Only confirmed orders can be collected.");
    const due = Math.round((orderTotal(order) - order.advance) * 100) / 100;
    if (moneyInPaise(input.amount) === null || moneyInPaise(input.amount) !== moneyInPaise(due))
      throw new Error("Receive the exact outstanding balance before collection.");
    if (!["Cash", "Online"].includes(input.method) || (input.amount > 0 && input.method === "Online" && !input.utr.trim()) || input.utr.length > 120)
      throw new Error("UTR is required for online collection payments.");
    if (this.state.payments.some(payment => payment.id === input.requestId || (input.amount > 0 && input.method === "Online" && payment.method === "Online" && payment.kind !== "refund" && payment.utr.trim().toLowerCase() === input.utr.trim().toLowerCase())))
      throw new Error("Payment reference or request ID has already been used.");
    const timestamp = now();
    let state = { ...this.state, orders: this.state.orders.map(item => item.id === order.id
      ? { ...item, status: "Collected" as const, advance: orderTotal(order), version: input.version + (input.amount > 0 ? 2 : 1), editedAt: timestamp, editedBy: actor,
        ...(input.amount > 0 ? { paymentMethod: input.method, utr: input.method === "Cash" ? "" : input.utr.trim() } : {}) } : item) };
    if (input.amount > 0) state = this.log({ ...state, payments: [...state.payments, { id: input.requestId, orderId: order.id,
      amount: input.amount, method: input.method, utr: input.method === "Cash" ? "" : input.utr.trim(), kind: "receipt", receivedBy: actor, date: timestamp }] }, actor, "Created", "Payment", order.number, `Recorded collection receipt for ${order.number}`);
    this.collectionRequests.set(input.requestId, signature);
    this.commit(this.log(state, actor, "Updated", "Order", order.number, "Collected order and settled payment", [{ field: "Status", before: order.status, after: "Collected" }]));
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
  createStaff(input:CreateUserInput,actor:string) {
    if(!this.state.staff.some(user=>user.id===actor&&user.active&&user.role==="Super Admin"))throw new Error("An active Super Admin account is required.");
    const {name,email,role}=validateCreateUser(input);
    this.saveStaff({id:crypto.randomUUID(),name,email,role,active:true,lastActivity:now()},actor);
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
  saveOtherStudent(input: OtherStudentInput, actor: string) {
    if (!this.state.staff.some(user => user.id === actor && user.active)) throw new Error("An active authorized account is required.");
    const clean = validateOtherStudent(input);
    const matches = this.state.students.filter(student => isOtherStandard(student.standard) && student.standard === clean.standard
      && normalizeStudentName(student.name).toLocaleLowerCase() === clean.name.toLocaleLowerCase() && student.division.trim().toLocaleLowerCase() === clean.division.toLocaleLowerCase());
    const exact = matches.find(student => student.phone === clean.phone);
    if (exact) return exact;
    if (!clean.phone && matches.length > 1) throw new Error("More than one student has this name. Select the correct saved student using their phone and class.");
    if (!clean.phone && matches.length === 1) return matches[0];
    const absentPhone = clean.phone ? matches.find(student => !student.phone) : undefined;
    const student = absentPhone ? {...absentPhone,phone:clean.phone} : {...clean,id:crypto.randomUUID()};
    this.commit(this.log({...this.state,students:absentPhone ? this.state.students.map(value=>value.id===student.id ? student : value) : [...this.state.students,student]},
      actor,absentPhone ? "Edited" : "Created","Student",student.name,`${absentPhone ? "Updated" : "Saved"} Others student (${student.standard})`));
    return student;
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
