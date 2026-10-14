import {
  Component,
  lazy,
  Suspense,
  useEffect,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useApp } from "./Provider";
import { Shell } from "../components/layout/Shell";
import { Button, Empty, Skeleton } from "../components/ui";
const Dashboard = lazy(() => import("../pages/Dashboard"));
const Login = lazy(() => import("../pages/Login"));
const CreateOrder = lazy(() => import("../pages/CreateOrder"));
const Orders = lazy(() => import("../pages/Orders"));
const OrderDetails = lazy(() => import("../pages/OrderDetails"));
const Students = lazy(() => import("../pages/Students"));
const Products = lazy(() => import("../pages/Products"));
const Staff = lazy(() => import("../pages/Staff"));
const Payments = lazy(() => import("../pages/Payments"));
const Reports = lazy(() => import("../pages/Reports"));
const Activity = lazy(() => import("../pages/Activity"));
const Settings = lazy(() => import("../pages/Settings"));
const AuthSetup = lazy(() => import("../pages/AuthSetup"));
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("JPfaral page error", error, info);
  }
  render() {
    return this.state.error ? (
      <Empty
        title="Something went wrong"
        description="Reload the workspace to recover from this error."
        action={
          <Button onClick={() => window.location.reload()}>
            Reload workspace
          </Button>
        }
      />
    ) : (
      this.props.children
    );
  }
}
function RoleGuard({
  children,
  admin = false,
}: {
  children: ReactNode;
  admin?: boolean;
}) {
  const { user, sessionLoading } = useApp();
  if (sessionLoading) return <Skeleton />;
  return !user?.active ? (
    <Navigate to="/login" replace />
  ) : admin && user.role !== "Super Admin" ? (
    <Navigate to="/dashboard" replace />
  ) : (
    children
  );
}
export default function App() {
  const { data, configurationError, sessionLoading, requiresPassword } =
    useApp();
  const location = useLocation();
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--accent",
      data.settings.accent,
    );
  }, [data.settings.accent]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    document.title = `JPfaral · ${location.pathname === "/login" ? "Welcome" : "Diwali Order Management"}`;
  }, [location.pathname]);
  if (configurationError)
    return (
      <div className="startup-state" role="alert">
        <Empty
          title="Supabase configuration required"
          description={configurationError}
        />
        <p>
          Follow backend/README.md to create the project and apply the
          migrations. Development preview is available only through explicit
          mock mode.
        </p>
      </div>
    );
  if (sessionLoading)
    return (
      <div className="startup-state">
        <p role="status">Loading your workspace…</p>
        <Skeleton />
      </div>
    );
  if (requiresPassword && location.pathname !== "/auth/setup")
    return <Navigate to="/auth/setup" replace />;
  return (
    <ErrorBoundary>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Suspense fallback={<Skeleton />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/setup" element={<AuthSetup />} />
          <Route
            element={
              <RoleGuard>
                <Shell />
              </RoleGuard>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route
              path="/orders/new"
              element={<CreateOrder key={`create-${location.search}`} />}
            />
            <Route path="/orders" element={<Orders key={location.search} />} />
            <Route path="/orders/:id" element={<OrderDetails />} />
            <Route
              path="/orders/:id/edit"
              element={<CreateOrder key={location.pathname} />}
            />
            <Route path="/students" element={<Students />} />
            <Route
              path="/products"
              element={
                <RoleGuard admin>
                  <Products />
                </RoleGuard>
              }
            />
            <Route
              path="/staff"
              element={
                <RoleGuard admin>
                  <Staff />
                </RoleGuard>
              }
            />
            <Route
              path="/payments"
              element={
                <RoleGuard admin>
                  <Payments />
                </RoleGuard>
              }
            />
            <Route
              path="/reports"
              element={
                <RoleGuard admin>
                  <Reports />
                </RoleGuard>
              }
            />
            <Route
              path="/activity"
              element={
                <RoleGuard admin>
                  <Activity key={location.search} />
                </RoleGuard>
              }
            />
            <Route
              path="/settings"
              element={
                <RoleGuard admin>
                  <Settings />
                </RoleGuard>
              }
            />
            <Route path="/my-activity" element={<Activity personal />} />
            <Route path="/profile" element={<Settings profileOnly />} />
            <Route
              path="*"
              element={
                <Empty
                  title="This page has wandered off"
                  description="Head back to your festive workspace."
                  action={
                    <Button
                      onClick={() => window.location.assign("/dashboard")}
                    >
                      Back to dashboard
                    </Button>
                  }
                />
              }
            />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
