import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Plus, Pencil, Cookie, Wheat, Package } from "lucide-react";
import { useApp } from "../app/Provider";
import {
  Badge,
  Button,
  Empty,
  Field,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
} from "../components/ui";
import { rateMoney, ratePer250g, pricePerKgFrom250g } from "../utils/pricing";
import type { Product } from "../types";
import { sortCatalogue } from "../utils/catalogue";
export default function Products() {
  const { data, user, repository, toast } = useApp();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(3);
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => setPage(1), [search, filter]);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
      setPageSize(Math.max(1, columns));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    measure();
    return () => observer.disconnect();
  }, []);
  const [editing, setEditing] = useState<Product | null>(null);
  const [toggle, setToggle] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rate, setRate] = useState("");
  const rows = sortCatalogue(data.products).filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) &&
      (!filter ||
        (filter === "available"
          ? p.available
          : filter === "unavailable"
            ? !p.available
            : p.category === filter)),
  );
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await repository.saveProduct(
        { ...editing!, price: pricePerKgFrom250g(Number(rate)) },
        user!.id,
      );
      setEditing(null);
      toast(
        "Product and current price updated. Existing bills keep their recorded prices.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="THE FESTIVE PANTRY"
        title="Products & pricing"
        description="Traditional favourites. Thoughtful prices. A little something for everyone."
        actions={
          <Button
            onClick={() => {
              setError("");
              setRate("");
              setEditing({
                id: crypto.randomUUID(),
                name: "",
                price: 0,
                category: "Sweet",
                available: true,
                description: "",
              });
            }}
          >
            <Plus size={17} />
            Add product
          </Button>
        }
      />
      <div className="info-box product-info">
        <Package size={18} />
        <span>
          प्रति पाव किलो दर · 250 ग्रॅम. प्रमाण kg मध्ये भरा; प्रत्येक 0.25 kg
          साठी एक पाव किलो दर लागू होतो. Saved orders keep their original
          prices.
        </span>
      </div>
      <div className="products-toolbar">
        <SearchInput
          label="Search products"
          value={search}
          onChange={setSearch}
          placeholder="Search your faral favourites…"
        />
        <select
          aria-label="Filter products"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All products</option>
          <option>Sweet</option>
          <option>Savoury</option>
          <option value="available">Available</option>
          <option value="unavailable">Unavailable</option>
        </select>
        <span className="muted">{rows.length} products</span>
      </div>
      <div className="products-grid" ref={gridRef}>
        {rows.slice((current - 1) * pageSize, current * pageSize).map((p, i) => (
          <article
            key={p.id}
            className={`product-card ${!p.available ? "unavailable" : ""}`}
          >
            <div className={`product-art product-art-${((current - 1) * pageSize + i) % 4}`}>
              <div className="product-art-circle">
                {p.category === "Sweet" ? (
                  <Cookie size={54} strokeWidth={1.1} />
                ) : (
                  <Wheat size={54} strokeWidth={1.1} />
                )}
              </div>
              <span>
                {p.category === "Sweet"
                  ? "SWEET TRADITIONS"
                  : "SAVOURY FAVOURITES"}
              </span>
              <Badge tone={p.available ? "active" : "inactive"}>
                {p.available ? "Available" : "Unavailable"}
              </Badge>
            </div>
            <div className="product-card-body">
              <span className="eyebrow">{p.category}</span>
              <h2>{p.name}</h2>
              <p>
                {p.description ||
                  "A handcrafted favourite for your festive season."}
              </p>
              <div className="product-price">
                <strong>
                  {rateMoney(p.price)}
                  <small> / 250 ग्रॅम</small>
                </strong>
                <span>दर पाव किलो (250 ग्रॅम)</span>
              </div>
              <div className="product-card-actions">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditing({ ...p });
                    setRate(String(ratePer250g(p.price)));
                    setError("");
                  }}
                >
                  <Pencil size={14} />
                  Edit product
                </Button>
                <button
                  className={`toggle-switch ${p.available ? "on" : ""}`}
                  role="switch"
                  aria-checked={p.available}
                  aria-label={`Availability of ${p.name}`}
                  onClick={() => setToggle(p)}
                >
                  <span />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {rows.length > 0 && <Pagination page={current} pages={pages} pageSize={pageSize} total={rows.length} onChange={(next) => {
        setPage(next);
        gridRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      }} />}
      {!rows.length && <Empty />}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={
          editing && data.products.some((p) => p.id === editing.id)
            ? "Edit product"
            : "Add a festive favourite"
        }
        description="Current price updates apply to new order items."
      >
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Field label="Product name" required>
              <input
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
                required
                minLength={2}
              />
            </Field>
            <div className="form-grid">
              <Field label="दर पाव किलो (250 ग्रॅम)" required>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max="250000"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  required
                />
              </Field>
              <Field label="Category">
                <select
                  value={editing.category}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      category: e.target.value as Product["category"],
                    })
                  }
                >
                  <option>Sweet</option>
                  <option>Savoury</option>
                </select>
              </Field>
            </div>
            <Field label="Description">
              <textarea
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </Field>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={editing.available}
                onChange={(e) =>
                  setEditing({ ...editing, available: e.target.checked })
                }
              />
              Available for new orders
            </label>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Save product
              </Button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={!!toggle}
        onClose={() => setToggle(null)}
        title={
          toggle?.available
            ? "Make this product unavailable?"
            : "Make this product available?"
        }
        description={`${toggle?.name} will ${toggle?.available ? "be hidden from" : "appear in"} new order selections. Existing orders keep their items.`}
      >
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setToggle(null)}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await repository.saveProduct(
                  { ...toggle!, available: !toggle!.available },
                  user!.id,
                );
                setToggle(null);
                toast("Product availability updated.");
              } catch (e) {
                toast((e as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirm update
          </Button>
        </div>
      </Modal>
    </>
  );
}
