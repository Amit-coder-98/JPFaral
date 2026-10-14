import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Brand } from "../components/Brand";
import { Button, Field } from "../components/ui";
import { setPassword } from "../services/auth";
import { useApp } from "../app/Provider";
export default function AuthSetup() {
  const { user, passwordReady, signOut, toast } = useApp();
  const navigate = useNavigate();
  const [password, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="startup-state">
      <Brand />
      <div className="panel">
        <h1>Set your password</h1>
        <p>
          Use your staff invitation or password recovery link to complete
          account setup.
        </p>
        {!user ? (
          <p role="alert">
            Your link has expired or no session is available. Request another
            invitation or reset email from the login page.
          </p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              if (password.length < 12 || password !== confirm) {
                setError("Use at least 12 characters and matching passwords.");
                return;
              }
              setBusy(true);
              try {
                await setPassword(password);
                passwordReady();
                await signOut();
                toast("Password saved. Sign in with your new password.");
                navigate("/login", { replace: true });
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="New password" required>
              <input
                type="password"
                minLength={12}
                value={password}
                autoComplete="new-password"
                onChange={(e) => setValue(e.target.value)}
                required
              />
            </Field>
            <Field label="Confirm password" required>
              <input
                type="password"
                value={confirm}
                autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Field>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <Button loading={busy} type="submit">
              Save password
            </Button>
          </form>
        )}
        <Button
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            passwordReady();
            await signOut();
            navigate("/login");
          }}
        >
          Back to sign in
        </Button>
      </div>
    </div>
  );
}
