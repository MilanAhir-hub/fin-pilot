/**
 * Super-admin console (§32 Phase 23) — only renders for platform operators
 * (403 otherwise). It reads ACROSS tenants, which nothing else in the product
 * does, so every destructive control here demands a written reason and lands
 * in the admin audit trail on the last tab.
 *
 * Impersonation REQUIRES a reason; the loud banner is driven by the
 * X-Impersonation-* response headers in lib/api.
 */
import { useEffect, useState } from "react";
import { api, qs, setAccessToken } from "../../lib/api";
import { Badge, Btn, C, Card, Err, Field, Row, S, Tbl, dateStr, useLoad } from "../../lib/ui";

interface Overview {
  organizations: number;
  companies: number;
  users: number;
  activeUsers: number;
  disabledUsers: number;
  invoices: number;
  bills: number;
  activeSubscriptions: number;
  totalRevenuePaise: number;
  companiesWithDisabledSections: number;
  plans: { plan: string; count: number }[];
  recentUsers: { id: string; email: string; name: string; createdAt: string }[];
}
interface OrgRow {
  id: string;
  name: string;
  type: string;
  plan: string;
  companies: number;
  subscriptionStatus: string;
  createdAt: string;
}
interface CompanyRow {
  id: string;
  legalName: string;
  gstin: string | null;
  stateCode: string;
  organizationName: string;
  plan: string;
  disabledModules: string[];
  createdAt: string;
}
interface CompanyDetail {
  id: string;
  legalName: string;
  gstin: string | null;
  stateCode: string;
  disabledModules: string[];
  organization: { id: string; name: string; plan: string } | null;
  stats: { invoices: number; bills: number; members: number };
  members: { id: string; email: string; name: string; disabled: boolean }[];
}
interface ModuleDef {
  key: string;
  label: string;
  description: string;
  routes: string[];
}
interface UserRow {
  id: string;
  email: string;
  name: string;
  disabled: boolean;
  superAdmin: boolean;
  companies: number;
  lastLoginAt: string | null;
  createdAt: string;
}
interface SubscriptionRow {
  id: string;
  organizationId: string;
  organizationName: string;
  ownerEmail: string;
  ownerName: string;
  plan: string;
  status: string;
  seats: number;
  razorpaySubscriptionId: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
}
interface PaymentRow {
  id: string;
  paymentNumber: string;
  companyId: string;
  companyName: string;
  direction: string;
  amountPaise: number;
  method: string;
  reference: string | null;
  date: string;
  createdAt: string;
}
interface ActivityItem {
  type: string;
  description: string;
  at: string;
}
interface AuditRow {
  id: string;
  action: string;
  adminEmail: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  meta: Record<string, unknown>;
  at: string;
}
interface DeadLetter {
  _id: string;
  queue: string;
  jobId: string;
  error: string;
  failedAt: string;
  replayedAt: string | null;
}

type Tab =
  | "overview"
  | "users"
  | "companies"
  | "subscriptions"
  | "payments"
  | "activities"
  | "organizations"
  | "dlq"
  | "audit";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Dashboard" },
  { key: "users", label: "Users" },
  { key: "companies", label: "Companies" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "payments", label: "Payments" },
  { key: "activities", label: "Activity" },
  { key: "organizations", label: "Organizations" },
  { key: "dlq", label: "Dead letters" },
  { key: "audit", label: "Audit" },
];

function formatINR(paise: number) {
  return (
    "\u20b9" +
    (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0 })
  );
}

