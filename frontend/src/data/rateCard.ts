import type { Product } from "../types";

// Client-approved names and printed rates. Persistent storage remains per kg.
export const rateCard: {
  name: string;
  ratePer250g: number;
  category: Product["category"];
}[] = [
  { name: "मोतीचूर लाडू", ratePer250g: 110, category: "Sweet" },
  { name: "बेसन लाडू (तुपातील)", ratePer250g: 165, category: "Sweet" },
  { name: "रवा लाडू (तुपातील)", ratePer250g: 140, category: "Sweet" },
  { name: "पौष्टिक लाडू (तुपातील)", ratePer250g: 175, category: "Sweet" },
  { name: "करंजी (तुपातील)", ratePer250g: 140, category: "Sweet" },
  { name: "शंकरपाळी", ratePer250g: 110, category: "Sweet" },
  { name: "चिरोटे", ratePer250g: 125, category: "Sweet" },
  { name: "बालुशाही", ratePer250g: 110, category: "Sweet" },
  { name: "काजू कतली", ratePer250g: 350, category: "Sweet" },
  { name: "साधा चिवडा (मुरमुरे)", ratePer250g: 100, category: "Savoury" },
  { name: "मका चिवडा", ratePer250g: 110, category: "Savoury" },
  { name: "पोहे चिवडा", ratePer250g: 110, category: "Savoury" },
  { name: "गहू चिवडा", ratePer250g: 100, category: "Savoury" },
  { name: "मसाला शेव", ratePer250g: 120, category: "Savoury" },
  { name: "भावनागरी शेव", ratePer250g: 120, category: "Savoury" },
  { name: "बारीक शेव", ratePer250g: 120, category: "Savoury" },
  { name: "चकली", ratePer250g: 110, category: "Savoury" },
  { name: "खारी बुंदी", ratePer250g: 115, category: "Savoury" },
  { name: "खारी शंकरपाळी", ratePer250g: 120, category: "Savoury" },
  { name: "लाल एडमी", ratePer250g: 100, category: "Savoury" },
  { name: "हिरवे एडमी", ratePer250g: 100, category: "Savoury" },
  { name: "पेरी स्टिक", ratePer250g: 100, category: "Savoury" },
  { name: "मिंट स्टिक", ratePer250g: 100, category: "Savoury" },
  { name: "मूग बाईट", ratePer250g: 100, category: "Savoury" },
  { name: "पालक चुरचुरे", ratePer250g: 100, category: "Savoury" },
  { name: "चटपटीत चुरचुरे", ratePer250g: 100, category: "Savoury" },
];
