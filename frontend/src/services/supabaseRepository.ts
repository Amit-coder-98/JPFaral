import type { SupabaseClient } from "@supabase/supabase-js";
import type { FrontendRepository } from "./contracts";
import { validateOrderDeletion, type OrderDeletionInput } from "../utils/orderDeletion";
import type {
  AppState,
  Order,
  OrderInput,
  OrderStatus,
  PaymentInput,
  CollectionInput,
  Product,
  Settings,
  StaffUser,
  Student,
  AuditLog,
} from "../types";

export const emptyState = (): AppState => ({
  students: [],
  staff: [],
  products: [],
  orders: [],
  deletedOrders: [],
  payments: [],
  logs: [],
  settings: {
    organization: "JPfaral",
    contact: "",
    address: "",
    accent: "#b56735",
    compact: false,
    reduceMotion: false,
  },
});
type Row = Record<string, unknown>;
export class SessionAccessError extends Error {}
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => Number(v ?? 0);
const obj = (v: unknown): Row => (v && typeof v === "object" ? (v as Row) : {});
const recordTypes: Record<string, string> = {
  orders: "Order",
  order_items: "Order item",
  payments: "Payment",
  students: "Student",
  products: "Product",
  profiles: "Staff",
  organization_settings: "Settings",
};
export function mapAudit(row: Row): AuditLog {
  const before = obj(row.previous_values),
    after = obj(row.updated_values);
  const changes = Object.keys(after)
    .filter(
      (k) =>
        !["updated_at", "created_at", "version", "id"].includes(k) &&
        JSON.stringify(before[k]) !== JSON.stringify(after[k]) &&
        before[k] !== undefined,
    )
    .map((field) => ({
      field,
      before: str(before[field]),
      after: str(after[field]),
    }));
  return {
    id: str(row.id),
    userId: str(row.actor_id),
    action: str(row.action) as AuditLog["action"],
    recordType: recordTypes[str(row.entity_type)] ?? str(row.entity_type),
    recordId: str(row.record_label || row.record_id),
    timestamp: str(row.created_at),
    summary: `${str(row.action)} ${recordTypes[str(row.entity_type)] ?? str(row.entity_type)} ${str(row.record_label)}`,
    changes,
  };
}
export class SupabaseRepository implements FrontendRepository {
  readonly mode = "supabase";
  private state = emptyState();
  private listeners = new Set<() => void>();
  private generation = 0;
  private identity: string | null = null;
  private refreshQueue: Promise<void> = Promise.resolve();
  constructor(private client: SupabaseClient | null) {}
  getSnapshot = () => this.state;
  getIdentity = () => this.identity;
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
  reset = () => {
    this.generation++;
    this.identity = null;
    this.commit(emptyState());
  };
  private api() {
    if (!this.client) throw new Error("Supabase is not configured.");
    return this.client;
  }
  private async rows(table: string, columns = "*") {
    const result: Row[] = [];
    // PostgREST defaults to 1000 records. Fetch complete data in bounded batches;
    // existing tables paginate/filter locally, and exports never silently truncate.
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await this.api()
        .from(table)
        .select(columns)
        .order("id")
        .range(offset, offset + 499);
      if (error) throw new Error(error.message);
      result.push(...(data as unknown as Row[]));
      if (data.length < 500) break;
    }
    return result;
  }
  refresh() {
    const next = this.refreshQueue.catch(() => {}).then(() => this.load());
    this.refreshQueue = next;
    return next;
  }
  private async load() {
    const generation = ++this.generation;
    const { data: identity, error: authError } =
      await this.api().auth.getUser();
    if (authError) {
      if (
        authError.status === 401 ||
        authError.status === 403 ||
        authError.name === "AuthSessionMissingError"
      )
        throw new SessionAccessError(
          "Your session expired. Please sign in again.",
        );
      throw new Error(
        "Unable to verify your session. Check your connection and retry.",
      );
    }
    if (!identity.user)
      throw new SessionAccessError(
        "Your session expired. Please sign in again.",
      );
    const { data: own, error: profileError } = await this.api()
      .from("profiles")
      .select("*")
      .eq("id", identity.user.id)
      .single();
    if (profileError)
      throw new Error(`Unable to load your profile: ${profileError.message}`);
    if (!own?.active)
      throw new SessionAccessError(
        "This account is inactive or has not been provisioned. Contact your administrator.",
      );
    const admin = own.role === "super_admin";
    const activity = async () => {
      if (admin) return this.rows("audit_logs");
      const result: Row[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await this.api().rpc("my_activity", {
          p_offset: offset,
          p_limit: 500,
        });
        if (error) throw new Error(error.message);
        result.push(...data);
        if (data.length < 500) break;
      }
      return result;
    };
    const [
      students,
      profiles,
      products,
      headers,
      items,
      receipts,
      divisions,
      organization,
      logs,
    ] = await Promise.all([
      this.rows("students"),
      this.rows("profiles"),
      this.rows("products"),
      this.rows("orders"),
      this.rows("order_items"),
      this.rows("payments"),
      this.rows("school_divisions"),
      this.rows("organization_settings"),
      activity(),
    ]);
    if (generation !== this.generation) return;
    const mappedPayments = receipts
      .map((p) => ({
        id: str(p.id),
        orderId: str(p.order_id),
        amount: num(p.amount),
        method: str(p.method) as "Cash" | "Online",
        utr: str(p.reference),
        kind: str(p.kind) as "receipt" | "refund",
        receivedBy: str(p.received_by),
        date: str(p.paid_at),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
    const mappedLogs = logs
      .map(row => {
        const log = mapAudit(row);
        if (!["orders", "order_items", "payments"].includes(str(row.entity_type))) return log;
        const header = headers.find(order => str(order.order_number) === log.recordId);
        return { ...log, orderId: header ? str(header.id) : str(row.entity_type) === "orders" ? str(row.record_id) : undefined,
          ...(header ? { recordId: str(header.receipt_number || header.order_number),
            summary: `${log.action} ${log.recordType} ${str(header.receipt_number || header.order_number)}` } : {}) };
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const mappedOrders = headers
        .map((o) => {
          const payments = mappedPayments.filter((p) => p.orderId === o.id);
          const lastReceipt = payments.find((p) => p.kind === "receipt");
          return {
            id: str(o.id),
            number: str(o.receipt_number || o.order_number),
            reference: str(o.order_number),
            deletedAt: str(o.deleted_at) || undefined,
            deletedBy: str(o.deleted_by) || undefined,
            deletionReason: str(o.deletion_reason) || undefined,
            deletionCollectedOverride: Boolean(o.deletion_collected_override),
            deletionTestData: Boolean(o.deletion_test_data),
            status: str(o.status) as OrderStatus,
            version: num(o.version),
            totalAmount: num(o.total_amount),
            studentId: str(o.student_id),
            studentSnapshot: {
              name: str(o.student_name),
              standard: str(o.student_standard),
              division: str(o.student_division),
            },
            customerName: str(o.customer_name),
            customerPhone: str(o.customer_phone),
            collectionDate: str(o.collection_date),
            collectorType: str(o.collector_type) as "Student" | "Customer",
            collectorName: str(o.collector_name),
            items: items
              .filter((i) => i.order_id === o.id)
              .sort((a, b) => num(a.position) - num(b.position))
              .map((i) => ({
                productId: str(i.product_id),
                name: str(i.product_name),
                price: num(i.price_per_kg),
                quantity: num(i.quantity_kg),
              })),
            advance:
              Math.round(
                payments.reduce(
                  (n, p) => n + (p.kind === "refund" ? -p.amount : p.amount),
                  0,
                ) * 100,
              ) / 100,
            paymentMethod: lastReceipt?.method ?? "Cash",
            utr: lastReceipt?.utr ?? "",
            createdBy: str(o.created_by),
            editedBy: str(o.updated_by),
            createdAt: str(o.created_at),
            editedAt: str(o.updated_at),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    this.identity = identity.user.id;
    this.commit({
      students: students.map((s) => ({
        id: str(s.id),
        name: str(s.name),
        phone: str(s.phone),
        standard: str(s.standard),
        division: str(divisions.find((d) => d.id === s.division_id)?.name),
      })),
      staff: profiles.map((p) => ({
        id: str(p.id),
        name: str(p.full_name),
        email: str(p.email),
        active: Boolean(p.active),
        role: p.role === "super_admin" ? "Super Admin" : "Data Entry Staff",
        lastActivity:
          mappedLogs.find((l) => l.userId === p.id)?.timestamp ??
          str(p.updated_at),
      })),
      products: products.map((p) => ({
        id: str(p.id),
        name: str(p.name),
        price: num(p.price_per_kg),
        available: Boolean(p.active),
        category: str(p.category) as Product["category"],
        description: str(p.description),
      })),
      payments: mappedPayments,
      orders: mappedOrders.filter((o) => !o.deletedAt),
      deletedOrders: mappedOrders.filter((o) => !!o.deletedAt),
      logs: mappedLogs,
      settings: {
        ...emptyState().settings,
        organization: str(organization[0]?.organization || "JPfaral"),
        contact: str(organization[0]?.contact),
        address: str(organization[0]?.address),
        ...obj(own.preferences),
      } as Settings,
    });
  }
  private async rpc(name: string, args: Row) {
    const { data, error } = await this.api().rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }
  async saveOrder(
    input: OrderInput,
    _actor: string,
    status: OrderStatus = "Confirmed",
    id?: string,
    requestId: string = crypto.randomUUID(),
  ) {
    const previous = this.state.orders.find((o) => o.id === id);
    const orderId = await this.rpc("save_order", {
      p_input: {
        ...input,
        advance: status === "Draft" ? 0 : input.advance,
        items: input.items
          .filter((i) => i.productId)
          .map((i) => ({
            productId: i.productId,
            price: i.price,
            quantity: i.quantity,
          })),
      },
      p_request_id: requestId,
      p_id: id ?? null,
      p_version: (input as Order).version ?? previous?.version ?? null,
      p_status: status,
    });
    await this.refresh();
    const order = this.state.orders.find((o) => o.id === orderId);
    if (!order)
      throw new Error(
        "Order was saved, but the view could not be refreshed. Reload before retrying.",
      );
    return order;
  }
  async deleteOrders(input: OrderDeletionInput, _actor: string) {
    validateOrderDeletion(input);
    const parameters: Record<string, unknown> = {
      p_orders: input.orders,
      p_reason: input.reason.trim(),
      p_request_id: input.requestId,
      p_allow_collected: input.allowCollected ?? false,
    };
    // Omit the new flag for ordinary deletion so already upgraded projects remain compatible.
    if (input.testCleanup) parameters.p_test_cleanup = true;
    const { error } = await this.api().rpc("delete_orders", parameters);
    if (error) {
      if (error.code === "PGRST202")
        throw new Error(`Order deletion needs a backend migration. Apply ${input.testCleanup ? "202610140003_test_order_cleanup.sql" : "202610140002_collected_order_deletion.sql"}, refresh and retry.`);
      throw new Error(error.message);
    }
    try { await this.refresh(); }
    catch { throw new Error("Deletion was saved, but records could not be refreshed. Refresh or retry the same request."); }
  }
  async saveProduct(product: Product, _actor: string) {
    const values = {
      id: product.id,
      name: product.name.trim(),
      price_per_kg: product.price,
      active: product.available,
      category: product.category,
      description: product.description,
    };
    const exists = this.state.products.some((p) => p.id === product.id);
    const { error } = await (exists
      ? this.api()
          .from("products")
          .update(values)
          .eq("id", product.id)
          .select("id")
          .single()
      : this.api().from("products").insert(values));
    if (error) throw new Error(error.message);
    await this.refresh();
  }
  async saveStaff(user: StaffUser, _actor: string) {
    const exists = this.state.staff.some((s) => s.id === user.id);
    const { data, error } = await this.api().functions.invoke("manage-staff", {
      body: {
        operation: exists ? "update" : "invite",
        id: exists ? user.id : undefined,
        name: user.name,
        email: user.email,
        role: user.role === "Super Admin" ? "super_admin" : "staff",
        active: user.active,
      },
    });
    if (error || data?.error) {
      let message = data?.error ?? error?.message;
      if (error && "context" in error && error.context instanceof Response) {
        try {
          message = (await error.context.json()).error ?? message;
        } catch {
          /* retain safe SDK message */
        }
      }
      throw new Error(message ?? "Unable to manage this staff account.");
    }
    await this.refresh();
  }
  async saveProfile(name: string, email: string, actor: string) {
    await this.rpc("update_my_profile", { p_name: name, p_preferences: null });
    if (email !== this.state.staff.find((s) => s.id === actor)?.email) {
      const { error } = await this.api().auth.updateUser({ email });
      if (error) throw new Error(error.message);
    }
    await this.refresh();
  }
  async importStudents(
    students: Student[],
    _actor: string,
    batchId: string = crypto.randomUUID(),
  ) {
    await this.rpc("import_students", {
      p_rows: students.map(({ name, phone, standard, division }) => ({
        name,
        phone: phone || null,
        standard,
        division,
      })),
      p_batch_id: batchId,
    });
    await this.refresh();
  }
  async saveSettings(settings: Settings, actor: string) {
    const own = this.state.staff.find((s) => s.id === actor);
    const organizationChanged = ["organization", "contact", "address"].some(
      (k) =>
        settings[k as keyof Settings] !==
        this.state.settings[k as keyof Settings],
    );
    if (organizationChanged)
      await this.rpc("update_organization", {
        p_organization: settings.organization,
        p_contact: settings.contact,
        p_address: settings.address,
      });
    await this.rpc("update_my_profile", {
      p_name: own?.name,
      p_preferences: {
        accent: settings.accent,
        compact: settings.compact,
        reduceMotion: settings.reduceMotion,
      },
    });
    await this.refresh();
  }
  async setOrderStatus(id: string, status: OrderStatus, _actor: string) {
    await this.rpc("set_order_status", {
      p_id: id,
      p_status: status,
      p_version: this.state.orders.find((o) => o.id === id)?.version,
    });
    await this.refresh();
  }
  async collectOrder(input: CollectionInput, _actor: string) {
    const { error } = await this.api().rpc("collect_order", {
      p_id: input.orderId, p_version: input.version, p_request_id: input.requestId,
      p_amount: input.amount, p_method: input.method, p_reference: input.utr,
    });
    if (error) {
      if (error.code === "PGRST202") throw new Error("Collection checkout needs migration 202610160001_collection_checkout.sql. Apply it before using this action.");
      throw new Error(error.message);
    }
    try { await this.refresh(); }
    catch { throw new Error("Collection was saved, but the view could not refresh. Refresh or retry the same request."); }
  }
  async recordPayment(input: PaymentInput, _actor: string) {
    await this.rpc("record_payment", {
      p_order_id: input.orderId,
      p_amount: input.amount,
      p_method: input.method,
      p_reference: input.utr,
      p_request_id: input.requestId,
      p_kind: input.kind,
    });
    await this.refresh();
  }
}
