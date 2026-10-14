import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Users,
  Sparkles,
} from "lucide-react";
import { useApp } from "../app/Provider";
import { Brand, Diya } from "../components/Brand";
import { Button, Field, Modal } from "../components/ui";
import { requestPasswordReset } from "../services/auth";
const schema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(6, "Enter at least 6 characters"),
});
export default function Login() {
  const { signIn, isMock, sessionError, toast, user } = useApp();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState("Super Admin");
  const [resetEmail, setResetEmail] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      email: isMock ? "admin@jpfaral.demo" : "",
      password: isMock ? "diwali2026" : "",
    },
  });
  const submit = handleSubmit(async (form) => {
    setError("");
    setLoading(true);
    try {
      await signIn(form.email, form.password);
      navigate("/dashboard");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  });
  if (user?.active) return <Navigate to="/dashboard" replace />;
  return (
    <div className="login-page">
      <section className="login-art">
        <Brand light />
        <div className="login-art-content">
          <span className="login-eyebrow">
            <Sparkles size={16} /> A SEASON OF TOGETHERNESS
          </span>
          <h1>
            Small moments.
            <br />
            Sweet celebrations.
          </h1>
          <p>
            Bring every order, every student, and every celebration together in
            one thoughtful workspace.
          </p>
          <div className="festive-art" aria-hidden="true">
            <div className="rangoli" />
            <div className="diya-illustration">
              <Diya size={140} />
            </div>
            <span className="art-star star-one">✦</span>
            <span className="art-star star-two">✧</span>
            <span className="art-star star-three">✦</span>
          </div>
        </div>
        <div className="login-art-footer">
          HANDCRAFTED WITH CARE. SHARED WITH JOY.
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-mobile-brand">
          <Brand />
        </div>
        <div className="login-form">
          <span className="eyebrow">WELCOME TO JPFARAL</span>
          <h2>Let’s make this season sweet.</h2>
          <p>Sign in to your Diwali order workspace.</p>
          {isMock && (
            <div className="demo-role-tabs">
              <button
                className={role === "Super Admin" ? "selected" : ""}
                onClick={() => {
                  setRole("Super Admin");
                  setValue("email", "admin@jpfaral.demo");
                  setError("");
                }}
              >
                <ShieldCheck size={17} />
                Super Admin
              </button>
              <button
                className={role !== "Super Admin" ? "selected" : ""}
                onClick={() => {
                  setRole("Data Entry Staff");
                  setValue("email", "priya@jpfaral.demo");
                  setError("");
                }}
              >
                <Users size={17} />
                Staff
              </button>
            </div>
          )}
          <form onSubmit={submit} noValidate>
            <Field label="Email address" error={errors.email?.message}>
              <input
                type="email"
                autoComplete="username"
                {...register("email")}
              />
            </Field>
            <Field label="Password" error={errors.password?.message}>
              <span className="password-input">
                <input
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  {...register("password")}
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </Field>
            <div className="login-options">
              {isMock && (
                <label>
                  <input type="checkbox" /> Remember me{" "}
                  <span className="muted">(demo)</span>
                </label>
              )}
              <button type="button" onClick={() => setForgot(true)}>
                Forgot password?
              </button>
            </div>
            {(error || sessionError) && (
              <div className="field-error" role="alert">
                {error || sessionError}
              </div>
            )}
            <Button type="submit" loading={loading} className="full-width">
              Sign in to workspace <ArrowRight size={17} />
            </Button>
          </form>
          <div className="login-demo-note">
            <ShieldCheck size={19} />
            <div>
              <strong>
                {isMock
                  ? "A safe space to explore"
                  : "Your team's shared workspace"}
              </strong>
              <p>
                {isMock ? (
                  <>
                    Frontend demo only. Use <code>diwali2026</code> as the
                    password. No real authentication or persistent data.
                  </>
                ) : (
                  "Sign in with your staff account. Contact your Super Admin for an invitation or help with account access."
                )}
              </p>
            </div>
          </div>
        </div>
        <span className="login-copyright">
          © 2026 JPfaral. A little care in every order.
        </span>
      </section>
      <Modal
        open={forgot}
        onClose={() => setForgot(false)}
        title={isMock ? "Demo password help" : "Reset your password"}
      >
        {isMock ? (
          <>
            <p>
              All demo accounts use <strong>diwali2026</strong>. Password
              recovery will be connected when real authentication is
              implemented.
            </p>
            <Button onClick={() => setForgot(false)}>Got it</Button>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setResetBusy(true);
              try {
                await requestPasswordReset(resetEmail);
                toast(
                  "If that account exists, a password reset email will arrive shortly.",
                );
                setForgot(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setResetBusy(false);
              }
            }}
          >
            <Field label="Account email" required>
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </Field>
            <Button type="submit" loading={resetBusy}>
              Send reset email
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
