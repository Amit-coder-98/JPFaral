import * as xlsx from "xlsx";
import { detectMapping, type StudentImportRow } from "./studentImport";

export type StudentWorkbook = {
  sheetNames: string[];
  grids: Record<string, string[][]>;
};
export type ParsedStudentSheet = {
  rows: StudentImportRow[];
  headers: string[];
  mapping: ReturnType<typeof detectMapping>;
  headerRow: number;
  sheetName: string;
};
export function readStudentWorkbook(bytes: ArrayBuffer): StudentWorkbook {
  const workbook = xlsx.read(bytes, { type: "array", raw: true });
  return {
    sheetNames: workbook.SheetNames,
    grids: Object.fromEntries(
      workbook.SheetNames.map((name) => [
        name,
        xlsx.utils
          .sheet_to_json<
            string[]
          >(workbook.Sheets[name], { header: 1, raw: false, defval: "", blankrows: true })
          .map((row) => row.map((value) => String(value ?? ""))),
      ]),
    ),
  };
}
export function detectHeaderRow(grid: string[][]) {
  let best = 0,
    bestScore = -1;
  grid.slice(0, 50).forEach((row, index) => {
    const mapping = detectMapping(row);
    const score =
      Number(Boolean(mapping.name)) * 3 +
      Number(Boolean(mapping.standard)) +
      Number(Boolean(mapping.division)) +
      Number(Boolean(mapping.phone));
    if (row.some((value) => value.trim()) && score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best + 1;
}
export function parseStudentSheet(
  source: StudentWorkbook,
  sheetName: string,
  headerRow = detectHeaderRow(source.grids[sheetName] ?? []),
): ParsedStudentSheet {
  const grid = source.grids[sheetName];
  if (!grid)
    throw new Error("Choose a worksheet containing your student directory.");
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > grid.length)
    throw new Error("Choose a valid header row.");
  const rawHeaders = grid[headerRow - 1];
  const used = new Set<string>();
  const headers = rawHeaders.map((value, index) => {
    const base = value.trim() || `Column ${xlsx.utils.encode_col(index)}`;
    let label = base,
      repeat = 2;
    while (used.has(label)) {
      label = `${base} (${repeat++})`;
    }
    used.add(label);
    return label;
  });
  const rows: StudentImportRow[] = [];
  grid.slice(headerRow).forEach((values, index) => {
    if (!values.some((value) => value.trim())) return;
    // Report generators sometimes repeat the header on each printed page.
    if (
      rawHeaders.every(
        (header, i) => header.trim() === String(values[i] ?? "").trim(),
      )
    )
      return;
    rows.push({
      ...Object.fromEntries(
        headers.map((header, i) => [header, values[i] ?? ""]),
      ),
      __sourceRow: headerRow + index + 1,
      __sourceSheet: sheetName,
    });
  });
  if (!rows.length)
    throw new Error(
      "No student rows found below the selected header. Check the worksheet and header row.",
    );
  if (rows.length > 2000)
    throw new Error("Import at most 2000 students per reviewed file.");
  return {
    rows,
    headers,
    mapping: detectMapping(headers),
    headerRow,
    sheetName,
  };
}
