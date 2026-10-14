export function csvText(headers: string[], rows: (string | number)[][]) {
  const escape = (value: string | number) => {
    let text = String(value);
    if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n")
  );
}
export function downloadCSV(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const url = URL.createObjectURL(
    new Blob([csvText(headers, rows)], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadExcel(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const xlsx = await import("xlsx");
  const sheet = xlsx.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map((header, i) => ({
    wch: Math.min(
      32,
      Math.max(
        header.length + 2,
        ...rows.map((row) => String(row[i] ?? "").length + 2),
      ),
    ),
  }));
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, "Orders");
  xlsx.writeFileXLSX(workbook, filename);
}
