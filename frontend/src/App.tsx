import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchActionItems } from "./api";
import { TriageTable } from "./components/TriageTable";

export default function App() {
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["action-items", status, priority, flaggedOnly, search],
    queryFn: () =>
      fetchActionItems({
        status: status || undefined,
        priority: priority || undefined,
        flagged: flaggedOnly ? "true" : undefined,
        search: search || undefined,
      }),
  });

  const items = data?.data ?? [];

  const stats = useMemo(() => {
    const total = items.length;
    const flagged = items.filter((i) => i.flagged).length;
    const overdue = items.filter((i) => i.overdue).length;
    return { total, flagged, overdue };
  }, [items]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>
            Regulatory Triage
            <span className="sub">Compliance decision layer</span>
          </h1>
        </div>
        <div className="header-stats">
          <span>
            Showing <strong>{stats.total}</strong>
          </span>
          <span className="stat-flagged">
            Flagged <strong>{stats.flagged}</strong>
          </span>
          <span>
            Overdue <strong>{stats.overdue}</strong>
          </span>
        </div>
      </header>

      <div className="toolbar">
        <input
          type="text"
          placeholder="Search description, directive, reference code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <span className="toolbar-label">Status</span>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          <option value="PENDING">Pending</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="BLOCKED">Blocked</option>
        </select>

        <span className="toolbar-label">Priority</span>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">All</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>

        <label style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-dim)" }}>
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
          Flagged only
        </label>

        <div className="spacer" />
        <span className="result-count">{data?.meta.total ?? 0} records</span>
      </div>

      <div className="table-wrap">
        {isLoading && <div className="loading">Loading action items…</div>}
        {isError && (
          <div className="error-state">Could not load data: {(error as Error).message}</div>
        )}
        {!isLoading && !isError && items.length === 0 && (
          <div className="loading">No action items match the current filters.</div>
        )}
        {!isLoading && !isError && items.length > 0 && <TriageTable items={items} />}
      </div>
    </div>
  );
}
