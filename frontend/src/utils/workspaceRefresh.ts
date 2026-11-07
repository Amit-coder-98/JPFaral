export const AUTO_CHECK_INTERVAL = 60_000;
export const QUOTA_RETRY_INTERVAL = 5 * 60_000;

export const changeColumns = {
  students: "updated_at", profiles: "updated_at", products: "updated_at",
  orders: "updated_at", payments: "paid_at", organization_settings: "updated_at",
} as const;
export type ChangeTable = keyof typeof changeColumns;

export function changeSignature(rows: Record<string, unknown>[], column: string, count = rows.length): string {
  const latest = rows.reduce<Record<string, unknown> | undefined>((previous, row) => {
    if (!previous) return row;
    const difference = Date.parse(String(row[column])) - Date.parse(String(previous[column]));
    // PostgreSQL timestamps can distinguish edits within the same millisecond.
    const fraction = (value: unknown) => (String(value).match(/\.(\d+)/)?.[1] ?? "").padEnd(9, "0");
    const newerFraction = difference === 0 && fraction(row[column]) > fraction(previous[column]);
    const tied = difference === 0 && fraction(row[column]) === fraction(previous[column]);
    return difference > 0 || newerFraction || (tied && String(row.id) > String(previous.id)) ? row : previous;
  }, undefined);
  return JSON.stringify([count, latest ? String(latest[column] ?? "") : "", latest ? String(latest.id) : ""]);
}
