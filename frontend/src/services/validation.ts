import { z } from "zod";
import { orderTotal } from "../utils/calculations";
import {
  MAX_QUANTITY_KG,
  MAX_ORDER_TOTAL,
  QUANTITY_MESSAGE,
} from "../utils/pricing";
export const quantitySchema = z
  .number({ error: QUANTITY_MESSAGE })
  .positive(QUANTITY_MESSAGE)
  .max(MAX_QUANTITY_KG, "या प्रणालीत कमाल प्रमाण 9999.75 kg आहे.")
  .multipleOf(0.25, QUANTITY_MESSAGE);
export const phoneSchema = z
  .string()
  .regex(/^\d{10}$/, "Enter a 10-digit phone number");
export const orderSchema = z
  .object({
    studentId: z.string().min(1, "Select a student"),
    customerName: z
      .string()
      .trim()
      .min(2, "Enter the customer’s name")
      .max(120),
    customerPhone: phoneSchema,
    items: z
      .array(
        z.object({
          productId: z.string().min(1, "Select a product"),
          name: z.string().min(1),
          price: z.number().positive().max(1000000),
          quantity: quantitySchema,
        }),
      )
      .min(1, "Add at least one item")
      .max(30, "An order can have at most 30 items"),
    advance: z
      .number()
      .min(0, "Advance cannot be negative")
      .multipleOf(0.01, "Use up to two decimal places"),
    paymentMethod: z.enum(["Cash", "Online"]),
    utr: z.string(),
    collectionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a collection date"),
    collectorType: z.enum(["Student", "Customer"]),
    collectorName: z
      .string()
      .trim()
      .min(2, "Enter the collector’s name")
      .max(120),
  })
  .superRefine((o, ctx) => {
    if (orderTotal(o) > MAX_ORDER_TOTAL)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message:
          "Order total exceeds the database's supported amount. Split this order.",
      });
    if (o.advance > orderTotal(o))
      ctx.addIssue({
        code: "custom",
        path: ["advance"],
        message: "Advance cannot exceed the order total",
      });
    if (o.paymentMethod === "Online" && !o.utr.trim())
      ctx.addIssue({
        code: "custom",
        path: ["utr"],
        message: "UTR is required for an online payment",
      });
    if (new Set(o.items.map((i) => i.productId)).size !== o.items.length)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message:
          "Each product can appear only once; adjust its quantity instead",
      });
  });