function Stat({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string | number;
  tone?: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "0.75rem 1rem",
        minWidth: 140,
        flex: "1 1 140px",
      }}
    >
      <div style={{ fontSize: "1.6rem", fontWeight: 700, color: tone ?? C.text }}>{value}</div>
      <div style={{ color: C.muted, fontSize: "0.78rem" }}>{label}</div>
      {sub && <div style={{ color: C.muted, fontSize: "0.72rem", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function CompanySections({ companyId, onSaved }: { companyId: string; onSaved: () => void }) {
  const detail = useLoad(
    () => api<{ company: CompanyDetail }>("GET", `/api/v1/admin/companies/${companyId}`),
    [companyId],
  );
  const modules = useLoad(() => api<{ modules: ModuleDef[] }>("GET", "/api/v1/admin/modules"));
  const [draft, setDraft] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const company = detail.data?.company;
  const disabled = draft ?? company?.disabledModules ?? [];
  const dirty =
    draft !== null &&
    JSON.stringify([...disabled].sort()) !==
      JSON.stringify([...(company?.disabledModules ?? [])].sort());

  function toggle(key: string) {
    const next = disabled.includes(key) ? disabled.filter((k) => k !== key) : [...disabled, key];
    setDraft(next);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api("PATCH", `/api/v1/admin/companies/${companyId}/modules`, {
        disabledModules: disabled,
        reason,
      });
      setDraft(null);
      setReason("");
      detail.reload();
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (detail.busy) return <p style={{ color: C.muted }}>Loading...</p>;
  if (!company) return <Err error={detail.error} />;

  return (
    <div>
      <Row>
        <Stat label="Invoices" value={company.stats.invoices} />
        <Stat label="Bills" value={company.stats.bills} />
        <Stat label="Members" value={company.stats.members} />
      </Row>
      <p style={{ color: C.muted, fontSize: "0.82rem", marginTop: 14 }}>
        Switching a section off is enforced by the API. Routes answer 403 for everyone in this
        company.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {(modules.data?.modules ?? []).map((m) => {
          const off = disabled.includes(m.key);
          return (
            <label
              key={m.key}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                border: `1px solid ${off ? C.red : C.border}`,
                background: off ? "transparent" : C.panel2,
                borderRadius: 8,
                padding: "0.6rem 0.8rem",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={!off}
                onChange={() => toggle(m.key)}
                style={{ marginTop: 3 }}
              />
              <span>
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{m.label}</span>{" "}
                <span style={{ color: off ? C.red : C.green, fontSize: "0.75rem" }}>
                  {off ? "OFF" : "on"}
                </span>
                <div style={{ color: C.muted, fontSize: "0.78rem" }}>{m.description}</div>
                <code style={{ color: C.muted, fontSize: "0.7rem" }}>{m.routes.join("  ")}</code>
              </span>
            </label>
          );
        })}
      </div>
      <Row>
        <Field label="Reason (min 10 chars - audited verbatim)">
          <input
            style={{ ...S.input, width: 380 }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="why these sections are changing"
          />
        </Field>
        <Btn onClick={() => void save()} disabled={!dirty || reason.trim().length < 10 || busy}>
          {busy ? "Saving..." : "Save sections"}
        </Btn>
        {dirty && (
          <Btn kind="ghost" onClick={() => setDraft(null)}>
            Reset
          </Btn>
        )}
      </Row>
      <Err error={error} />
    </div>
  );
}

function activityDot(type: string) {
  if (type === "user_registered") return { color: C.green, label: "User" };
  if (type === "company_created") return { color: C.accent, label: "Company" };
  if (type === "subscription_updated") return { color: C.amber, label: "Sub" };
  return { color: C.muted, label: type };
}

export function AdminPage({ onImpersonated }: { onImpersonated: () => void }) {
  // One destination at a time. The rail selects the page; the page owns the
  // viewport. Scroll position resets on every change so a long table does not
  // hand the next section a scrolled-down viewport.
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);
  const [error, setError] = useState<unknown>(null);

  const overview = useLoad(() => api<Overview>("GET", "/api/v1/admin/overview"));
  const orgs = useLoad(() =>
    api<{ organizations: OrgRow[] }>("GET", "/api/v1/admin/organizations"),
  );
  const [companyQ, setCompanyQ] = useState("");
  const companies = useLoad(
    () =>
      api<{ companies: CompanyRow[] }>(
        "GET",
        `/api/v1/admin/companies${qs({ q: companyQ })}`,
      ),
    [companyQ],
  );
  const [userQ, setUserQ] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const users = useLoad(
    () => api<{ users: UserRow[] }>("GET", `/api/v1/admin/users${qs({ q: userQ })}`),
    [userQ],
  );
  const subscriptions = useLoad(() =>
    api<{ subscriptions: SubscriptionRow[] }>("GET", "/api/v1/admin/subscriptions"),
  );
  const payments = useLoad(() =>
    api<{ payments: PaymentRow[] }>("GET", "/api/v1/admin/payments"),
  );
  const activities = useLoad(() =>
    api<{ activities: ActivityItem[] }>("GET", "/api/v1/admin/activities"),
  );
  const dlq = useLoad(() => api<{ deadLetters: DeadLetter[] }>("GET", "/api/v1/admin/dlq"));
  const audit = useLoad(() => api<{ audit: AuditRow[] }>("GET", "/api/v1/admin/audit"));

  const [openCompany, setOpenCompany] = useState<string | null>(null);
  const [targetUserId, setTargetUserId] = useState("");
  const [reason, setReason] = useState("");

  async function impersonate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await api<{ token: string; sessionId: string }>(
        "POST",
        "/api/v1/admin/impersonate",
        { targetUserId, reason },
      );
      setAccessToken(result.token);
      onImpersonated();
    } catch (err) {
      setError(err);
    }
  }

  /**
   * One-click impersonation straight from a user row. The form below still
   * exists for a user you only have an id for, but copying a 24-char ObjectId
   * out of the Users table to paste it back in two fields down was the only
   * way to reach an account — and a mistyped id is a 404, not a wrong account.
   * The reason is still mandatory and still audited verbatim (§17).
   */
  async function accessAccount(user: UserRow) {
    const why = window.prompt(
      `Access ${user.email} as them.\n\nThis opens a 15-minute impersonated session. Every request is logged against your operator account.\n\nReason (min 10 chars, audited verbatim):`,
      "",
    );
    if (why === null) return;
    if (why.trim().length < 10) {
      setError(new Error("A reason of at least 10 characters is required to impersonate."));
      return;
    }
    setError(null);
    try {
      const result = await api<{ token: string; sessionId: string }>(
        "POST",
        "/api/v1/admin/impersonate",
        { targetUserId: user.id, reason: why.trim() },
      );
      setAccessToken(result.token);
      onImpersonated();
    } catch (err) {
      setError(err);
    }
  }

  async function setUserDisabled(user: UserRow) {
    const why = window.prompt(
      `${user.disabled ? "Re-enable" : "Disable"} ${user.email}. Reason (min 10 chars, audited):`,
      "",
    );
    if (!why || why.trim().length < 10) return;
    setError(null);
    try {
      await api("PATCH", `/api/v1/admin/users/${user.id}/status`, {
        disabled: !user.disabled,
        reason: why,
      });
      users.reload();
      overview.reload();
      audit.reload();
    } catch (err) {
      setError(err);
    }
  }

  async function replay(id: string) {
    setError(null);
    try {
      await api("POST", `/api/v1/admin/dlq/${id}/replay`, {});
      dlq.reload();
    } catch (err) {
      setError(err);
    }
  }

  const filteredUsers = (users.data?.users ?? []).filter((u) => {
    if (userStatusFilter === "active") return !u.disabled && !u.superAdmin;
    if (userStatusFilter === "disabled") return u.disabled;
    return true;
  });

  return (
    // Sidebar on the left, the active section on the right. The old layout put
    // nine tabs in a wrapping row above the content, so the section you were
    // reading shifted down as the row rewrapped and nothing was ever fully
    // visible at once. A fixed rail keeps every destination on screen.
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
      <aside
        style={{
          flex: "0 0 208px",
          position: "sticky",
          top: 16,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          padding: 10,
          borderRadius: 10,
          border: `1px solid ${C.border}`,
          background: C.panel,
        }}
      >
        <div
          style={{
            color: C.muted,
            fontSize: "0.68rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "2px 8px 8px",
          }}
        >
          Platform console
        </div>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                textAlign: "left",
                cursor: "pointer",
                padding: "8px 10px",
                borderRadius: 7,
                fontSize: "0.85rem",
                fontWeight: active ? 600 : 400,
                color: active ? C.text : C.muted,
                background: active ? C.accentSoft : "transparent",
                border: "none",
                borderLeft: `2px solid ${active ? C.accent : "transparent"}`,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        <Card title={TABS.find((t) => t.key === tab)?.label ?? "Platform console"}>
          <p style={{ color: C.muted, fontSize: "0.82rem", margin: 0 }}>
            Every company and every organization on the platform, above the tenant boundary. Changes
            that affect a customer require a written reason and appear in the audit trail.
          </p>
        </Card>

      <Err error={error} />

      {/* DASHBOARD */}
      {tab === "overview" && (
        <>
          <Card title="Platform at a glance">
            <Err error={overview.error} />
            <Row>
              <Stat label="Total users" value={overview.data?.users ?? 0} />
              <Stat label="Active users" value={overview.data?.activeUsers ?? 0} tone={C.green} />
              <Stat
                label="Disabled users"
                value={overview.data?.disabledUsers ?? 0}
                tone={overview.data?.disabledUsers ? C.red : undefined}
              />
              <Stat label="Companies" value={overview.data?.companies ?? 0} />
              <Stat label="Organizations" value={overview.data?.organizations ?? 0} />
            </Row>
            <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Stat
                label="Active subscriptions"
                value={overview.data?.activeSubscriptions ?? 0}
                tone={C.accent}
              />
              <Stat
                label="Total revenue (Razorpay)"
                value={overview.data != null ? formatINR(overview.data.totalRevenuePaise) : "-"}
                tone={C.green}
                sub="business payments via Razorpay method"
              />
              <Stat label="Invoices" value={overview.data?.invoices ?? 0} />
              <Stat label="Bills" value={overview.data?.bills ?? 0} />
              <Stat
                label="Companies with sections off"
                value={overview.data?.companiesWithDisabledSections ?? 0}
                tone={overview.data?.companiesWithDisabledSections ? C.amber : undefined}
              />
            </div>
            <p style={{ color: C.muted, fontSize: "0.8rem", marginBottom: 4, marginTop: 16 }}>
              Organizations by plan
            </p>
            <Row>
              {(overview.data?.plans ?? []).map((p) => (
                <span key={p.plan} style={{ fontSize: "0.85rem" }}>
                  <Badge value={p.plan} /> {p.count}
                </span>
              ))}
            </Row>
          </Card>

          <Card title="Recent user registrations (last 7 days)">
            <Tbl
              head={["Name", "Email", "Registered"]}
              empty="No recent registrations."
              rows={(overview.data?.recentUsers ?? []).map((u) => [
                u.name,
                u.email,
                dateStr(u.createdAt),
              ])}
            />
          </Card>
        </>
      )}

      {/* USERS */}
      {tab === "users" && (
        <Card
          title={`Users . ${filteredUsers.length}`}
          actions={
            <Row>
              <input
                style={{ ...S.input, margin: 0, width: 200 }}
                placeholder="search email..."
                value={userQ}
                onChange={(e) => setUserQ(e.target.value)}
              />
              <select
                style={{ ...S.input, margin: 0, width: 130, height: 36, padding: "0 0.6rem" }}
                value={userStatusFilter}
                onChange={(e) =>
                  setUserStatusFilter(e.target.value as "all" | "active" | "disabled")
                }
              >
                <option value="all">All status</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </Row>
          }
        >
          <Err error={users.error} />
          <Tbl
            head={["Email", "Name", "Companies", "Status", "Last login", "Registered", "Action"]}
            empty="No users match."
            rows={filteredUsers.map((u) => [
              u.email,
              u.name,
              u.companies,
              u.superAdmin ? (
                <Badge key="s" value="operator" />
              ) : u.disabled ? (
                <Badge key="s" value="rejected" />
              ) : (
                <Badge key="s" value="active" />
              ),
              u.lastLoginAt ? dateStr(u.lastLoginAt) : "-",
              dateStr(u.createdAt),
              u.superAdmin ? (
                <span key="a" style={{ color: C.muted, fontSize: "0.78rem" }}>
                  ops-only
                </span>
              ) : (
                <Row key="a">
                  {/* An operator cannot impersonate a disabled user: the session
                      would be revoked on the first request anyway. */}
                  <Btn small kind="ghost" disabled={u.disabled} onClick={() => void accessAccount(u)}>
                    Access account
                  </Btn>
                  <Btn
                    small
                    kind={u.disabled ? "success" : "danger"}
                    onClick={() => void setUserDisabled(u)}
                  >
                    {u.disabled ? "Enable" : "Disable"}
                  </Btn>
                </Row>
              ),
            ])}
          />
          <p style={{ color: C.muted, fontSize: "0.75rem", marginBottom: 0 }}>
            Disabling revokes every session immediately; login and refresh both refuse afterwards.
            Platform operators cannot be disabled here - that flag is set out of band.
          </p>
        </Card>
      )}

      {/* COMPANIES */}
      {tab === "companies" && (
        <Card
          title={`Companies . ${companies.data?.companies.length ?? 0}`}
          actions={
            <input
              style={{ ...S.input, margin: 0, width: 220 }}
              placeholder="search legal name..."
              value={companyQ}
              onChange={(e) => setCompanyQ(e.target.value)}
            />
          }
        >
          <Err error={companies.error} />
          <Tbl
            head={["Company", "Organization", "Plan", "State", "GSTIN", "Registered", "Sections", ""]}
            empty="No companies match."
            rows={(companies.data?.companies ?? []).map((c) => [
              c.legalName,
              c.organizationName,
              <Badge key="p" value={c.plan} />,
              c.stateCode,
              c.gstin ?? "-",
              dateStr(c.createdAt),
              c.disabledModules.length === 0 ? (
                <span key="m" style={{ color: C.green, fontSize: "0.8rem" }}>
                  all on
                </span>
              ) : (
                <span key="m" style={{ color: C.red, fontSize: "0.8rem" }}>
                  {c.disabledModules.join(", ")}
                </span>
              ),
              <Btn
                key="b"
                small
                kind={openCompany === c.id ? "primary" : "ghost"}
                onClick={() => setOpenCompany(openCompany === c.id ? null : c.id)}
              >
                {openCompany === c.id ? "Close" : "Sections"}
              </Btn>,
            ])}
          />
          {openCompany && (
            <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <CompanySections
                companyId={openCompany}
                onSaved={() => {
                  companies.reload();
                  overview.reload();
                  audit.reload();
                }}
              />
            </div>
          )}
        </Card>
      )}

      {/* SUBSCRIPTIONS */}
      {tab === "subscriptions" && (
        <Card title={`Subscriptions . ${subscriptions.data?.subscriptions.length ?? 0}`}>
          <Err error={subscriptions.error} />
          <Tbl
            head={[
              "Organization",
              "Owner",
              "Plan",
              "Status",
              "Seats",
              "Razorpay Sub ID",
              "Period end",
              "Created",
            ]}
            empty="No subscriptions found."
            rows={(subscriptions.data?.subscriptions ?? []).map((s) => [
              s.organizationName,
              <span key="o" style={{ fontSize: "0.82rem" }}>
                {s.ownerName}
                <br />
                <span style={{ color: C.muted, fontSize: "0.72rem" }}>{s.ownerEmail}</span>
              </span>,
              <Badge key="p" value={s.plan} />,
              <Badge key="st" value={s.status} />,
              s.seats,
              s.razorpaySubscriptionId ? (
                <code key="r" style={{ fontSize: "0.7rem", color: C.muted }}>
                  {s.razorpaySubscriptionId}
                </code>
              ) : (
                "-"
              ),
              s.currentPeriodEnd ? dateStr(s.currentPeriodEnd) : "-",
              dateStr(s.createdAt),
            ])}
          />
          <p style={{ color: C.muted, fontSize: "0.75rem", marginBottom: 0 }}>
            Each organization has at most one subscription record. Free plan orgs show status
            active with no Razorpay ID. Plan changes by a platform operator are reflected
            here immediately.
          </p>
        </Card>
      )}

      {/* PAYMENTS */}
      {tab === "payments" && (
        <Card title={`Payments (Razorpay) . ${payments.data?.payments.length ?? 0}`}>
          <Err error={payments.error} />
          <Tbl
            head={["Payment #", "Company", "Direction", "Amount", "Reference", "Date"]}
            empty="No Razorpay payments found. Business payments with method=razorpay will appear here."
            rows={(payments.data?.payments ?? []).map((p) => [
              <code key="n" style={{ fontSize: "0.78rem" }}>
                {p.paymentNumber}
              </code>,
              p.companyName,
              <Badge key="d" value={p.direction === "inflow" ? "inflow" : "outflow"} />,
              <span
                key="a"
                style={{ fontWeight: 600, color: p.direction === "inflow" ? C.green : C.red }}
              >
                {formatINR(p.amountPaise)}
              </span>,
              p.reference ? (
                <code key="r" style={{ fontSize: "0.72rem", color: C.muted }}>
                  {p.reference}
                </code>
              ) : (
                "-"
              ),
              dateStr(p.date),
            ])}
          />
          <p style={{ color: C.muted, fontSize: "0.75rem", marginBottom: 0 }}>
            Showing business payments tagged with method razorpay. Subscription billing events
            come via webhook and are stored in the Subscription record, not here.
          </p>
        </Card>
      )}

      {/* ACTIVITIES */}
      {tab === "activities" && (
        <Card title="Recent platform activity">
          <Err error={activities.error} />
          {activities.busy && <p style={{ color: C.muted }}>Loading...</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(activities.data?.activities ?? []).map((a, i) => {
              const dot = activityDot(a.type);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    padding: "0.55rem 0.7rem",
                    borderRadius: 8,
                    border: `1px solid ${C.border}`,
                    background: C.panel2,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      minWidth: 64,
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      color: dot.color,
                      background: `${dot.color}22`,
                      borderRadius: 4,
                      padding: "2px 6px",
                      textAlign: "center",
                      marginTop: 1,
                    }}
                  >
                    {dot.label}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.84rem", color: C.text }}>{a.description}</div>
                    <div style={{ color: C.muted, fontSize: "0.73rem", marginTop: 2 }}>
                      {dateStr(a.at)}
                    </div>
                  </div>
                </div>
              );
            })}
            {(activities.data?.activities ?? []).length === 0 && !activities.busy && (
              <p style={{ color: C.muted, fontSize: "0.85rem" }}>No activity yet.</p>
            )}
          </div>
        </Card>
      )}

      {/* ORGANIZATIONS */}
      {tab === "organizations" && (
        <>
          <Card title={`Organizations . ${orgs.data?.organizations.length ?? 0}`}>
            <Err error={orgs.error} />
            <Tbl
              head={["Name", "Type", "Plan", "Companies", "Subscription", "Created"]}
              rows={(orgs.data?.organizations ?? []).map((o) => [
                o.name,
                o.type,
                <Badge key="p" value={o.plan} />,
                o.companies,
                <Badge key="s" value={o.subscriptionStatus} />,
                dateStr(o.createdAt),
              ])}
            />
          </Card>

          <Card title="Impersonate a user - impossible without a written reason">
            <form onSubmit={impersonate}>
              <Row>
                <Field label="Target user id (24-char)">
                  <input
                    style={{ ...S.input, width: 240 }}
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Reason (min 10 chars - audited verbatim)">
                  <input
                    style={{ ...S.input, width: 320 }}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                  />
                </Field>
                <Btn kind="danger">Impersonate</Btn>
              </Row>
            </form>
            <p style={{ color: C.muted, fontSize: "0.75rem", marginBottom: 0 }}>
              15-minute token - every request lands in the session action log - every audit row is
              tagged - the banner stays on until the session ends.
            </p>
          </Card>
        </>
      )}

      {/* DLQ */}
      {tab === "dlq" && (
        <Card title="Dead-letter queue - inspect, fix, REPLAY">
          <Err error={dlq.error} />
          <Tbl
            head={["Queue", "Job", "Error", "Failed at", "Action"]}
            empty="DLQ is empty - as it should be."
            rows={(dlq.data?.deadLetters ?? []).map((d) => [
              d.queue,
              d.jobId,
              <code key="e" style={{ fontSize: "0.75rem" }}>
                {d.error}
              </code>,
              dateStr(d.failedAt),
              d.replayedAt ? (
                <span style={{ color: C.muted, fontSize: "0.8rem" }}>replayed</span>
              ) : (
                <Btn small onClick={() => void replay(d._id)}>
                  Replay
                </Btn>
              ),
            ])}
          />
        </Card>
      )}

      {/* AUDIT */}
      {tab === "audit" && (
        <Card title="Admin audit trail - what operators did, and why">
          <Err error={audit.error} />
          <Tbl
            head={["When", "Operator", "Action", "Target", "Reason"]}
            empty="Nothing yet."
            rows={(audit.data?.audit ?? []).map((a) => [
              dateStr(a.at),
              a.adminEmail,
              <Badge key="a" value={a.action} />,
              <span key="t" style={{ fontSize: "0.78rem" }}>
                {a.targetType}
                <br />
                <code style={{ color: C.muted, fontSize: "0.7rem" }}>{a.targetId}</code>
              </span>,
              <span key="r" style={{ fontSize: "0.8rem" }}>
                {a.reason ?? "-"}
              </span>,
            ])}
          />
        </Card>
      )}
      </div>
    </div>
  );
}
