import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil, History, UsersRound } from "lucide-react";
import { useApp } from "../app/Provider";
import {
  Badge,
  Button,
  DataTable,
  Field,
  Modal,
  PageHeader,
  Panel,
  SearchInput,
} from "../components/ui";
import { dateTime, initials, now } from "../utils/format";
import type { StaffUser } from "../types";
import { validateCreateUser } from "../utils/userAccounts";
export default function Staff() {
  const { data, user, repository, toast, isMock } = useApp();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [toggle, setToggle] = useState<StaffUser | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [password,setPassword] = useState("");
  const [confirmPassword,setConfirmPassword] = useState("");
  const existingAccount = !!editing && data.staff.some((s) => s.id === editing.id);
  const closeEditor=()=>{setEditing(null);setPassword("");setConfirmPassword("");setError("");};
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if(existingAccount) await repository.saveStaff(editing!,user!.id);
      else await repository.createStaff(validateCreateUser({name:editing!.name,email:editing!.email,role:editing!.role,password,confirmPassword}),user!.id);
      closeEditor();
      toast(
        isMock
          ? "Demo staff account saved."
          : existingAccount ? "User profile updated." : "User created. They can now sign in with their email and password.",
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
        eyebrow="TEAM ACCESS"
        title="Staff management"
        description="Manage team access and invite users to enter orders."
        actions={
          <Button
            disabled={busy}
            onClick={() => {
              setError("");
              setPassword("");setConfirmPassword("");
              setEditing({
                id: crypto.randomUUID(),
                name: "",
                email: "",
                role: "Data Entry Staff",
                active: true,
                lastActivity: now(),
              });
            }}
          >
            <Plus size={17} />
            Create user
          </Button>
        }
      />
      <div className="directory-summary">
        <div className="stat-icon maroon">
          <UsersRound size={20} />
        </div>
        <strong>{data.staff.filter((s) => s.active).length}</strong>
        <span>active team members</span>
        <span className="directory-note">
          {isMock
            ? "Demo accounts · no real authentication"
            : "Access managed by your Super Admin"}
        </span>
      </div>
      <Panel>
        <div className="table-toolbar">
          <SearchInput
            label="Search staff"
            placeholder="Search name or email…"
            value={search}
            onChange={setSearch}
          />
        </div>
        <DataTable
          fitViewport
          rows={data.staff.filter((s) =>
            `${s.name} ${s.email}`.toLowerCase().includes(search.toLowerCase()),
          )}
          columns={[
            {
              key: "name",
              label: "Staff member",
              value: (s) => s.name,
              render: (s) => (
                <div className="student-name-button">
                  <span className="avatar color-0">{initials(s.name)}</span>
                  <div className="cell-stack">
                    <strong>{s.name}</strong>
                    <span>{s.email}</span>
                  </div>
                </div>
              ),
            },
            {
              key: "role",
              label: "Role",
              render: (s) => (
                <Badge tone={s.role === "Super Admin" ? "admin" : "staff"}>
                  {s.role}
                </Badge>
              ),
            },
            {
              key: "status",
              label: "Account status",
              render: (s) => (
                <button
                  className="badge-button"
                  onClick={() => {
                    if (s.id === user?.id) {
                      toast(
                        "Your active admin account must stay enabled.",
                        true,
                      );
                      return;
                    }
                    setToggle(s);
                  }}
                >
                  <Badge>{s.active ? "Active" : "Inactive"}</Badge>
                </button>
              ),
            },
            {
              key: "orders",
              label: "Orders entered",
              value: (s) =>
                data.orders.filter((o) => o.createdBy === s.id).length,
              render: (s) =>
                data.orders.filter((o) => o.createdBy === s.id).length,
            },
            {
              key: "edits",
              label: "Total edits",
              render: (s) =>
                data.logs.filter(
                  (l) =>
                    l.userId === s.id &&
                    l.action === "Edited" &&
                    l.recordType === "Order",
                ).length,
            },
            {
              key: "last",
              label: "Last activity",
              value: (s) => new Date(s.lastActivity).getTime(),
              render: (s) => dateTime(s.lastActivity),
            },
            {
              key: "actions",
              label: "",
              render: (s) => (
                <div className="table-actions">
                  <button
                    className="icon-button"
                    aria-label={`Edit ${s.name}`}
                    onClick={() => {
                      setPassword("");setConfirmPassword("");
                      setEditing({ ...s });
                      setError("");
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <Link
                    className="icon-button"
                    to={`/activity?user=${s.id}`}
                    aria-label={`Activity of ${s.name}`}
                  >
                    <History size={16} />
                  </Link>
                </div>
              ),
            },
          ]}
        />
      </Panel>
      <Modal
        open={!!editing}
        onClose={()=>{if(!busy)closeEditor();}}
        title={
          editing && data.staff.some((s) => s.id === editing.id)
            ? "Edit staff profile"
            : "Create user"
        }
        description={
          existingAccount ? "Update this user's name and access."
            : "Set their login credentials and access. New users can sign in immediately."
        }
      >
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Field label="User name" required>
              <input
                disabled={busy}
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
                required
                minLength={2}
                maxLength={120}
              />
            </Field>
            <Field label="Email address" required>
              <input
                disabled={busy}
                type="email"
                readOnly={
                  !isMock && data.staff.some((s) => s.id === editing.id)
                }
                value={editing.email}
                onChange={(e) =>
                  setEditing({ ...editing, email: e.target.value })
                }
                required
              />
            </Field>
            {!existingAccount && <>
              <Field label="Password" required hint="Use at least 12 characters.">
                <input type="password" autoComplete="new-password" required minLength={12} maxLength={72} disabled={busy} value={password} onChange={event=>{setPassword(event.target.value);setError("");}} />
              </Field>
              <Field label="Confirm password" required>
                <input type="password" autoComplete="new-password" required minLength={12} maxLength={72} disabled={busy} value={confirmPassword} onChange={event=>{setConfirmPassword(event.target.value);setError("");}} />
              </Field>
            </>}
            <Field label="User type">
              <select
                disabled={busy}
                value={editing.role}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    role: e.target.value as StaffUser["role"],
                  })
                }
              >
                <option>Data Entry Staff</option>
                <option value="Super Admin">Admin</option>
              </select>
            </Field>
            {existingAccount && <label className="checkbox-label">
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) =>
                  setEditing({ ...editing, active: e.target.checked })
                }
              />
              Active account
            </label>}
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <Button variant="secondary" disabled={busy} onClick={closeEditor}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                {existingAccount ? "Save changes" : "Create user"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={!!toggle}
        onClose={() => setToggle(null)}
        title={`${toggle?.active ? "Deactivate" : "Activate"} ${toggle?.name}?`}
        description={
          isMock
            ? "This changes the availability of the mock account only."
            : "Inactive accounts lose access to business records immediately."
        }
      >
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setToggle(null)}>
            Cancel
          </Button>
          <Button
            variant={toggle?.active ? "danger" : "primary"}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await repository.saveStaff(
                  { ...toggle!, active: !toggle!.active },
                  user!.id,
                );
                setToggle(null);
                toast(
                  isMock
                    ? "Demo account status updated."
                    : "Account status updated.",
                );
              } catch (e) {
                toast((e as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirm
          </Button>
        </div>
      </Modal>
    </>
  );
}
