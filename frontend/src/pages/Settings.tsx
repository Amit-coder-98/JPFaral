import { useState } from "react";
import {
  Save,
  Building2,
  UserRound,
  Paintbrush,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "../app/Provider";
import { Button, Field, PageHeader, Panel } from "../components/ui";
import { changePassword } from "../services/auth";
export default function Settings({
  profileOnly = false,
}: {
  profileOnly?: boolean;
}) {
  const { data, user, repository, toast, isMock } = useApp();
  const [busy, setBusy] = useState(false);
  const run = async (action: () => void | Promise<void>, message: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast(message);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const [settings, setSettings] = useState({ ...data.settings });
  const [name, setName] = useState(user!.name);
  const [email, setEmail] = useState(user!.email);
  const [password, setPassword] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [error, setError] = useState("");
  return (
    <>
      <PageHeader
        eyebrow="MAKE YOURSELF AT HOME"
        title={profileOnly ? "Your profile" : "Settings & profile"}
        description="A few thoughtful details to make this workspace yours."
      />
      <div className="settings-layout">
        {!profileOnly && (
          <Panel
            title="Organization details"
            description="The name and contact information shown on bills."
            actions={<Building2 size={20} />}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () => repository.saveSettings(settings, user!.id),
                  isMock
                    ? "Organization settings saved for this demo session."
                    : "Organization settings saved.",
                );
              }}
              className="settings-form"
            >
              <Field label="Organization name" required>
                <input
                  value={settings.organization}
                  onChange={(e) =>
                    setSettings({ ...settings, organization: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="Contact email" required>
                <input
                  type="email"
                  value={settings.contact}
                  onChange={(e) =>
                    setSettings({ ...settings, contact: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="Address">
                <textarea
                  value={settings.address}
                  onChange={(e) =>
                    setSettings({ ...settings, address: e.target.value })
                  }
                />
              </Field>
              <div className="modal-actions">
                <Button type="submit" loading={busy}>
                  <Save size={16} />
                  Save organization
                </Button>
              </div>
            </form>
          </Panel>
        )}
        <Panel
          title="Staff profile"
          description="Your details in this shared workspace."
          actions={<UserRound size={20} />}
        >
          <form
            className="settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => repository.saveProfile(name, email, user!.id),
                isMock
                  ? "Demo profile updated."
                  : "Profile saved. Email changes may require confirmation from your inbox.",
              );
            }}
          >
            <Field label="Full name" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
              />
            </Field>
            <Field label="Email address" required>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Role">
              <input readOnly value={user!.role} className="readonly-input" />
            </Field>
            <div className="modal-actions">
              <Button type="submit" loading={busy}>
                <Save size={16} />
                Save profile
              </Button>
            </div>
          </form>
        </Panel>
        <Panel
          title="Branding & display"
          description="A little personal touch, with the JPfaral identity intact."
          actions={<Paintbrush size={20} />}
        >
          <div className="settings-form">
            <Field label="Brand wordmark">
              <input readOnly value="JPfaral" className="readonly-input" />
            </Field>
            <Field label="Festive accent">
              <select
                value={settings.accent}
                onChange={(e) =>
                  setSettings({ ...settings, accent: e.target.value })
                }
              >
                <option value="#b56735">Warm saffron</option>
                <option value="#985161">Rose burgundy</option>
                <option value="#527a64">Muted green</option>
              </select>
            </Field>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.compact}
                onChange={(e) =>
                  setSettings({ ...settings, compact: e.target.checked })
                }
              />
              Compact table spacing
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.reduceMotion}
                onChange={(e) =>
                  setSettings({ ...settings, reduceMotion: e.target.checked })
                }
              />
              Reduce animations
            </label>
            <div className="modal-actions">
              <Button
                loading={busy}
                onClick={() => {
                  void run(
                    () =>
                      repository.saveSettings(
                        {
                          ...(profileOnly ? data.settings : settings),
                          accent: settings.accent,
                          compact: settings.compact,
                          reduceMotion: settings.reduceMotion,
                        },
                        user!.id,
                      ),
                    "Display preferences saved.",
                  );
                }}
              >
                <Save size={16} />
                Save preferences
              </Button>
            </div>
          </div>
        </Panel>
        <Panel
          title={isMock ? "Change password · UI demo" : "Change password"}
          description={
            isMock
              ? "Preview validation for a future authentication integration."
              : "Confirm your current password to change your account password."
          }
          actions={<ShieldCheck size={20} />}
        >
          <form
            className="settings-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              if (isMock && password.current !== "diwali2026") {
                setError("Current demo password is diwali2026.");
                return;
              }
              if (password.next.length < (isMock ? 8 : 12)) {
                setError(`Choose at least ${isMock ? 8 : 12} characters.`);
                return;
              }
              if (password.next !== password.confirm) {
                setError("The new passwords do not match.");
                return;
              }
              setBusy(true);
              try {
                if (!isMock)
                  await changePassword(
                    user!.email,
                    password.current,
                    password.next,
                  );
                setPassword({ current: "", next: "", confirm: "" });
                toast(
                  isMock
                    ? "Password form validated. No real credential was changed."
                    : "Password updated.",
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Current password">
              <input
                type="password"
                value={password.current}
                onChange={(e) =>
                  setPassword({ ...password, current: e.target.value })
                }
                autoComplete="current-password"
                required
              />
            </Field>
            <div className="form-grid">
              <Field label="New password">
                <input
                  type="password"
                  value={password.next}
                  onChange={(e) =>
                    setPassword({ ...password, next: e.target.value })
                  }
                  autoComplete="new-password"
                  required
                  minLength={isMock ? 8 : 12}
                />
              </Field>
              <Field label="Confirm password">
                <input
                  type="password"
                  value={password.confirm}
                  onChange={(e) =>
                    setPassword({ ...password, confirm: e.target.value })
                  }
                  autoComplete="new-password"
                  required
                />
              </Field>
            </div>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <div className="info-box">
              {isMock
                ? "This demonstration does not save credentials. Every change resets when the page refreshes."
                : "Use a unique password. Your current password is checked before the change is saved."}
            </div>
            <div className="modal-actions">
              <Button variant="secondary" type="submit" loading={busy}>
                {isMock ? "Preview password change" : "Update password"}
              </Button>
            </div>
          </form>
        </Panel>
      </div>
    </>
  );
}
