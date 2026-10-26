import { useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  Search,
  UserRound,
  Check,
  History,
  Save,
  Eye,
  Printer,
  ShoppingBag,
  ArrowRight,
  CheckCircle2,
  CalendarDays,
  Wallet,
  FileText,
} from "lucide-react";
import { useApp } from "../app/Provider";
import { Button, Field, Modal, PageHeader } from "../components/ui";
import { Bill } from "../components/orders/Bill";
import { OrderTable } from "../components/orders/OrderTable";
import { ProductChecklist } from "../components/orders/ProductChecklist";
import { PaymentDialog } from "../components/orders/PaymentDialog";
import { OtherStudentForm } from "../components/orders/OtherStudentForm";
import { isOtherStandard } from "../utils/otherStudents";
import { isStallOrder } from "../utils/orderSource";
import { divisions } from "../data/reference";
import { orderSchema, quantitySchema } from "../services/validation";
import { rateMoney } from "../utils/pricing";
import {
  balance,
  lineTotal,
  nextReceiptNumber,
  orderTotal,
} from "../utils/calculations";
import { today, money, now } from "../utils/format";
import type { Order, OrderInput, Student } from "../types";
const blankOrder = (): OrderInput => ({
  studentId: "",
  customerName: "",
  customerPhone: "",
  items: [],
  advance: 0,
  paymentMethod: "Cash",
  utr: "",
  collectionDate: today(),
  collectorType: "Student",
  collectorName: "",
});
function FormSection({
  step,
  title,
  description,
  icon: Icon,
  children,
}: {
  step: string;
  title: string;
  description: string;
  icon: typeof UserRound;
  children: React.ReactNode;
}) {
  return (
    <section className="form-section">
      <header>
        <div className="section-number">{step}</div>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Icon className="section-icon" size={21} />
      </header>
      <div className="form-section-body">{children}</div>
    </section>
  );
}
export default function CreateOrder() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data, user, repository, toast, isMock } = useApp();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const navigate = useNavigate();
  const original = data.orders.find((o) => o.id === id);
  const selectedInitial = data.students.find(
    (s) => s.id === (original?.studentId ?? params.get("student")),
  );
  const [form, setForm] = useState<OrderInput>(() =>
    original
      ? structuredClone(original)
      : selectedInitial
        ? {
            ...blankOrder(),
            studentId: selectedInitial.id,
            customerName: selectedInitial.name,
            customerPhone: selectedInitial.phone,
            collectorName: selectedInitial.name,
          }
        : blankOrder(),
  );
  const [standard, setStandard] = useState(original && isStallOrder(original) ? "Stall" : isOtherStandard(selectedInitial?.standard) ? "Others" : selectedInitial?.standard ?? "");
  const [division, setDivision] = useState(isOtherStandard(selectedInitial?.standard) ? "" : selectedInitial?.division ?? "");
  const stall = standard === "Stall";
  const others = standard === "Others";
  const [otherFormKey,setOtherFormKey] = useState(0);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentOpen, setStudentOpen] = useState(false);
  const [studentIndex, setStudentIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerModal, setCustomerModal] = useState(false);
  const [history, setHistory] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [preview, setPreview] = useState(false);
  const [saved, setSaved] = useState<Order | null>(null);
  const [saving, setSaving] = useState(false);
  const [payment, setPayment] = useState(false);
  const recordedOrder = !!original && original.status !== "Draft";
  const hasOrderChanges = !!original && (["studentId", "customerName", "customerPhone", "items", "collectionDate", "collectorType", "collectorName"] as const)
    .some(key => JSON.stringify(form[key]) !== JSON.stringify(original[key]));
  const student = data.students.find((s) => s.id === form.studentId);
  const historyOrders = data.orders.filter(
    (o) => o.studentId === form.studentId,
  );
  const studentOptions = data.students
    .filter(
      (s) =>
        s.standard === standard &&
        s.division === division &&
        `${s.name} ${s.phone}`
          .toLowerCase()
          .includes(studentSearch.toLowerCase()),
    )
    .slice(0, 10);
  const total = orderTotal(form);
  const billNumber =
    original?.number ??
    (isMock ? nextReceiptNumber(data.orders) : "Assigned on save");
  const set = <K extends keyof OrderInput>(key: K, value: OrderInput[K]) => {
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === "customerName" && f.collectorType === "Customer"
        ? { collectorName: String(value) }
        : {}),
    }));
    setErrors((e) =>
      Object.fromEntries(
        Object.entries(e).filter(
          ([path]) => path !== key && !path.startsWith(`${key}.`),
        ),
      ),
    );
  };
  const chooseStudent = (s: Student) => {
    setStandard(isOtherStandard(s.standard) ? "Others" : s.standard);
    setDivision(isOtherStandard(s.standard) ? "" : s.division);
    setForm((f) => ({
      ...f,
      studentId: s.id,
      customerName: s.name,
      customerPhone: s.phone,
      collectorName: s.name,
    }));
    setStudentSearch("");
    setStudentOpen(false);
    setErrors((e) => ({
      ...e,
      studentId: "",
      customerName: "",
      customerPhone: "",
      collectorName: "",
    }));
  };
  const resetStudent = () => {
    set("studentId", "");
    setStudentSearch("");
    setStudentOpen(false);
    setStudentIndex(0);
  };
  const validate = (draft = false) => {
    if (draft) {
      const invalid = Object.fromEntries(
        form.items.flatMap((item, i) => {
          const parsed = quantitySchema.safeParse(item.quantity);
          return parsed.success
            ? []
            : [[`items.${i}.quantity`, parsed.error.issues[0].message]];
        }),
      );
      setErrors(invalid);
      return Object.keys(invalid).length === 0;
    }
    const result = orderSchema.safeParse(form);
    const next: Record<string, string> = {};
    if (!stall && !form.studentId) next.studentId = others ? "Select a saved Others student, or save the student details first." : "Select a student or choose Stall for a direct order";
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        const path = issue.path.join(".");
        if (!next[path]) next[path] = issue.message;
      });
    }
    if (Object.keys(next).length) {
      setErrors(next);
      toast("Please check the highlighted order details.", true);
      setTimeout(
        () =>
          document
            .querySelector<HTMLElement>(".field-error")
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
        50,
      );
      return false;
    }
    setErrors({});
    return true;
  };
  const save = async (draft = false) => {
    if (!validate(draft)) return;
    setSaving(true);
    try {
      const order = await repository.saveOrder(
        form,
        user!.id,
        draft
          ? "Draft"
          : original && original.status !== "Draft"
            ? original.status
            : "Confirmed",
        id,
        requestId,
      );
      setSaved(order);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Unable to save this order", true);
    } finally {
      setSaving(false);
    }
  };
  const openPayment = async () => {
    if (!original || saving) return;
    if (hasOrderChanges) {
      if (!validate()) return;
      setSaving(true);
      try {
        const updated = await repository.saveOrder(form, user!.id, original.status, original.id, requestId);
        setForm(structuredClone(updated));
      } catch (error) {
        toast(error instanceof Error ? error.message : "Unable to save order changes.", true);
        return;
      } finally {
        setSaving(false);
      }
    }
    setPayment(true);
  };
  const previewOrder: Order = {
    ...form,
    studentSnapshot: student ? {name:student.name,standard:student.standard,division:student.division} : undefined,
    id: original?.id ?? "preview",
    number: billNumber,
    status: original?.status ?? "Confirmed",
    createdBy: original?.createdBy ?? user!.id,
    createdAt: original?.createdAt ?? now(),
    editedBy: user!.id,
    editedAt: now(),
  };
  if (id && !original)
    return (
      <div>
        <PageHeader
          title="Order not found"
          description="This order is no longer available in your workspace."
        />
        <Link to="/orders" className="button secondary">
          Back to orders
        </Link>
      </div>
    );
  return (
    <>
      <PageHeader
        eyebrow="ORDER DESK"
        title={
          original ? `Edit ${billNumber}` : "A new order. A little more joy."
        }
        description="From the order book to your workspace. Let’s get every detail right."
        actions={
          <Link to="/orders" className="button secondary">
            <ArrowLeft size={16} />
            Back to orders
          </Link>
        }
      />
      <div className="order-form-layout">
        <div className="order-form-main">
          <FormSection
            step="01"
            title="Order source"
            description="Choose a saved class, Stall for direct customers, or Others for 1st–4th standard students."
            icon={UserRound}
          >
            <div className="field-label">
              Select standard or order source <span className="required">*</span>
            </div>
            <div className="standard-buttons">
              {Object.keys(divisions).map((s) => (
                <button
                  className={standard === s ? "selected" : ""}
                  key={s}
                  onClick={() => {
                    setStandard(s);
                    setDivision("");
                    resetStudent();
                    if (stall) setForm(f => ({...f,collectorType:"Student",collectorName:""}));
                  }}
                  aria-pressed={standard === s}
                >
                  {s}
                </button>
              ))}
              <button type="button" className={stall ? "selected" : ""} aria-pressed={stall}
                onClick={() => {
                  setStandard("Stall"); setDivision(""); resetStudent();
                  if (!stall) setForm(f => ({...f,studentId:"",customerName:"",customerPhone:"",collectorType:"Customer",collectorName:""}));
                  setErrors(e => ({...e,studentId:"",customerName:"",customerPhone:"",collectorName:""}));
                }}>Stall</button>
              <button type="button" className={others ? "selected" : ""} aria-pressed={others}
                onClick={()=>{
                  if(others) return;
                  setStandard("Others");setDivision("");resetStudent();
                  if(!others) setForm(current=>({...current,studentId:"",customerName:"",customerPhone:"",collectorType:"Student",collectorName:""}));
                  setErrors(current=>({...current,studentId:"",customerName:"",customerPhone:"",collectorName:""}));
                }}>Others</button>
            </div>
            {stall && <div className="info-box stall-order-notice"><ShoppingBag size={18} /><span><strong>Stall / direct order</strong><br />Enter the customer's name and phone below. A school standard, division and saved student are not required.</span></div>}
            {others && <OtherStudentForm key={otherFormKey} selected={student} onSelect={chooseStudent} onClear={resetStudent}/>}
            {standard && !stall && !others && (
              <>
                <div className="field-label spaced">
                  Select division <span className="required">*</span>
                </div>
                <div className="division-buttons">
                  {divisions[standard].map((d) => (
                    <button
                      className={division === d ? "selected" : ""}
                      key={d}
                      onClick={() => {
                        setDivision(d);
                        resetStudent();
                      }}
                      aria-pressed={division === d}
                    >
                      {division === d && <Check size={15} />} {d}
                    </button>
                  ))}
                </div>
              </>
            )}
            {!others && division && (
              <div className="autocomplete">
                <Field label="Search student" error={errors.studentId} required>
                  <div className="search-input">
                    <Search size={17} />
                    <input
                      role="combobox"
                      aria-expanded={studentOpen}
                      aria-controls="student-options"
                      aria-autocomplete="list"
                      aria-activedescendant={
                        studentOpen && studentOptions[studentIndex]
                          ? `student-${studentOptions[studentIndex].id}`
                          : undefined
                      }
                      value={studentSearch}
                      placeholder="Type a student name or phone number…"
                      onFocus={() => setStudentOpen(true)}
                      onBlur={() =>
                        setTimeout(() => setStudentOpen(false), 150)
                      }
                      onChange={(e) => {
                        setStudentSearch(e.target.value);
                        setStudentOpen(true);
                        setStudentIndex(0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                          e.preventDefault();
                          setStudentOpen(true);
                          setStudentIndex((i) =>
                            Math.max(
                              0,
                              Math.min(
                                studentOptions.length - 1,
                                i + (e.key === "ArrowDown" ? 1 : -1),
                              ),
                            ),
                          );
                        }
                        if (e.key === "Enter" && studentOpen) {
                          e.preventDefault();
                          if (studentOptions[studentIndex])
                            chooseStudent(studentOptions[studentIndex]);
                        }
                        if (e.key === "Escape") setStudentOpen(false);
                      }}
                    />
                  </div>
                </Field>
                {studentOpen && (
                  <div
                    className="autocomplete-options"
                    role="listbox"
                    id="student-options"
                  >
                    {studentOptions.length ? (
                      studentOptions.map((s, i) => (
                        <button
                          type="button"
                          role="option"
                          id={`student-${s.id}`}
                          aria-selected={i === studentIndex}
                          key={s.id}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => chooseStudent(s)}
                        >
                          <span>
                            <strong>{s.name}</strong>
                            <small>{s.phone}</small>
                          </span>
                          <span>
                            {s.standard} · {s.division}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p>No students found in this division.</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {!division && errors.studentId && (
              <p className="field-error" role="alert">
                {errors.studentId}
              </p>
            )}
            {student && (
              <div className="selected-student">
                <div className="selected-student-icon">
                  <UserRound size={22} />
                </div>
                <div>
                  <strong>{student.name}</strong>
                  <span>
                    {[student.phone,student.standard,student.division].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <Button variant="ghost" onClick={() => setHistory(true)}>
                  <History size={15} />
                  {historyOrders.length} previous orders
                </Button>
              </div>
            )}
          </FormSection>
          <FormSection
            step="02"
            title="Customer details"
            description="Who placed this order? It can be the student or someone else."
            icon={UserRound}
          >
            <div className="form-grid">
              <Field label="Customer name" required error={errors.customerName}>
                <input
                  value={form.customerName}
                  onChange={(e) => set("customerName", e.target.value)}
                  placeholder="Full name"
                  autoComplete="name"
                />
              </Field>
              <Field
                label="Customer phone number"
                required
                error={errors.customerPhone}
                hint={
                  isMock
                    ? "Demo numbers are fictional."
                    : "Enter the customer's 10-digit phone number."
                }
              >
                <input
                  inputMode="numeric"
                  maxLength={10}
                  value={form.customerPhone}
                  onChange={(e) => set("customerPhone", e.target.value)}
                  placeholder="10-digit phone number"
                  autoComplete="tel"
                />
              </Field>
            </div>
            <Button
              variant="ghost"
              className="customer-search-button"
              onClick={() => setCustomerModal(true)}
            >
              <Search size={15} />
              Find an existing customer & previous orders
            </Button>
          </FormSection>
          <FormSection
            step="03"
            title="Sweet & faral items"
            description="Select ordered items and enter quantities in kg, in multiples of 0.25."
            icon={ShoppingBag}
          >
            <div className="order-number-strip">
              <FileText size={16} />
              <span>Receipt no.</span>
              <strong>{billNumber}</strong>
              <span className="muted">
                {isMock
                  ? "Generated on local save"
                  : "Generated securely when saved"}
              </span>
            </div>
            <ProductChecklist products={data.products} items={form.items} original={original}
              errors={errors} onChange={items => set("items", items)} />
            <div className="item-subtotal">
              <span>Subtotal / final total</span>
              <strong>{money(total)}</strong>
            </div>
          </FormSection>
          <FormSection
            step="04"
            title="Payment details"
            description="Record the payment received. The balance takes care of itself."
            icon={Wallet}
          >
            <div className="form-grid">
              <Field label="Total amount">
                <input
                  readOnly
                  value={money(total)}
                  className="readonly-input"
                />
              </Field>
              <Field label={recordedOrder ? "Total received (recorded)" : "Advance amount (optional)"} error={errors.advance}>
                <div className="currency-input">
                  <span>₹</span>
                  <input
                    aria-label={recordedOrder ? "Total received (recorded)" : "Advance amount (optional)"}
                    readOnly={recordedOrder}
                    type="number"
                    min={0}
                    max={total}
                    step="0.01"
                    value={form.advance === 0 ? "" : form.advance}
                    placeholder="0.00"
                    onChange={(e) =>
                      set(
                        "advance",
                        e.target.value === "" ? 0 : Number(e.target.value),
                      )
                    }
                  />
                </div>
              </Field>
            </div>
            {recordedOrder && original.status !== "Collected" && <div className="info-box order-edit-payment">
              <span>Forgot to record an advance? Add the amount received to this same receipt. Existing payments stay unchanged.
                {hasOrderChanges && <small>Your order changes will be saved before the payment form opens.</small>}</span>
              <Button variant="secondary" loading={saving} onClick={() => void openPayment()}>
                <Wallet size={16} />{hasOrderChanges ? "Save changes & add payment" : "Add advance / payment"}
              </Button>
            </div>}
            <fieldset className="radio-fieldset">
              <legend>
                Payment method <span className="required">*</span>
              </legend>
              <div className="radio-options">
                {(["Cash", "Online"] as const).map((method) => (
                  <label
                    key={method}
                    className={form.paymentMethod === method ? "selected" : ""}
                  >
                    <input
                      type="radio"
                      name="payment-method"
                      disabled={recordedOrder}
                      value={method}
                      checked={form.paymentMethod === method}
                      onChange={() => set("paymentMethod", method)}
                    />
                    {method}
                  </label>
                ))}
              </div>
            </fieldset>
            {form.paymentMethod === "Online" && (
              <Field
                label="UTR number"
                required
                error={errors.utr}
                hint="Reference for the online payment already received."
              >
                <input
                  value={form.utr}
                  readOnly={recordedOrder}
                  onChange={(e) => set("utr", e.target.value)}
                  placeholder="Enter transaction reference"
                />
              </Field>
            )}
            <div
              className={`remaining-balance ${balance(form) < 0 ? "invalid" : ""}`}
            >
              <span>Remaining balance</span>
              <strong>{money(balance(form))}</strong>
            </div>
          </FormSection>
          <FormSection
            step="05"
            title="Collection details"
            description="When will the faral be collected, and by whom?"
            icon={CalendarDays}
          >
            <div className="form-grid">
              <Field
                label="Delivery / collection date"
                required
                error={errors.collectionDate}
              >
                <input
                  type="date"
                  min={original ? undefined : today()}
                  value={form.collectionDate}
                  onChange={(e) => set("collectionDate", e.target.value)}
                />
              </Field>
              <Field label="Order collected by">
                <select
                  value={form.collectorType}
                  onChange={(e) => {
                    const type = e.target.value as "Student" | "Customer";
                    setForm((f) => ({
                      ...f,
                      collectorType: type,
                      collectorName:
                        type === "Student"
                          ? (student?.name ?? "")
                          : f.customerName,
                    }));
                  }}
                >
                  {!stall && <option>Student</option>}
                  <option>Customer</option>
                </select>
              </Field>
              <Field
                label="Collector name"
                required
                error={errors.collectorName}
                hint="You can adjust the name when someone else collects the order."
              >
                <input
                  value={form.collectorName}
                  onChange={(e) => set("collectorName", e.target.value)}
                />
              </Field>
            </div>
          </FormSection>
          <div className="order-bottom-actions">
            <Button variant="ghost" onClick={() => setCancel(true)}>
              Cancel
            </Button>
            <div>
              {(!original || original.status === "Draft") && (
                <Button
                  variant="secondary"
                  loading={saving}
                  onClick={() => save(true)}
                >
                  <Save size={16} />
                  Save draft
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => {
                  if (validate()) setPreview(true);
                }}
              >
                <Eye size={16} />
                Preview bill
              </Button>
              <Button loading={saving} onClick={() => save()}>
                <Check size={17} />
                {original && original.status !== "Draft"
                  ? "Save changes"
                  : "Save order"}
              </Button>
            </div>
          </div>
        </div>
        <aside className="order-summary">
          <div className="summary-top">
            <span className="eyebrow">A LITTLE CHECK BEFORE YOU SAVE</span>
            <h2>Order summary</h2>
            <span className="summary-order-number">{billNumber}</span>
          </div>
          <div className="summary-student">
            <UserRound size={18} />
            <div>
              <strong>{stall ? "Stall / direct order" : student?.name ?? (others ? "Add / select an Others student" : "Select a student")}</strong>
              <span>
                {stall ? form.customerName || "Enter customer details" : student
                  ? [student.standard,student.division].filter(Boolean).join(" · ")
                  : others ? "1st–4th standard" : "Start with their standard & division"}
              </span>
            </div>
          </div>
          <div className="summary-items">
            {form.items
              .filter((i) => i.productId)
              .map((i) => (
                <div key={i.productId}>
                  <span>
                    {i.name}
                    <small>
                      {Number.isFinite(i.quantity) ? i.quantity : "—"} kg ·{" "}
                      {rateMoney(i.price)} / 250 ग्रॅम
                    </small>
                  </span>
                  <strong>{money(lineTotal(i))}</strong>
                </div>
              ))}
            {!form.items.some((i) => i.productId) && (
              <p>Your faral favourites will appear here.</p>
            )}
          </div>
          <div className="summary-calculation">
            <div>
              <span>Subtotal</span>
              <strong>{money(total)}</strong>
            </div>
            <div>
              <span>Advance payment</span>
              <strong>{money(form.advance)}</strong>
            </div>
            <div className="summary-total">
              <span>Balance due</span>
              <strong>{money(balance(form))}</strong>
            </div>
          </div>
          <div className="summary-collection">
            <CalendarDays size={16} />
            <span>
              Collection on <strong>{form.collectionDate || "—"}</strong>
            </span>
          </div>
          <Button
            className="full-width"
            loading={saving}
            onClick={() => save()}
          >
            {original && original.status !== "Draft"
              ? "Save changes"
              : "Save order"}
            <ArrowRight size={16} />
          </Button>
          <p className="summary-note">
            Prices are recorded with this order.
            <br />
            Future price updates won’t change this bill.
          </p>
        </aside>
      </div>
      <Modal
        open={history}
        onClose={() => setHistory(false)}
        wide
        title={`${student?.name ?? "Student"} · order history`}
        description={`${historyOrders.length} previous orders in this workspace.`}
      >
        <OrderTable orders={historyOrders} compact />
      </Modal>
      <Modal
        open={customerModal}
        onClose={() => setCustomerModal(false)}
        title="Find an existing customer"
        description="Search by name or phone, and reuse their details."
      >
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search existing customers"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            placeholder="Customer name or phone number"
          />
        </div>
        <div className="customer-results">
          {customerSearch &&
            data.orders
              .filter((o) =>
                `${o.customerName} ${o.customerPhone}`
                  .toLowerCase()
                  .includes(customerSearch.toLowerCase()),
              )
              .slice(0, 8)
              .map((o) => (
                <div key={o.id}>
                  <div>
                    <strong>{o.customerName}</strong>
                    <span>
                      {o.customerPhone} · {o.number} · {money(orderTotal(o))}
                    </span>
                    <Link to={`/orders/${o.id}`}>Review previous order</Link>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const s = data.students.find((s) => s.id === o.studentId);
                      if (s && !stall && (!others || isOtherStandard(s.standard))) chooseStudent(s);
                      setForm((f) => ({
                        ...f,
                        customerName: o.customerName,
                        customerPhone: o.customerPhone,
                        collectorName:
                          f.collectorType === "Customer"
                            ? o.customerName
                            : (s?.name ?? ""),
                      }));
                      setCustomerModal(false);
                    }}
                  >
                    Use details
                  </Button>
                </div>
              ))}
          {customerSearch &&
            !data.orders.some((o) =>
              `${o.customerName} ${o.customerPhone}`
                .toLowerCase()
                .includes(customerSearch.toLowerCase()),
            ) && (
              <p className="muted">
                No matching customers. You can enter a new customer directly.
              </p>
            )}
        </div>
      </Modal>
      <Modal
        open={cancel}
        onClose={() => setCancel(false)}
        title="Leave this order?"
        description="Unsaved changes will be discarded."
      >
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setCancel(false)}>
            Keep editing
          </Button>
          <Button variant="danger" onClick={() => navigate("/orders")}>
            Discard changes
          </Button>
        </div>
      </Modal>
      <Modal
        open={preview}
        onClose={() => setPreview(false)}
        wide
        title="Bill preview"
        description="Review the details before saving."
      >
        <Bill order={previewOrder} />
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={16} />
            Print preview
          </Button>
          <Button
            onClick={() => {
              setPreview(false);
              void save();
            }}
          >
            Save order
          </Button>
        </div>
      </Modal>
      {payment && original && <PaymentDialog orderId={original.id} onClose={() => setPayment(false)}
        onSaved={() => navigate(`/orders/${original.id}`)} />}
      <Modal
        open={!!saved}
        onClose={() => {
          if (saved) navigate(`/orders/${saved.id}`);
        }}
        title={
          saved?.status === "Draft"
            ? "Draft saved for later."
            : "A sweet little success."
        }
      >
        <div className="success-confirmation">
          <div>
            <CheckCircle2 size={35} />
          </div>
          <h3>
            {saved?.number} is{" "}
            {saved?.status === "Draft"
              ? "saved as a draft"
              : "ready in your workspace"}
            .
          </h3>
          <p>
            {saved?.status === "Draft"
              ? "Resume from All Orders whenever you’re ready."
              : "Your order list, payments, dashboard, and activity are up to date."}
          </p>
        </div>
        <div className="modal-actions">
          <Button
            variant="secondary"
            onClick={() => {
              setSaved(null);
              navigate("/orders/new");
              if (!id) {
                setRequestId(crypto.randomUUID());
                setOtherFormKey(value=>value+1);
                setForm({...blankOrder(),collectorType:stall ? "Customer" : "Student"});
                setStandard(stall ? "Stall" : others ? "Others" : "");
                setDivision("");
              }
            }}
          >
            Create another
          </Button>
          <Button onClick={() => navigate(`/orders/${saved!.id}`)}>
            View {saved?.status === "Draft" ? "draft" : "order"}
            <ArrowRight size={16} />
          </Button>
        </div>
      </Modal>
    </>
  );
}
