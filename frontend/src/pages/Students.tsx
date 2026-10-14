import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Upload,
  ArrowUpRight,
  Download,
  Users,
  FileSpreadsheet,
} from "lucide-react";
import { useApp } from "../app/Provider";
import {
  Button,
  DataTable,
  Field,
  Modal,
  PageHeader,
  Panel,
  SearchInput,
} from "../components/ui";
import { OrderTable } from "../components/orders/OrderTable";
import { divisions } from "../data/reference";
import {
  validateImport,
  reportDivisions,
  type Mapping,
  type DivisionMapping,
  type StudentImportRow,
} from "../services/studentImport";
import type {
  StudentWorkbook,
  ParsedStudentSheet,
} from "../services/studentWorkbook";
import { orderTotal } from "../utils/calculations";
import { date, money, initials, latestDate } from "../utils/format";
import { downloadCSV } from "../utils/export";
import type { Student } from "../types";
export default function Students() {
  const { data, user, repository, toast, isMock } = useApp();
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [reviewed, setReviewed] = useState(false);
  const [search, setSearch] = useState("");
  const [standard, setStandard] = useState("");
  const [division, setDivision] = useState("");
  const [selected, setSelected] = useState<Student | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [raw, setRaw] = useState<StudentImportRow[]>([]);
  const sourceRef = useRef<StudentWorkbook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [divisionOverrides, setDivisionOverrides] = useState<DivisionMapping>(
    {},
  );
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({
    name: "",
    phone: "",
    standard: "",
    division: "",
  });
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const rows = useMemo(
    () =>
      data.students.filter(
        (s) =>
          `${s.name} ${s.phone}`.toLowerCase().includes(search.toLowerCase()) &&
          (!standard || s.standard === standard) &&
          (!division || s.division === division),
      ),
    [data.students, search, standard, division],
  );
  const history = (s: Student) =>
    data.orders.filter((o) => o.studentId === s.id && o.status !== "Draft");
  const result = useMemo(
    () => validateImport(raw, mapping, data.students, divisionOverrides),
    [raw, mapping, data.students, divisionOverrides],
  );
  const divisionChoices = useMemo(
    () => reportDivisions(raw, mapping),
    [raw, mapping],
  );
  const missingPhones = raw.filter(
    (row) => !String(row[mapping.phone] ?? "").trim(),
  ).length;
  const applyParsed = (parsed: ParsedStudentSheet) => {
    setRaw(parsed.rows);
    setHeaders(parsed.headers);
    setMapping(parsed.mapping);
    setSheetName(parsed.sheetName);
    setHeaderRow(parsed.headerRow);
    setDivisionOverrides({});
    setReviewed(false);
    setFileError("");
  };
  const reparse = async (sheet: string, row?: number) => {
    if (!sourceRef.current) return;
    setBusy(true);
    setRaw([]);
    try {
      const { parseStudentSheet } = await import("../services/studentWorkbook");
      applyParsed(parseStudentSheet(sourceRef.current, sheet, row));
    } catch (e) {
      setFileError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const readFile = async (file?: File) => {
    if (!file) return;
    setFileError("");
    setRaw([]);
    sourceRef.current = null;
    setSheetNames([]);
    setDivisionOverrides({});
    setBusy(true);
    setFilename(file.name);
    setBatchId(crypto.randomUUID());
    setReviewed(false);
    try {
      if (!/\.(csv|xlsx|xls)$/i.test(file.name))
        throw new Error("Choose an .xlsx, .xls or .csv file.");
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Please use a file smaller than 10 MB.");
      const { readStudentWorkbook, parseStudentSheet } = await import(
        "../services/studentWorkbook"
      );
      const source = readStudentWorkbook(await file.arrayBuffer());
      sourceRef.current = source;
      setSheetNames(source.sheetNames);
      if (!source.sheetNames.length)
        throw new Error("This file has no worksheet.");
      applyParsed(parseStudentSheet(source, source.sheetNames[0]));
    } catch (e) {
      setFileError(
        e instanceof Error ? e.message : "Could not read this file.",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="YOUR SCHOOL COMMUNITY"
        title="Students"
        description="Find a familiar face. See the celebrations they’ve brought in."
        actions={
          user?.role === "Super Admin" ? (
            <Button onClick={() => setImportOpen(true)}>
              <Upload size={16} />
              Import students
            </Button>
          ) : undefined
        }
      />
      <div className="directory-summary">
        <div className="stat-icon maroon">
          <Users size={20} />
        </div>
        <strong>{data.students.length}</strong>
        <span>
          students · {new Set(data.students.map((s) => s.standard)).size} standards ·{" "}
          {new Set(data.students.map((s) => `${s.standard}|${s.division}`)).size} divisions
        </span>
        <span className="directory-note">
          {isMock ? "Fictional demo records" : "Reviewed student directory"}
        </span>
      </div>
      <Panel>
        <div className="table-toolbar">
          <SearchInput
            label="Search students"
            placeholder="Search student name or phone…"
            value={search}
            onChange={setSearch}
          />
          <div className="filter-actions">
            <select
              aria-label="Filter student standard"
              value={standard}
              onChange={(e) => {
                setStandard(e.target.value);
                setDivision("");
              }}
            >
              <option value="">All standards</option>
              {Object.keys(divisions).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="Filter student division"
              value={division}
              onChange={(e) => setDivision(e.target.value)}
            >
              <option value="">All divisions</option>
              {(standard
                ? divisions[standard]
                : Object.values(divisions).flat()
              ).map((d) => (
                <option key={d} value={d}>
                  {d} ({data.students.filter((s) => s.division === d && (!standard || s.standard === standard)).length})
                </option>
              ))}
            </select>
            {(search || standard || division) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setStandard("");
                  setDivision("");
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        <DataTable
          fitViewport
          rows={rows}
          columns={[
            {
              key: "name",
              label: "Student",
              value: (s) => s.name,
              render: (s) => (
                <button
                  className="student-name-button"
                  onClick={() => setSelected(s)}
                >
                  <span className="avatar color-1">{initials(s.name)}</span>
                  <strong>{s.name}</strong>
                </button>
              ),
            },
            {
              key: "phone",
              label: "Phone number",
              render: (s) => s.phone || "Not provided",
            },
            {
              key: "standard",
              label: "Standard & division",
              value: (s) => s.standard,
              render: (s) => (
                <div className="cell-stack">
                  <strong>{s.standard}</strong>
                  <span>{s.division}</span>
                </div>
              ),
            },
            {
              key: "orders",
              label: "Orders",
              value: (s) => history(s).length,
              render: (s) => history(s).length,
            },
            {
              key: "value",
              label: "Purchase value",
              value: (s) => history(s).reduce((n, o) => n + orderTotal(o), 0),
              render: (s) => (
                <strong>
                  {money(history(s).reduce((n, o) => n + orderTotal(o), 0))}
                </strong>
              ),
            },
            {
              key: "last",
              label: "Last order",
              value: (s) =>
                new Date(
                  latestDate(history(s).map((o) => o.createdAt)) || 0,
                ).getTime(),
              render: (s) =>
                date(latestDate(history(s).map((o) => o.createdAt))),
            },
            {
              key: "action",
              label: "",
              render: (s) => (
                <button
                  className="icon-button"
                  aria-label={`View ${s.name}`}
                  onClick={() => setSelected(s)}
                >
                  <ArrowUpRight size={17} />
                </button>
              ),
            },
          ]}
        />
      </Panel>
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        wide
        title={selected?.name ?? "Student"}
        description={`${selected?.standard} · ${selected?.division} · ${selected?.phone || "Phone not provided"}`}
      >
        <div className="student-detail-stats">
          <div>
            <span>Orders</span>
            <strong>{selected ? history(selected).length : 0}</strong>
          </div>
          <div>
            <span>Total purchase value</span>
            <strong>
              {selected
                ? money(
                    history(selected).reduce((s, o) => s + orderTotal(o), 0),
                  )
                : "—"}
            </strong>
          </div>
        </div>
        <OrderTable
          orders={
            selected
              ? data.orders.filter((o) => o.studentId === selected.id)
              : []
          }
          compact
        />
        <div className="modal-actions">
          <Link
            className="button primary"
            to={`/orders/new?student=${selected?.id}`}
          >
            Create an order for this student
          </Link>
        </div>
      </Modal>
      <Modal
        open={importOpen}
        onClose={() => {
          if (!busy) setImportOpen(false);
        }}
        wide
        title="Import your student directory"
        description="Preview and validate an Excel or CSV file before saving the reviewed records."
      >
        <div className="import-top">
          <div className="info-box">
            Files are parsed in your browser. Reviewed rows are saved after
            confirmation. Required: student name, standard and division. Student
            phone is optional; when provided, use 10 digits and format cells as
            text. A real customer phone is required on each confirmed order.
          </div>
          <Button
            variant="secondary"
            onClick={() =>
              downloadCSV(
                "JPfaral-student-template.csv",
                ["Student name", "Phone", "Standard", "Division"],
                isMock
                  ? [["Demo Student", "0000099999", "5th", "Devi Padmini"]]
                  : [],
              )
            }
          >
            <Download size={15} />
            Download template
          </Button>
        </div>
        <div className="upload-zone">
          <FileSpreadsheet size={30} />
          <strong>{filename || "Choose your student list"}</strong>
          <span>.xlsx, .xls or .csv · up to 10 MB</span>
          <input
            ref={inputRef}
            type="file"
            aria-label="Student import file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => void readFile(e.target.files?.[0])}
          />
          <Button
            variant="secondary"
            loading={busy}
            onClick={() => inputRef.current?.click()}
          >
            Choose file
          </Button>
        </div>
        {fileError && (
          <p className="field-error" role="alert">
            {fileError}
          </p>
        )}
        {sheetNames.length > 0 && (
          <div className="form-grid">
            <Field label="Worksheet">
              <select
                value={sheetName}
                disabled={busy}
                onChange={(e) => {
                  setSheetName(e.target.value);
                  void reparse(e.target.value);
                }}
              >
                {sheetNames.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Header row"
              hint="Choose the row containing the actual column names, below report titles."
            >
              <input
                type="number"
                min="1"
                max={sourceRef.current?.grids[sheetName]?.length}
                value={headerRow || ""}
                disabled={busy}
                onChange={(e) => {
                  setHeaderRow(e.target.valueAsNumber || 0);
                  void reparse(sheetName, e.target.valueAsNumber);
                }}
              />
            </Field>
          </div>
        )}
        {raw.length > 0 && (
          <>
            <p className="muted">
              {raw.length} student rows · headers at row {headerRow} · worksheet{" "}
              {sheetName}
            </p>
            <h3 className="spaced">Map your columns</h3>
            <div className="form-grid four">
              {(Object.keys(mapping) as (keyof Mapping)[]).map((key) => (
                <Field
                  key={key}
                  label={
                    key === "name"
                      ? "Student name"
                      : key.charAt(0).toUpperCase() + key.slice(1)
                  }
                  required={key !== "phone"}
                >
                  <select
                    value={mapping[key]}
                    onChange={(e) => {
                      setMapping((m) => ({ ...m, [key]: e.target.value }));
                      setDivisionOverrides({});
                      setReviewed(false);
                    }}
                  >
                    <option value="">
                      {key === "phone"
                        ? "No phone column (leave blank)"
                        : "Choose column"}
                    </option>
                    {headers.map((h) => (
                      <option key={h}>{h}</option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            {missingPhones > 0 && (
              <div className="info-box">
                {missingPhones} students have no phone in this file. Their phone
                will be left blank. Enter a real customer phone when creating an
                order.
              </div>
            )}
            {divisionChoices.length > 0 && (
              <>
                <h3 className="spaced">Match report divisions</h3>
                <p className="muted">
                  Review every report group and its student count. Explicit
                  names are matched; bare A/B codes need your choice. A and B
                  must use different named divisions within each standard.
                </p>
                <div className="form-grid">
                  {divisionChoices.map((choice) => (
                    <Field
                      key={choice.key}
                      label={`Map ${choice.standard} / ${choice.source}`}
                      hint={`${choice.count} students${choice.matched ? " · named in the report" : " · choose the confirmed mapping"}`}
                      required
                    >
                      <select
                        value={divisionOverrides[choice.key] ?? choice.matched ?? ""}
                        onChange={(e) => {
                          setDivisionOverrides((current) => ({
                            ...current,
                            [choice.key]: e.target.value,
                          }));
                          setReviewed(false);
                        }}
                      >
                        <option value="">Choose named division</option>
                        {divisions[choice.standard].map((name) => (
                          <option key={name}>{name}</option>
                        ))}
                      </select>
                    </Field>
                  ))}
                </div>
              </>
            )}
            <div className="import-status">
              <strong>{result.valid.length} valid students</strong>
              <span
                className={result.errors.length ? "text-red" : "text-green"}
              >
                {result.errors.length} rows need attention
              </span>
            </div>
            {result.errors.length > 0 && (
              <div className="import-errors" role="alert">
                {result.errors.slice(0, 12).map((e) => (
                  <p key={e.row}>
                    Row {e.row}: {e.message}
                  </p>
                ))}
                {result.errors.length > 12 && (
                  <p>
                    …and {result.errors.length - 12} more. Correct the source
                    file and try again.
                  </p>
                )}
              </div>
            )}
            {result.warnings.length > 0 && (
              <div className="info-box">
                <p>
                  {result.warnings.length} shared phone numbers need review.
                  Family members may share a phone.
                </p>
                {result.warnings.slice(0, 8).map((w) => (
                  <p key={w.row}>
                    Row {w.row}: {w.message}
                  </p>
                ))}
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  I reviewed these shared phone numbers and student identities.
                </label>
              </div>
            )}
            <DataTable
              rows={result.valid.slice(0, 8)}
              pagination={false}
              columns={[
                { key: "name", label: "Name", render: (s) => s.name },
                {
                  key: "phone",
                  label: "Phone",
                  render: (s) => s.phone || "Not provided",
                },
                {
                  key: "standard",
                  label: "Standard",
                  render: (s) => s.standard,
                },
                {
                  key: "division",
                  label: "Division",
                  render: (s) => s.division,
                },
              ]}
            />
            <p className="muted">
              Preview shows the first 8 valid rows. All {raw.length} rows have
              been validated.
            </p>
          </>
        )}
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setImportOpen(false)}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={
              busy ||
              !result.valid.length ||
              result.errors.length > 0 ||
              (result.warnings.length > 0 && !reviewed)
            }
            onClick={async () => {
              setBusy(true);
              setFileError("");
              try {
                await repository.importStudents(
                  result.valid,
                  user!.id,
                  batchId,
                );
                toast(
                  `${result.valid.length} students imported${isMock ? " locally" : ""}.`,
                );
                setImportOpen(false);
                setRaw([]);
                setFilename("");
              } catch (e) {
                setFileError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Import {result.valid.length || ""} students
          </Button>
        </div>
      </Modal>
    </>
  );
}
