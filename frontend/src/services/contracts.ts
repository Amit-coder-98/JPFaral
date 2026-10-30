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
  CreateUserInput,
  Student,
} from "../types";
type Result<T> = T | Promise<T>;
import type { OtherStudentInput } from "../utils/otherStudents";
import type { OrderDeletionInput } from "../utils/orderDeletion";
export interface FrontendRepository {
  readonly mode: "mock" | "supabase";
  getSnapshot(): AppState;
  getIdentity?(): string | null;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  reset(): void;
  saveOrder(
    input: OrderInput,
    actor: string,
    status?: OrderStatus,
    id?: string,
    requestId?: string,
  ): Result<Order>;
  saveProduct(product: Product, actor: string): Result<void>;
  saveOtherStudent(student: OtherStudentInput, actor: string): Result<Student>;
  saveStaff(user: StaffUser, actor: string): Result<void>;
  createStaff(input: CreateUserInput, actor: string): Result<void>;
  saveProfile(name: string, email: string, actor: string): Result<void>;
  importStudents(
    students: Student[],
    actor: string,
    batchId?: string,
  ): Result<void>;
  saveSettings(settings: Settings, actor: string): Result<void>;
  setOrderStatus(id: string, status: OrderStatus, actor: string): Result<void>;
  recordPayment(input: PaymentInput, actor: string): Result<void>;
  collectOrder(input: CollectionInput, actor: string): Result<void>;
  deleteOrders(input: OrderDeletionInput, actor: string): Result<void>;
}
