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
  downloadBlob(filename,new Blob([csvText(headers, rows)], { type: "text/csv;charset=utf-8;" }));
}
function downloadBlob(filename:string,blob:Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser time to start reading the download, including on phones.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
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
  const buffer = xlsx.write(workbook,{bookType:"xlsx",type:"array"});
  downloadBlob(filename,new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
}
