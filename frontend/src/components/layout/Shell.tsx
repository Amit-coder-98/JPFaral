import { useEffect, useRef, useState } from "react";
import {
  NavLink,
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  LayoutDashboard,
  Plus,
  ShoppingBag,
  Users,
  Package,
  UserRoundCog,
  Wallet,
  ChartNoAxesCombined,
  History,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Search,
  CircleHelp,
  Bell,
} from "lucide-react";
import { motion } from "framer-motion";
import { useApp } from "../../app/Provider";
import { Brand } from "../Brand";
import { Button, Modal, Badge } from "../ui";
import { date, today, initials } from "../../utils/format";
const common = [
  { to: "/dashboard", title: "Dashboard", icon: LayoutDashboard },
  { to: "/orders/new", title: "Create Order", icon: Plus },
  { to: "/orders", title: "All Orders", icon: ShoppingBag },
  { to: "/students", title: "Students", icon: Users },
];
const admin = [
  { to: "/products", title: "Products & Pricing", icon: Package },
  { to: "/staff", title: "Staff Management", icon: UserRoundCog },
  { to: "/payments", title: "Payments", icon: Wallet },
  { to: "/reports", title: "Reports & Analytics", icon: ChartNoAxesCombined },
  { to: "/activity", title: "Activity & Audit Logs", icon: History },
  { to: "/settings", title: "Settings", icon: Settings },
];
export function Shell() {
  const { user, data, signOut, switchRole, isMock, sessionError, refresh } =
    useApp();
  const [refreshing, setRefreshing] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [drawerLayout, setDrawerLayout] = useState(() =>
    window.matchMedia("(max-width: 1024px)").matches,
  );
  const drawerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [help, setHelp] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1024px)");
    const update = () => {
      setDrawerLayout(media.matches);
      if (!media.matches) setDrawer(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    setDrawer(false);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);
  useEffect(() => {
    if (!drawer || !drawerLayout) return;
    const prior = menuRef.current ?? document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() =>
      drawerRef.current?.querySelector<HTMLButtonElement>(".drawer-close")?.focus({ preventScroll: true }),
    );
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer(false);
      if (event.key !== "Tab") return;
      const controls = [...(drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), [tabindex="0"]',
      ) ?? [])].filter((element) => element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handle);
      if (prior.isConnected && prior.getClientRects().length) prior.focus();
    };
  }, [drawer, drawerLayout]);
  const navigation = [
    ...common,
    ...(user?.role === "Super Admin"
      ? admin
      : [
          { to: "/my-activity", title: "My Activity", icon: History },
          { to: "/profile", title: "Profile", icon: Settings },
        ]),
  ];
  const page = location.pathname.includes("/edit")
    ? "Edit Order"
    : location.pathname.startsWith("/orders/") &&
        location.pathname !== "/orders/new"
      ? "Order Details"
      : (navigation.find((n) => n.to === location.pathname)?.title ??
        "Workspace");
  const awaiting = data.orders.filter((o) => o.status === "Confirmed" || o.status === "Ready");
  return (
    <div
      className={`app-shell ${collapsed ? "is-collapsed" : ""} ${data.settings.compact ? "compact" : ""}`}
    >
      {drawer && (
        <button
          className="drawer-shade"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside
        ref={drawerRef}
        id="workspace-navigation"
        className={`sidebar ${drawer ? "drawer-open" : ""}`}
        role={drawerLayout && drawer ? "dialog" : undefined}
        aria-label="Workspace navigation"
        aria-modal={drawerLayout && drawer ? true : undefined}
        aria-hidden={drawerLayout && !drawer ? true : undefined}
        inert={drawerLayout && !drawer}
      >
        <Link
          to="/dashboard"
          className="brand-link"
          onClick={() => setDrawer(false)}
        >
          <Brand light small={collapsed && !drawerLayout} />
        </Link>
        <button
          className="drawer-close icon-button"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        >
          <X size={20} />
        </button>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ to, title, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/orders"}
              onClick={() => setDrawer(false)}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
              title={collapsed ? title : undefined}
            >
              <Icon size={19} />
              <span>{title}</span>
              {to === "/orders" && (
                <span className="nav-count">{data.orders.length}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => {
            setDrawer(false);
            setHelp(true);
          }}>
            <CircleHelp size={18} />
            <span>Help & getting started</span>
          </button>
          <button
            className="collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight size={18} />
            ) : (
              <>
                <ChevronLeft size={18} />
                <span>Collapse sidebar</span>
              </>
            )}
          </button>
        </div>
      </aside>
      <div className="app-body" inert={drawerLayout && drawer}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              ref={menuRef}
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              aria-expanded={drawer}
              aria-controls="workspace-navigation"
              onClick={() => setDrawer(true)}
            >
              <Menu size={21} />
            </button>
            <div className="breadcrumb">
              <Link to="/dashboard">Workspace</Link>
              <ChevronRight size={13} />
              <span>{page}</span>
            </div>
          </div>
          <div className="topbar-right">
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                navigate(`/orders?search=${encodeURIComponent(query)}`);
                setQuery("");
              }}
            >
              <Search size={16} />
              <input
                aria-label="Search all orders"
                placeholder="Search orders…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>↵</kbd>
            </form>
            <span className="demo-pill">
              {isMock ? "Demo workspace" : user?.role}
            </span>
            <button
              className="icon-button notification-button"
              aria-label="Collection notifications"
              onClick={() => setNotifications(true)}
            >
              <Bell size={19} />
              {awaiting.length > 0 && <i />}
            </button>
            <div className="topbar-divider" />
            <Link
              to={user?.role === "Super Admin" ? "/settings" : "/profile"}
              className="user-avatar"
              aria-label="Open your profile"
            >
              {initials(user?.name ?? "Demo User")}
            </Link>
          </div>
        </header>
        <div className="workspace-toolbar">
          <span>
            <span className="live-dot" />
            Diwali 2026 <span className="toolbar-divider">/</span>
            <span className="muted">
              {date(today(), true)} {isMock ? "· demo season" : ""}
            </span>
          </span>
          {isMock ? (
            <label className="role-switch">
              <span>Preview as</span>
              <select
                aria-label="Demo role"
                value={user?.role}
                onChange={(e) => {
                  switchRole(
                    e.target.value as "Super Admin" | "Data Entry Staff",
                  );
                  navigate("/dashboard");
                }}
              >
                <option>Super Admin</option>
                <option>Data Entry Staff</option>
              </select>
            </label>
          ) : (
            <Button
              variant="ghost"
              loading={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try {
                  await refresh();
                } catch {
                  /* Provider shows the error */
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              Refresh records
            </Button>
          )}
        </div>
        <main id="main-content">
          {!isMock && sessionError && (
            <div className="info-box" role="alert">
              {sessionError}
            </div>
          )}
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.13 }}
          >
            <Outlet />
          </motion.div>
        </main>
        <footer className="app-footer">
          <span>{user?.name}</span>
          <div>
            {isMock ? "Demo workspace · Changes reset on refresh" : ""}{" "}
            <button
              onClick={async () => {
                await signOut();
                navigate("/login");
              }}
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </footer>
      </div>
      <Modal
        open={help}
        onClose={() => setHelp(false)}
        title="Welcome to JPfaral"
        description="Your Diwali order desk, all in one place."
      >
        <div className="help-steps">
          <p>
            <strong>1. Find your student.</strong> Choose their standard and
            division, then search by name.
          </p>
          <p>
            <strong>2. Build the order.</strong> Select faral, quantity, advance
            payment, and collection details.
          </p>
          <p>
            <strong>3. Keep everyone in sync.</strong> Review orders, balances,
            collections, and student history.
          </p>
        </div>
        <div className="info-box">
          {isMock
            ? "This is a frontend demonstration with fictional records. Changes reset on refresh."
            : "Orders and payments are shared with your team. Record additional receipts on the order's details page. Your administrator manages student imports, catalog pricing, and staff invitations."}
        </div>
        <Button
          onClick={() => {
            setHelp(false);
            navigate("/orders/new");
          }}
        >
          Create your first order <ChevronRight size={16} />
        </Button>
      </Modal>
      <Modal
        open={notifications}
        onClose={() => setNotifications(false)}
        title="Collection desk"
        description={`${awaiting.length} orders await collection.`}
      >
        {!awaiting.length && <p>No orders await collection.</p>}
        {awaiting.slice(0, 5).map((o) => (
          <Link
            key={o.id}
            to={`/orders/${o.id}`}
            className="notification-row"
            onClick={() => setNotifications(false)}
          >
            <div>
              <strong>{o.number}</strong>
              <span>
                {o.customerName} · {date(o.collectionDate)}
              </span>
            </div>
            <Badge>Confirmed</Badge>
          </Link>
        ))}
        <Button
          variant="secondary"
          onClick={() => {
            setNotifications(false);
            navigate("/orders?status=Confirmed");
          }}
        >
          View pending collections
        </Button>
      </Modal>
    </div>
  );
}
