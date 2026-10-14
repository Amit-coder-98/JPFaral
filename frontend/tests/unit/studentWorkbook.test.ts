import { describe, it, expect } from "vitest";
import fs from "node:fs";
import * as xlsx from "xlsx";
import {
  readStudentWorkbook,
  parseStudentSheet,
  detectHeaderRow,
} from "../../src/services/studentWorkbook";
import {
  detectMapping,
  validateImport,
  divisionMappingKey,
  reportDivisions,
} from "../../src/services/studentImport";
import { orderSchema } from "../../src/services/validation";
import { divisions } from "../../src/data/reference";

// The real school directory stays private and is available only for local audits.
const actualReport = new URL("../../../DynamicReport.xls", import.meta.url);

const report = (rows: unknown[][]) => {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.aoa_to_sheet(rows),
    "Report",
  );
  const buffer = xlsx.write(workbook, {
    type: "array",
    bookType: "biff8",
  }) as ArrayBuffer;
  return readStudentWorkbook(buffer);
};
describe("student report parsing", () => {
  it("detects the Marathi name header after three report title rows and preserves real source row numbers", () => {
    const source = report([
      ["School"],
      ["School address"],
      ["Student report 2026"],
      [
        "Sr No",
        "Class",
        "Division",
        "पूर्ण नाव",
        "तुकडी",
        "वर्ग",
        "जन्म तारीख",
      ],
      [1, 5, "A", "Test student", 1, 1, "01/01/2016"],
    ]);
    const parsed = parseStudentSheet(source, "Report");
    expect(parsed.headerRow).toBe(4);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.mapping).toEqual({
      name: "पूर्ण नाव",
      phone: "",
      standard: "Class",
      division: "Division",
    });
    expect(parsed.rows[0].__sourceRow).toBe(5);
    expect(parsed.headers).not.toContain("__EMPTY");
    const initial = validateImport(parsed.rows, parsed.mapping, []);
    expect(initial.valid).toHaveLength(0);
    expect(initial.errors[0].row).toBe(5);
    const mapped = validateImport(parsed.rows, parsed.mapping, [], {
      [divisionMappingKey("5th", "A")]: "Rana Pratap",
    });
    expect(mapped.valid[0].division).toBe("Rana Pratap");
    expect(mapped.valid[0].phone).toBe("");
    expect(mapped.errors).toHaveLength(0);
  });
  it("shows every source group, matches explicit report names, and never guesses bare A/B codes", () => {
    const mapping = {
      name: "Name",
      phone: "Phone",
      standard: "Class",
      division: "Division",
    };
    const rows = [
      { Name: "First child", Class: 5, Division: "A" },
      { Name: "Second child", Class: 8, Division: "B-Rani Laxmi" },
    ];
    expect(reportDivisions(rows, mapping)).toHaveLength(2);
    expect(validateImport(rows, mapping, []).valid).toHaveLength(1);
    expect(validateImport(rows, mapping, []).valid[0].division).toBe("Rani Laxmibai");
    expect(
      validateImport(rows, mapping, [], {
        [divisionMappingKey("5th", "A")]: "Mahaveer",
      }).valid,
    ).toHaveLength(1);
    expect(
      validateImport(
        [{ Name: "Explicit name", Class: 8, Division: "A-Rani Channamma" }],
        mapping,
        [],
      ).valid[0].division,
    ).toBe("Rani Channamma");
    expect(reportDivisions([
      { Name: "Named A", Class: 8, Division: "A-Rani Channamma" },
      { Name: "Named B", Class: 8, Division: "B-Rani Laxmi" },
    ], mapping).map(g=>[g.source,g.count,g.matched])).toEqual([
      ["A-Rani Channamma",1,"Rani Channamma"],
      ["B-Rani Laxmi",1,"Rani Laxmibai"],
    ]);
    expect(validateImport([{Name:"Unknown name",Class:8,Division:"B-Rani"}],mapping,[]).valid).toHaveLength(0);
  });
  it("blocks merging A/B groups, contradictory named mappings, and inconsistent mappings of the same code", () => {
    const mapping = {name:"Name",phone:"Phone",standard:"Class",division:"Division"};
    const rows = [
      {Name:"First child",Class:5,Division:"A"},
      {Name:"Second child",Class:5,Division:"B"},
    ];
    const merged = validateImport(rows,mapping,[],{
      [divisionMappingKey("5th","A")]:"Devi Padmini",
      [divisionMappingKey("5th","B")]:"Devi Padmini",
    });
    expect(merged.valid).toHaveLength(0);
    expect(merged.errors).toHaveLength(2);
    expect(merged.errors[0].message).toContain("Different report codes");
    const wrongNamed = validateImport([
      {Name:"Named child",Class:8,Division:"B-Rani Laxmi"},
    ],mapping,[],{[divisionMappingKey("8th","B-Rani Laxmi")]:"Rani Channamma"});
    expect(wrongNamed.valid).toHaveLength(0);
    expect(wrongNamed.errors[0].message).toContain("Report names Rani Laxmibai");
    const inconsistent = validateImport([
      {Name:"First child",Class:8,Division:"A"},
      {Name:"Second child",Class:8,Division:"A-Rani Channamma"},
    ],mapping,[],{[divisionMappingKey("8th","A")]:"Rani Laxmibai"});
    expect(inconsistent.valid).toHaveLength(0);
    expect(inconsistent.errors.every(e=>e.message.includes("same report code"))).toBe(true);
    expect(validateImport([
      {Name:"First child",Class:8,Division:"A-Rani Channamma"},
      {Name:"Second child",Class:8,Division:"A-Rani Channamma"},
    ],mapping,[]).errors).toHaveLength(0);
    expect(validateImport([
      {Name:"Cleared choice",Class:8,Division:"A-Rani Channamma"},
    ],mapping,[],{[divisionMappingKey("8th","A-Rani Channamma")]:""}).valid).toHaveLength(0);
  });
  it("supports ordinary CSV/XLSX headers, formatted phone text and repeated printed headers", () => {
    const source = report([
      ["Name", "Mobile", "Class", "Division"],
      ["First child", "0123456789", 5, "Devi Padmini"],
      [],
      ["Name", "Mobile", "Class", "Division"],
      ["Second child", "0123456789", 5, "Rana Pratap"],
    ]);
    const parsed = parseStudentSheet(source, "Report");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[1].__sourceRow).toBe(5);
    const result = validateImport(parsed.rows, parsed.mapping, []);
    expect(result.valid).toHaveLength(2);
    expect(result.valid[0].phone).toBe("0123456789");
    expect(result.warnings).toHaveLength(1);
  });
  it("handles worksheet/header selection without silently interpreting title cells as records", () => {
    const source = {
      sheetNames: ["Cover", "Students"],
      grids: {
        Cover: [["Cover"], ["Notes"]],
        Students: [
          ["Metadata"],
          ["Full name", "Phone number", "Grade", "Division"],
          ["Test child", "", "6", "Kabir"],
        ],
      },
    };
    expect(detectHeaderRow(source.grids.Students)).toBe(2);
    const parsed = parseStudentSheet(source, "Students", 2);
    expect(parsed.rows[0].__sourceRow).toBe(3);
    expect(detectMapping(parsed.headers).name).toBe("Full name");
    expect(() => parseStudentSheet(source, "Students", NaN)).toThrow(
      "valid header",
    );
    expect(() => parseStudentSheet(source, "Missing")).toThrow("worksheet");
  });
  it.skipIf(!fs.existsSync(actualReport))("reads the unchanged actual XLS fixture as 521 data rows with headers at row 4", () => {
    const bytes = fs.readFileSync(actualReport);
    const source = readStudentWorkbook(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    );
    const parsed = parseStudentSheet(source, source.sheetNames[0]);
    expect(parsed.headerRow).toBe(4);
    expect(parsed.rows).toHaveLength(521);
    expect(parsed.mapping.phone).toBe("");
    expect(parsed.rows[0].__sourceRow).toBe(5);
    expect(parsed.rows.at(-1)?.__sourceRow).toBe(525);
    // Test-only administrative choices demonstrate complete parsing. These choices
    // are never defaults in the application and do not assert the real A/B mapping.
    const choices = Object.fromEntries(
      reportDivisions(parsed.rows, parsed.mapping).filter(choice=>!choice.matched).map((choice) => [
        choice.key,
        divisions[choice.standard][
          choice.source === "A" ? 1 : 0
        ],
      ]),
    );
    const result = validateImport(parsed.rows, parsed.mapping, [], choices);
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toHaveLength(521);
    expect(result.warnings).toHaveLength(0);
    const groups = reportDivisions(parsed.rows,parsed.mapping);
    expect(groups).toHaveLength(12);
    expect(groups.filter(g=>g.standard==="8th").map(g=>[g.source,g.count,g.matched])).toEqual([
      ["A-Rani Channamma",44,"Rani Channamma"],
      ["B-Rani Laxmi",44,"Rani Laxmibai"],
    ]);
    expect(result.valid.filter(s=>s.standard==="8th"&&s.division==="Rani Channamma")).toHaveLength(44);
    expect(result.valid.filter(s=>s.standard==="8th"&&s.division==="Rani Laxmibai")).toHaveLength(44);
  });
});
describe("missing student phones", () => {
  const mapping = {
    name: "Name",
    phone: "Phone",
    standard: "Class",
    division: "Division",
  };
  const row = { Name: "Test child", Class: 5, Division: "Devi Padmini" };
  it("accepts absent phones but never converts invalid contact data into a missing phone", () => {
    expect(validateImport([row], mapping, []).valid[0].phone).toBe("");
    for (const Phone of ["unknown", "123", "12345678901"])
      expect(
        validateImport([{ ...row, Phone }], mapping, []).errors[0].message,
      ).toContain("10 digits");
    expect(
      validateImport([row, { ...row, Name: "Another child" }], mapping, [])
        .warnings,
    ).toHaveLength(0);
  });
  it("blocks duplicate identities where absent contact information cannot distinguish records", () => {
    expect(validateImport([row, row], mapping, []).errors).toHaveLength(1);
    const existing = {
      id: "one",
      name: "Test child",
      phone: "9876543210",
      standard: "5th",
      division: "Devi Padmini",
    };
    expect(
      validateImport([row], mapping, [existing]).errors[0].message,
    ).toContain("Duplicate");
    expect(
      validateImport([{ ...row, Phone: "9876543210" }], mapping, [
        { ...existing, phone: "" },
      ]).errors[0].message,
    ).toContain("Duplicate");
  });
  it("still requires the customer's real 10-digit phone on confirmed orders", () => {
    const input = {
      studentId: "student",
      customerName: "Customer",
      customerPhone: "",
      items: [
        { productId: "product", name: "Sweet", price: 440, quantity: 0.25 },
      ],
      advance: 0,
      paymentMethod: "Cash",
      utr: "",
      collectionDate: "2026-10-20",
      collectorType: "Student",
      collectorName: "Test child",
    };
    expect(orderSchema.safeParse(input).success).toBe(false);
    expect(
      orderSchema.safeParse({ ...input, customerPhone: "9876543210" }).success,
    ).toBe(true);
  });
});
