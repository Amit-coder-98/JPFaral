import type { Student } from "../types";
import { divisions } from "../data/reference";
export type Mapping = {
  name: string;
  phone: string;
  standard: string;
  division: string;
};
export type StudentImportRow = Record<string, unknown> & {
  __sourceRow?: number;
  __sourceSheet?: string;
};
export type DivisionMapping = Record<string, string>;
const normalized = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
export function detectMapping(headers: string[]): Mapping {
  const find = (...patterns: RegExp[]) =>
    patterns
      .map((pattern) =>
        headers.find((header) => pattern.test(normalized(header))),
      )
      .find(Boolean) ?? "";
  return {
    name: find(
      /^(student[ _-]*(full[ _-]*)?name|full[ _-]*name|name)$/i,
      /^(पूर्ण\s*नाव|विद्यार्थ्याचे\s*नाव|विद्यार्थी\s*नाव|नाव)$/,
    ),
    phone: find(
      /^(phone|mobile|contact)([ _-]*(number|no\.?))?$/i,
      /^(मोबाईल|मोबाइल|फोन|संपर्क)(\s*(नंबर|क्रमांक))?$/,
    ),
    standard: find(/^(standard|class|grade)$/i, /^(इयत्ता|वर्ग)$/),
    division: find(/^division$/i, /^तुकडी$/),
  };
}
export const resolveStandard = (value: unknown) =>
  Object.keys(divisions).find(
    (standard) =>
      normalized(standard) === normalized(value) ||
      standard.replace(/\D/g, "") === normalized(value),
  );
export const divisionMappingKey = (standard: string, value: unknown) =>
  `${standard}|${normalized(value)}`;
const reportCode = (value: unknown) =>
  normalized(value).match(/^([a-z])(?:$|\s*[-–:])/)?.[1];
const namedReportDivision = (standard: string, value: unknown) => {
  const raw = normalized(value),
    named = raw.replace(/^[a-z]\s*[-–:]\s*/, "");
  // Explicit spelling used by the supplied school report, not an A/B default.
  const alias = standard === "8th" && named === "rani laxmi"
    ? "Rani Laxmibai"
    : undefined;
  return (divisions[standard] ?? []).find(
    (name) => normalized(name) === raw || normalized(name) === named || name === alias,
  );
};
export function resolveDivision(
  standard: string,
  value: unknown,
  overrides: DivisionMapping = {},
) {
  const key = divisionMappingKey(standard, value),
    named = namedReportDivision(standard, value);
  if (Object.hasOwn(overrides, key)) {
    const selected = overrides[key];
    if (named && selected !== named) return undefined;
    return (divisions[standard] ?? []).find((name) => name === selected);
  }
  return named;
}
export function reportDivisions(
  rows: StudentImportRow[],
  mapping: Mapping,
) {
  const result = new Map<
    string,
    { key: string; standard: string; source: string; count: number; matched?: string }
  >();
  for (const row of rows) {
    const standard = resolveStandard(row[mapping.standard]),
      source = String(row[mapping.division] ?? "").trim();
    if (!standard || !source) continue;
    const key = divisionMappingKey(standard, source);
    const previous = result.get(key);
    result.set(key, {
      key, standard, source, count: (previous?.count ?? 0) + 1,
      matched: namedReportDivision(standard, source),
    });
  }
  return [...result.values()].sort(
    (a, b) =>
      Number(a.standard.replace(/\D/g, "")) -
        Number(b.standard.replace(/\D/g, "")) ||
      a.source.localeCompare(b.source),
  );
}
export function validateImport(
  rows: StudentImportRow[],
  mapping: Mapping,
  existing: Student[],
  divisionOverrides: DivisionMapping = {},
) {
  const groups = reportDivisions(rows, mapping);
  const targets = new Map<string, Set<string>>();
  const codes = new Map<string, Set<string>>();
  for (const group of groups) {
    const target = resolveDivision(group.standard, group.source, divisionOverrides),
      code = reportCode(group.source);
    if (!target || !code) continue;
    const targetKey = `${group.standard}|${target}`,
      codeKey = `${group.standard}|${code}`;
    targets.set(targetKey, (targets.get(targetKey) ?? new Set()).add(code));
    codes.set(codeKey, (codes.get(codeKey) ?? new Set()).add(target));
  }
  const identity = (
    s: Pick<Student, "name" | "phone" | "standard" | "division">,
  ) => [s.name.trim().toLowerCase(), s.phone, s.standard, s.division].join("|");
  const seen = new Set(existing.map(identity));
  const phones = new Set(existing.map((s) => s.phone).filter(Boolean));
  const identityRows = [...existing];
  const valid: Student[] = [];
  const errors: { row: number; message: string }[] = [];
  const warnings: { row: number; message: string }[] = [];
  rows.forEach((row, index) => {
    const name = String(row[mapping.name] ?? "").trim();
    const phone = String(row[mapping.phone] ?? "").trim();
    const rawStandard = String(row[mapping.standard] ?? "").trim();
    const standard = resolveStandard(rawStandard);
    const rawDivision = String(row[mapping.division] ?? "").trim();
    const division = standard
      ? resolveDivision(standard, rawDivision, divisionOverrides)
      : undefined;
    const code = reportCode(rawDivision);
    const named = standard ? namedReportDivision(standard, rawDivision) : undefined;
    const issues = [
      !name || name.length < 2 ? "Student name is required" : "",
      name.length > 120 ? "Student name must be at most 120 characters" : "",
      phone && !/^\d{10}$/.test(phone)
        ? "Phone must have 10 digits when provided (preserve leading zeros)"
        : "",
      !standard ? "Standard must be 5th–10th" : "",
      !division
        ? named
          ? `Report names ${named}; select that named division`
          : "Division must match the selected standard"
        : "",
      division && code && (targets.get(`${standard}|${division}`)?.size ?? 0) > 1
        ? "Different report codes (A/B) must use different named divisions"
        : "",
      code && (codes.get(`${standard}|${code}`)?.size ?? 0) > 1
        ? "The same report code must use one named division throughout the standard"
        : "",
      seen.has(
        identity({
          name,
          phone,
          standard: standard ?? "",
          division: division ?? "",
        }),
      ) ||
      identityRows.some(
        (s) =>
          normalized(s.name) === normalized(name) &&
          s.standard === standard &&
          s.division === division &&
          (!phone || !s.phone),
      )
        ? "Duplicate student record; administrative review required"
        : "",
    ].filter(Boolean);
    if (issues.length)
      errors.push({
        row: row.__sourceRow ?? index + 2,
        message: issues.join("; "),
      });
    else {
      seen.add(
        identity({ name, phone, standard: standard!, division: division! }),
      );
      if (phone && phones.has(phone))
        warnings.push({
          row: row.__sourceRow ?? index + 2,
          message:
            "Shared phone number. Review the name and class before importing.",
        });
      if (phone) phones.add(phone);
      identityRows.push({
        id: "",
        name,
        phone,
        standard: standard!,
        division: division!,
      });
      valid.push({
        id: crypto.randomUUID(),
        name,
        phone,
        standard: standard!,
        division: division!,
      });
    }
  });
  return { valid, errors, warnings };
}
