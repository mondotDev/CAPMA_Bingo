import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadActiveEvent } from "../features/event/event.api";
import { getEntriesByEventId } from "../features/entry/entry.api";
import type { EntryRecord } from "../features/entry/entry.types";

function formatCompletedAt(value: Date | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default function AdminPage() {
  const [eventName, setEventName] = useState("");
  const [entries, setEntries] = useState<EntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setError(null);

      try {
        const activeEvent = await loadActiveEvent();
        const activeEntries = await getEntriesByEventId(activeEvent.eventId);

        if (cancelled) {
          return;
        }

        setEventName(activeEvent.name);
        setEntries(activeEntries);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "We could not load admin entry data.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    const completed = entries.filter((entry) => entry.completed).length;

    return {
      total: entries.length,
      completed,
      inProgress: entries.length - completed,
    };
  }, [entries]);

  return (
    <main className="admin-shell">
      <section className="admin-panel">
        <header className="admin-header">
          <div className="space-y-2">
            <p className="eyebrow">CAPMA Bingo Admin</p>
            <h1 className="section-title">Active Event Entries</h1>
            <p className="body-copy">
              {loading ? "Loading event..." : eventName || "No active event"}
            </p>
          </div>
          <Link className="admin-link" to="/">
            Back To Attendee View
          </Link>
        </header>

        {error ? <p className="status-message">{error}</p> : null}

        <section className="admin-summary-grid">
          <article className="admin-summary-card">
            <p className="eyebrow">Total Entries</p>
            <p className="admin-summary-value">{summary.total}</p>
          </article>
          <article className="admin-summary-card">
            <p className="eyebrow">In Progress</p>
            <p className="admin-summary-value">{summary.inProgress}</p>
          </article>
          <article className="admin-summary-card">
            <p className="eyebrow">Completed</p>
            <p className="admin-summary-value">{summary.completed}</p>
          </article>
        </section>

        <section className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Selected</th>
                <th>Status</th>
                <th>Completed At</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="admin-empty-cell" colSpan={6}>
                    Loading entries...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td className="admin-empty-cell" colSpan={6}>
                    No entries found for the active event.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.name}</td>
                    <td>{entry.company}</td>
                    <td>{entry.email}</td>
                    <td>{entry.markedSquareIds.length}</td>
                    <td>
                      <span
                        className={
                          entry.completed
                            ? "admin-status admin-status-complete"
                            : "admin-status"
                        }
                      >
                        {entry.completed ? "Completed" : "In Progress"}
                      </span>
                    </td>
                    <td>{formatCompletedAt(entry.completedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="admin-cards">
          {loading ? (
            <article className="admin-entry-card">
              <p className="body-copy">Loading entries...</p>
            </article>
          ) : entries.length === 0 ? (
            <article className="admin-entry-card">
              <p className="body-copy">No entries found for the active event.</p>
            </article>
          ) : (
            entries.map((entry) => (
              <article className="admin-entry-card" key={`${entry.id}-card`}>
                <div className="space-y-1">
                  <h2 className="admin-entry-title">{entry.name}</h2>
                  <p className="body-copy">{entry.company}</p>
                  <p className="admin-entry-email">{entry.email}</p>
                </div>
                <dl className="admin-entry-metadata">
                  <div>
                    <dt>Selected</dt>
                    <dd>{entry.markedSquareIds.length}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{entry.completed ? "Completed" : "In Progress"}</dd>
                  </div>
                  <div>
                    <dt>Completed At</dt>
                    <dd>{formatCompletedAt(entry.completedAt)}</dd>
                  </div>
                </dl>
              </article>
            ))
          )}
        </section>
      </section>
    </main>
  );
}
