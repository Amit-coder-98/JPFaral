import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
  type ButtonHTMLAttributes,
  type Ref,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Inbox,
  LoaderCircle,
} from "lucide-react";
export function Button({
  children,
  variant = "primary",
  className = "",
  loading,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      className={`button ${variant} ${className}`}
    >
      {loading && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: string;
}) {
  if (children === "Ready") children = "Confirmed";
  return (
    <span
      className={`badge ${tone ?? String(children).toLowerCase().replaceAll(" ", "-")}`}
    >
      <span className="badge-dot" />
      {children}
    </span>
  );
}
export function Field({
  label,
  children,
  error,
  hint,
  required,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
  required?: boolean;
}) {
  const id = useId();
  const descriptionId = `${id}-description`;
  type ControlProps = {
    children?: ReactNode;
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
    "aria-required"?: boolean;
  };
  const connect = (child: ReactNode): ReactNode => {
    if (!isValidElement(child)) return child;
    const element = child as ReactElement<ControlProps>;
    if (
      typeof element.type === "string" &&
      ["input", "select", "textarea"].includes(element.type)
    ) {
      return cloneElement(element, {
        id,
        "aria-describedby": error || hint ? descriptionId : undefined,
        "aria-invalid": !!error,
        "aria-required": required,
      });
    }
    return element.props.children
      ? cloneElement(element, {}, Children.map(element.props.children, connect))
      : element;
  };
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {required && (
          <span className="required" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {Children.map(children, connect)}
      {error ? (
        <span className="field-error" id={descriptionId} role="alert">
          {error}
        </span>
      ) : (
        hint && (
          <span className="field-hint" id={descriptionId}>
            {hint}
          </span>
        )
      )}
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  label = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="search-input">
      <Search size={17} />
      <input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          className="icon-button"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={() => onChange("")}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">{actions}</div>
    </header>
  );
}
export function Panel({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
export function Empty({
  title = "No results found",
  description = "Try a different search or clear your filters.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={25} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Skeleton() {
  return (
    <div aria-label="Loading page" className="page-skeleton">
      <div />
      <div />
      <div />
    </div>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prior = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() =>
      ref.current
        ?.querySelector<HTMLElement>(
          'button, input, select, textarea, [tabindex="0"]',
        )
        ?.focus(),
    );
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key !== "Tab") return;
      const elements = [
        ...(ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ) ?? []),
      ].filter((el) => el.getClientRects().length > 0);
      const first = elements[0],
        last = elements[elements.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handle);
      prior?.focus();
    };
  }, [open]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={id}
            className={`modal ${wide ? "wide" : ""}`}
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-heading">
              <div>
                <h2 id={id}>{title}</h2>
                {description && <p>{description}</p>}
              </div>
              <button
                className="icon-button"
                aria-label="Close dialog"
                onClick={onClose}
              >
                <X size={20} />
              </button>
            </header>
            <div className="modal-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  value?: (row: T) => string | number;
  className?: string;
}
export function Pagination({ page, pages, pageSize, total, onChange, elementRef }: {
  page: number; pages: number; pageSize: number; total: number;
  onChange: (page: number) => void; elementRef?: Ref<HTMLDivElement>;
}) {
  return <div ref={elementRef} className="pagination">
    <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
    <div>
      <button aria-label="Previous page" className="icon-button" disabled={page === 1} onClick={() => onChange(page - 1)}><ChevronLeft size={16} /></button>
      <span>Page {page} of {pages}</span>
      <button aria-label="Next page" className="icon-button" disabled={page === pages} onClick={() => onChange(page + 1)}><ChevronRight size={16} /></button>
    </div>
  </div>;
}
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  pageSize = 8,
  empty,
  initialSort,
  pagination = true,
  fitViewport = false,
  selection,
}: {
  rows: T[];
  columns: Column<T>[];
  pageSize?: number;
  empty?: ReactNode;
  initialSort?: string;
  pagination?: boolean;
  fitViewport?: boolean;
  selection?: {
    selected: Set<string>;
    onChange: (selected: Set<string>) => void;
    canSelect: (row: T) => boolean;
    label: (row: T) => string;
  };
}) {
  const [page, setPage] = useState(1);
  const [capacity, setCapacity] = useState(pageSize);
  const tableRef = useRef<HTMLDivElement>(null);
  const paginationRef = useRef<HTMLDivElement>(null);
  const effectivePageSize = fitViewport ? Math.min(pageSize, capacity) : pageSize;
  useLayoutEffect(() => {
    const region = tableRef.current;
    if (!fitViewport || !pagination || !region || region.closest(".modal")) return;
    let frame = 0;
    let active = true;
    let measuredRowHeight = 0;
    const measure = () => {
      const tableRows = [...region.querySelectorAll("tbody tr")];
      if (!tableRows.length) return;
      // Use the document position so scrolling never changes the page size.
      const top = region.getBoundingClientRect().top + window.scrollY;
      const headerHeight = region.querySelector("thead")!.getBoundingClientRect().height;
      // Keep a stable row estimate as pages change, avoiding resize feedback.
      measuredRowHeight = Math.max(measuredRowHeight, ...tableRows.map((row) => row.getBoundingClientRect().height));
      const rowHeight = measuredRowHeight;
      // Prioritize records and the pager; the page footer follows naturally.
      const available = window.innerHeight - top - headerHeight
        - (paginationRef.current?.offsetHeight ?? 60) - 12;
      setCapacity(Math.max(1, Math.min(pageSize, Math.floor(available / rowHeight))));
    };
    const schedule = () => {
      if (!active) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(region);
    if (region.parentElement) observer.observe(region.parentElement);
    const main = region.closest("main");
    if (main) observer.observe(main);
    const resize = () => { measuredRowHeight = 0; schedule(); };
    window.addEventListener("resize", resize);
    document.fonts.ready.then(schedule);
    schedule();
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [fitViewport, pagination, pageSize, rows.length]);
  const [sort, setSort] = useState({ key: initialSort ?? "", asc: false });
  const column = columns.find((c) => c.key === sort.key);
  const sorted = column?.value
    ? [...rows].sort((a, b) => {
        const av = column.value!(a),
          bv = column.value!(b);
        return (
          (typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv), "en", { numeric: true })) *
          (sort.asc ? 1 : -1)
        );
      })
    : rows;
  const pages = Math.max(1, Math.ceil(rows.length / effectivePageSize));
  const current = Math.min(page, pages);
  useEffect(() => setPage(1), [rows]);
  const visible = pagination
    ? sorted.slice((current - 1) * effectivePageSize, current * effectivePageSize)
    : sorted;
  const selectable = selection ? visible.filter(selection.canSelect) : [];
  const selectedVisible = selectable.filter((row) => selection?.selected.has(row.id)).length;
  return (
    <>
      <div ref={tableRef} className={`table-scroll${fitViewport ? " viewport-table" : ""}`} role="region" aria-label="Data table" tabIndex={0}>
        <table className="data-table">
          <thead>
            <tr>
              {selection && <th className="table-selection-cell">
                <label className="table-checkbox">
                  <input type="checkbox" aria-label="Select all eligible orders on this page"
                    disabled={!selectable.length} checked={selectable.length > 0 && selectedVisible === selectable.length}
                    ref={(input) => { if (input) input.indeterminate = selectedVisible > 0 && selectedVisible < selectable.length; }}
                    onChange={(event) => {
                      const next = new Set(selection.selected);
                      for (const row of selectable) event.target.checked ? next.add(row.id) : next.delete(row.id);
                      selection.onChange(next);
                    }} />
                </label>
              </th>}
              {columns.map((c) => (
                <th key={c.key} className={c.className}>
                  {c.value ? (
                    <button
                      className="sort-button"
                      onClick={() =>
                        setSort({
                          key: c.key,
                          asc: sort.key === c.key ? !sort.asc : true,
                        })
                      }
                    >
                      {c.label}
                      {sort.key === c.key ? (
                        sort.asc ? (
                          <ArrowUp size={13} />
                        ) : (
                          <ArrowDown size={13} />
                        )
                      ) : (
                        <span className="sort-placeholder">↕</span>
                      )}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                {selection && <td className="table-selection-cell">
                  <label className="table-checkbox">
                    <input type="checkbox" aria-label={selection.label(row)} disabled={!selection.canSelect(row)}
                      checked={selection.selected.has(row.id)} onChange={(event) => {
                        const next = new Set(selection.selected);
                        event.target.checked ? next.add(row.id) : next.delete(row.id);
                        selection.onChange(next);
                      }} />
                  </label>
                </td>}
                {columns.map((c) => (
                  <td key={c.key} className={c.className}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (empty ?? <Empty />)}
      </div>
      {pagination && rows.length > 0 && (
        <Pagination elementRef={paginationRef} page={current} pages={pages} pageSize={effectivePageSize} total={rows.length} onChange={setPage} />
      )}
    </>
  );
}
