import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadActiveEvent } from "../features/event/event.api";
import { getEntriesByEventId } from "../features/entry/entry.api";
import type { EntryRecord } from "../features/entry/entry.types";

type WinnerFilter = "completed" | "all";

function formatCompletedAt(value: Date | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatWinnerTimestamp(entry: EntryRecord) {
  const value = entry.completedAt ?? entry.createdAt;

  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function shuffleEntries(entries: EntryRecord[]) {
  const shuffledEntries = [...entries];

  for (let index = shuffledEntries.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const currentEntry = shuffledEntries[index];
    shuffledEntries[index] = shuffledEntries[swapIndex];
    shuffledEntries[swapIndex] = currentEntry;
  }

  return shuffledEntries;
}

export default function AdminPage() {
  const [eventName, setEventName] = useState("");
  const [entries, setEntries] = useState<EntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [winnerFilter, setWinnerFilter] = useState<WinnerFilter>("completed");
  const [winnerCount, setWinnerCount] = useState("1");
  const [winnerError, setWinnerError] = useState<string | null>(null);
  const [winnerResults, setWinnerResults] = useState<EntryRecord[]>([]);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

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

  const eligiblePool = useMemo(() => {
    if (winnerFilter === "all") {
      return entries;
    }

    return entries.filter((entry) => entry.completed);
  }, [entries, winnerFilter]);

  function handleDrawWinners() {
    const requestedCount = Number.parseInt(winnerCount, 10);

    setWinnerError(null);
    setCopyMessage(null);

    if (eligiblePool.length === 0) {
      setWinnerResults([]);
      setWinnerError("No eligible entries are available for this drawing.");
      return;
    }

    if (!Number.isFinite(requestedCount) || requestedCount < 1) {
      setWinnerResults([]);
      setWinnerError("Enter a valid number of winners to draw.");
      return;
    }

    if (requestedCount > eligiblePool.length) {
      setWinnerResults([]);
      setWinnerError("Requested winners exceed the number of eligible entries.");
      return;
    }

    const winners = shuffleEntries(eligiblePool).slice(0, requestedCount);
    setWinnerResults(winners);
  }

  async function handleCopyWinners() {
    if (winnerResults.length === 0) {
      return;
    }

    const text = winnerResults
      .map((winner, index) =>
        `${index + 1}. ${winner.name}${winner.company ? ` - ${winner.company}` : ""}${formatWinnerTimestamp(winner) !== "-" ? ` - ${formatWinnerTimestamp(winner)}` : ""}`,
      )
      .join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage("Winners copied.");
    } catch {
      setCopyMessage("Unable to copy winners on this device.");
    }
  }

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

        <section className="admin-drawing-card">
          <div className="space-y-2">
            <p className="eyebrow">Prize Drawing</p>
            <h2 className="section-title">Random Winner Selection</h2>
            <p className="body-copy">
              Draw from all entries or only completed entries. Winners are selected
              randomly from the current admin dataset.
            </p>
          </div>

          <div className="admin-drawing-controls">
            <label className="field-group">
              <span className="field-label">Eligible Pool</span>
              <select
                className="field-input"
                onChange={(event) => setWinnerFilter(event.target.value as WinnerFilter)}
                value={winnerFilter}
              >
                <option value="completed">Completed entries only</option>
                <option value="all">All entries</option>
              </select>
            </label>

            <label className="field-group">
              <span className="field-label">Number of Winners</span>
              <input
                className="field-input"
                min="1"
                onChange={(event) => setWinnerCount(event.target.value)}
                type="number"
                value={winnerCount}
              />
            </label>

            <button
              className="button-primary admin-drawing-button"
              onClick={handleDrawWinners}
              type="button"
            >
              Draw Winners
            </button>
          </div>

          <p className="status-note">
            Eligible entries in this pool: {eligiblePool.length}
          </p>

          {winnerError ? <p className="status-message">{winnerError}</p> : null}
          {copyMessage ? <p className="status-note">{copyMessage}</p> : null}

          {winnerResults.length > 0 ? (
            <div className="admin-winners-wrap">
              <div className="admin-winners-header">
                <h3 className="admin-entry-title">Winner Results</h3>
                <button
                  className="admin-link-button"
                  onClick={() => void handleCopyWinners()}
                  type="button"
                >
                  Copy Winners
                </button>
              </div>

              <div className="admin-winners-list">
                {winnerResults.map((winner, index) => (
                  <article className="admin-winner-card" key={`${winner.id}-winner`}>
                    <p className="eyebrow">Winner {index + 1}</p>
                    <h4 className="admin-entry-title">{winner.name}</h4>
                    <p className="body-copy">{winner.company || "No company provided"}</p>
                    <p className="admin-entry-email">{winner.email}</p>
                    <p className="status-note">
                      Timestamp: {formatWinnerTimestamp(winner)}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
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
