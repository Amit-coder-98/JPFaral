import type { AppState, Product, Student } from "../types";
import { rateCard } from "./rateCard";
import { pricePerKgFrom250g } from "../utils/pricing";
import { orderTotal } from "../utils/calculations";
export const divisions: Record<string, string[]> = {
  "5th": ["Devi Padmini", "Rana Pratap"],
  "6th": ["Gautam Buddha", "Mahaveer"],
  "7th": ["Chaitanya Prabhu", "Kabir"],
  "8th": ["Rani Channamma", "Rani Laxmibai"],
  "9th": ["Aryabhatta", "Kanad"],
  "10th": ["Dayanand", "Arvind"],
};
const sampleQuantities = [0.5, 1, 1.5, 2, 2.5, 3, 5];
export const products: Product[] = rateCard.map((p, i) => ({
  id: "p" + (i + 1),
  name: p.name,
  price: pricePerKgFrom250g(p.ratePer250g),
  category: p.category,
  available: true,
  description: "",
}));
export function seedData(): AppState {
  const first = [
    "Aarav",
    "Anaya",
    "Vihaan",
    "Ishita",
    "Atharva",
    "Saanvi",
    "Aditya",
    "Meera",
    "Vedant",
    "Diya",
    "Rohan",
    "Kavya",
    "Om",
    "Riya",
    "Arjun",
    "Avani",
    "Soham",
    "Sara",
    "Yash",
    "Tanvi",
    "Neel",
    "Aditi",
    "Dhruv",
    "Mira",
  ];
  const last = [
    "Deshmukh",
    "Kulkarni",
    "Patil",
    "Joshi",
    "More",
    "Pawar",
    "Shinde",
    "Jadhav",
    "Apte",
    "Bhosale",
    "Gokhale",
    "Naik",
    "Kale",
    "Deshpande",
    "Sawant",
    "Oak",
    "Dange",
    "Sathe",
    "Phadke",
    "Inamdar",
    "Lele",
    "Gadgil",
  ];
  const students: Student[] = Object.entries(divisions).flatMap(
    ([standard, list], s) =>
      list.flatMap((division, d) =>
        Array.from({ length: 44 }, (_, i) => {
          const n = s * 88 + d * 44 + i;
          return {
            id: `s${n + 1}`,
            name: `${first[n % first.length]} ${last[Math.floor(n / first.length) % last.length]}`,
            phone: `00000${String(n + 1).padStart(5, "0")}`,
            standard,
            division,
          };
        }),
      ),
  );
  const staff: AppState["staff"] = [
    {
      id: "u1",
      name: "Aditi Deshpande",
      email: "admin@jpfaral.demo",
      role: "Super Admin",
      active: true,
      lastActivity: "2026-10-11T12:15:00+05:30",
    },
    {
      id: "u2",
      name: "Priya Kulkarni",
      email: "priya@jpfaral.demo",
      role: "Data Entry Staff",
      active: true,
      lastActivity: "2026-10-11T11:50:00+05:30",
    },
    {
      id: "u3",
      name: "Rahul Joshi",
      email: "rahul@jpfaral.demo",
      role: "Data Entry Staff",
      active: true,
      lastActivity: "2026-10-11T11:35:00+05:30",
    },
    {
      id: "u4",
      name: "Sneha Patil",
      email: "sneha@jpfaral.demo",
      role: "Data Entry Staff",
      active: true,
      lastActivity: "2026-10-10T15:30:00+05:30",
    },
    {
      id: "u5",
      name: "Mihir Apte",
      email: "mihir@jpfaral.demo",
      role: "Data Entry Staff",
      active: false,
      lastActivity: "2026-10-04T10:00:00+05:30",
    },
  ];
  const orders: AppState["orders"] = Array.from({ length: 86 }, (_, i) => {
    const student = students[(i * 7) % students.length];
    const items = Array.from({ length: 2 + (i % 3) }, (_, k) => {
      const p = products[(i + k * 2) % 8];
      return {
        productId: p.id,
        name: p.name,
        price: p.price,
        quantity: sampleQuantities[(i + k) % 4],
      };
    });
    const total = orderTotal({ items });
    const collected = i % 5 === 0;
    const advance =
      collected || i % 7 === 0
        ? total
        : i % 4 === 0
          ? 0
          : Math.min(500, total / 2);
    const createdAt = `2026-10-${String(1 + Math.floor(i / 8)).padStart(2, "0")}T${String(9 + (i % 3)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}:00+05:30`;
    const user = staff[i % 4];
    return {
      id: `o${i + 1}`,
      number: `JP-${String(i + 1).padStart(4, "0")}`,
      studentId: student.id,
      customerName:
        i % 3 === 0 ? `Mrs. ${student.name.split(" ")[1]}` : student.name,
      customerPhone: student.phone,
      items,
      advance,
      paymentMethod: i % 3 === 0 ? "Online" : "Cash",
      utr: i % 3 === 0 ? `DEMO${String(100000000000 + i)}` : "",
      collectionDate: `2026-10-${collected ? String(1 + Math.floor(i / 8)).padStart(2, "0") : i % 2 === 0 ? "15" : "16"}`,
      collectorType: i % 2 === 0 ? "Student" : "Customer",
      collectorName:
        i % 2 !== 0 && i % 3 === 0
          ? `Mrs. ${student.name.split(" ")[1]}`
          : student.name,
      status: collected ? "Collected" : "Confirmed",
      createdBy: user.id,
      createdAt,
      editedBy: user.id,
      editedAt: createdAt,
    };
  });
  const payments = orders
    .filter((o) => o.advance > 0)
    .map((o) => ({
      id: `pay-${o.id}`,
      orderId: o.id,
      amount: o.advance,
      method: o.paymentMethod,
      utr: o.utr,
      receivedBy: o.createdBy,
      date: o.createdAt,
    }));
  const logs: AppState["logs"] = orders.map((o) => ({
    id: `log-${o.id}`,
    userId: o.createdBy,
    action: "Created",
    recordType: "Order",
    recordId: o.number,
    timestamp: o.createdAt,
    summary: `Created an order for ${o.customerName}`,
    changes: [],
  }));
  orders[80].editedBy = "u1";
  orders[80].editedAt = "2026-10-11T11:45:00+05:30";
  logs.unshift({
    id: "log-edit-demo",
    userId: "u1",
    action: "Edited",
    recordType: "Order",
    recordId: orders[80].number,
    timestamp: orders[80].editedAt,
    summary: "Adjusted the collection date",
    changes: [
      {
        field: "Collection date",
        before: "2026-10-14",
        after: orders[80].collectionDate,
      },
    ],
  });
  logs.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  return {
    students,
    products: structuredClone(products),
    staff,
    orders,
    payments,
    logs,
    settings: {
      organization: "JPfaral",
      contact: "office@jpfaral.demo",
      address: "Jnanaprabodhini School, Pune, Maharashtra",
      accent: "#b56735",
      compact: false,
      reduceMotion: false,
    },
  };
}
