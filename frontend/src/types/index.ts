export type Role = "Super Admin" | "Data Entry Staff";
export interface Student {
  id: string;
  name: string;
  /** Empty when not supplied. Supabase stores absent student phones as NULL. */
  phone: string;
  standard: string;
  division: string;
}
export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  lastActivity: string;
}
export interface Product {
  id: string;
  name: string;
  /** Canonical INR per kg; catalogue entry/display converts to/from 250 g. */
  price: number;
  available: boolean;
  category: "Sweet" | "Savoury";
  description: string;
}
export interface OrderItem {
  productId: string;
  name: string;
  /** Historical canonical INR per kg snapshot. */
  price: number;
  /** Kilograms, in positive 0.25 kg increments. */
  quantity: number;
}
export type OrderStatus = "Draft" | "Confirmed" | "Ready" | "Collected";
export interface OrderInput {
  studentId: string;
  customerName: string;
  customerPhone: string;
  items: OrderItem[];
  advance: number;
  paymentMethod: "Cash" | "Online";
  utr: string;
  collectionDate: string;
  collectorType: "Student" | "Customer";
  collectorName: string;
}
export interface Order extends OrderInput {
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  deletionCollectedOverride?: boolean;
  deletionTestData?: boolean;
  version?: number;
  totalAmount?: number;
  studentSnapshot?: { name: string; standard: string; division: string };
  id: string;
  number: string;
  /** Permanent internal reference; displayed receipt numbers may be reused after deletion. */
  reference?: string;
  status: OrderStatus;
  createdBy: string;
  createdAt: string;
  editedBy: string;
  editedAt: string;
}
export interface Payment {
  kind?: "receipt" | "refund";
  id: string;
  orderId: string;
  amount: number;
  method: "Cash" | "Online";
  utr: string;
  receivedBy: string;
  date: string;
}
export interface PaymentInput {
  orderId: string;
  amount: number;
  method: "Cash" | "Online";
  utr: string;
  kind: "receipt" | "refund";
  requestId: string;
}
export interface CollectionInput {
  orderId: string;
  version: number;
  amount: number;
  method: "Cash" | "Online";
  utr: string;
  requestId: string;
}
export interface AuditChange {
  field: string;
  before: string;
  after: string;
}
export interface AuditLog {
  id: string;
  userId: string;
  action: "Created" | "Edited" | "Imported" | "Updated" | "Deleted";
  recordType: string;
  recordId: string;
  /** Stable parent order UUID, keeping reused receipt numbers out of identity matching. */
  orderId?: string;
  timestamp: string;
  summary: string;
  changes: AuditChange[];
}
export interface Settings {
  organization: string;
  contact: string;
  address: string;
  accent: string;
  compact: boolean;
  reduceMotion: boolean;
}
export interface AppState {
  students: Student[];
  staff: StaffUser[];
  products: Product[];
  orders: Order[];
  /** Administrator-only, read-only history; excluded from active business totals. */
  deletedOrders?: Order[];
  payments: Payment[];
  logs: AuditLog[];
  settings: Settings;
}
