export const DEMO_TODAY = "2026-10-11";
export const today = () =>
  import.meta.env?.DEV && import.meta.env.VITE_DATA_MODE === "mock"
    ? DEMO_TODAY
    : dayKey(new Date().toISOString());
export const money = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
export const number = (amount: number) =>
  new Intl.NumberFormat("en-IN").format(amount);
export const date = (value: string, full = false) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        ...(full ? { year: "numeric" } : {}),
        timeZone: "Asia/Kolkata",
      }).format(
        new Date(value.length === 10 ? `${value}T00:00:00+05:30` : value),
      )
    : "—";
export const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
export const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
export const now = () => new Date().toISOString();
export const latestDate = (values: string[]) =>
  values.reduce(
    (latest, value) =>
      !latest || new Date(value).getTime() > new Date(latest).getTime()
        ? value
        : latest,
    "",
  );
export const dayKey = (value: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
