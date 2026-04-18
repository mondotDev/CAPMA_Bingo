import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  loadActiveEventForAdmin,
  updateActiveEventSquares,
} from "../features/event/event.api";
import { useAdminAuth } from "../features/admin/adminAuth";
import type { EventSquare } from "../features/event/event.types";
import {
  deleteEntryById,
  getEntriesByEventId,
  lockWinners,
  updateEntryByAdmin,
} from "../features/entry/entry.api";
import type {
  AdminEntryUpdateValues,
  EntryRecord,
} from "../features/entry/entry.types";

type WinnerFilter = "completed" | "all";
type AdminSectionKey =
  | "boardSetup"
  | "prizeDrawing"
  | "entries"
  | "editEntry";

type AdminSectionProps = {
  children: ReactNode;
  className: string;
  description?: string;
  eyebrow: string;
  isCollapsed: boolean;
  onToggle: () => void;
  title: string;
};

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

function normalizeSquareInput(value: string) {
  return value.toUpperCase();
}

function getSquareSignature(square: EventSquare) {
  return [
    square.labelLine1.trim(),
    square.labelLine2.trim(),
    square.labelLine3?.trim() ?? "",
  ].join("|");
}

function AdminSection({
  children,
  className,
  description,
  eyebrow,
  isCollapsed,
  onToggle,
  title,
}: AdminSectionProps) {
  return (
    <section className={className}>
      <div className="admin-section-header">
        <div className="space-y-2">
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="section-title">{title}</h2>
          {description ? <p className="body-copy">{description}</p> : null}
        </div>
        <button
          aria-expanded={!isCollapsed}
          className="admin-section-toggle"
          onClick={onToggle}
          type="button"
        >
          {isCollapsed ? "+" : "-"}
        </button>
      </div>

      {!isCollapsed ? children : null}
    </section>
  );
}

export default function AdminPage() {
  const { user } = useAdminAuth();
  const [eventId, setEventId] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventSquares, setEventSquares] = useState<EventSquare[]>([]);
  const [entries, setEntries] = useState<EntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [winnerFilter, setWinnerFilter] = useState<WinnerFilter>("completed");
  const [winnerCount, setWinnerCount] = useState("1");
  const [winnerError, setWinnerError] = useState<string | null>(null);
  const [winnerResults, setWinnerResults] = useState<EntryRecord[]>([]);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [lockingWinners, setLockingWinners] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<AdminEntryUpdateValues>({
    name: "",
    company: "",
    email: "",
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [squareError, setSquareError] = useState<string | null>(null);
  const [savingSquares, setSavingSquares] = useState(false);
  const [savedSquareSignatures, setSavedSquareSignatures] = useState<string[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Record<AdminSectionKey, boolean>>({
    boardSetup: true,
    prizeDrawing: true,
    entries: true,
    editEntry: true,
  });

  useEffect(() => {
    document.title = eventName ? `CAPMA Bingo | Admin | ${eventName}` : "CAPMA Bingo | Admin";
  }, [eventName]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setError(null);

      try {
        const activeEvent = await loadActiveEventForAdmin();
        const activeEntries = await getEntriesByEventId(activeEvent.eventId);

        if (cancelled) {
          return;
        }

        setEventId(activeEvent.eventId);
        setEventName(activeEvent.name);
        setEventSquares(activeEvent.squares);
        setSavedSquareSignatures(activeEvent.squares.map(getSquareSignature));
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
    const unlockedEntries = entries.filter((entry) => !entry.winnerLocked);

    if (winnerFilter === "all") {
      return unlockedEntries;
    }

    return unlockedEntries.filter((entry) => entry.completed);
  }, [entries, winnerFilter]);

  const editableEntry = useMemo(() => {
    return entries.find((entry) => entry.id === editingEntryId) ?? null;
  }, [editingEntryId, entries]);

  const drawnUnlockedWinners = useMemo(() => {
    return winnerResults.filter((winner) => !winner.winnerLocked);
  }, [winnerResults]);

  const squareGuidance = useMemo(() => {
    const duplicateIndexes = new Map<string, number[]>();
    const longLineIndexes: number[] = [];
    const longDetailIndexes: number[] = [];

    eventSquares.forEach((square, index) => {
      const signature = getSquareSignature(square);
      const hasRequiredLines = square.labelLine1.trim() && square.labelLine2.trim();

      if (hasRequiredLines) {
        const existingIndexes = duplicateIndexes.get(signature) ?? [];
        existingIndexes.push(index + 1);
        duplicateIndexes.set(signature, existingIndexes);
      }

      if (square.labelLine1.trim().length > 18 || square.labelLine2.trim().length > 18) {
        longLineIndexes.push(index + 1);
      }

      if ((square.labelLine3?.trim().length ?? 0) > 52) {
        longDetailIndexes.push(index + 1);
      }
    });

    const duplicateGroups = Array.from(duplicateIndexes.values()).filter((indexes) => indexes.length > 1);

    return {
      duplicateGroups,
      hasUnsavedChanges:
        eventSquares.length > 0
        && eventSquares.map(getSquareSignature).join("||") !== savedSquareSignatures.join("||"),
      longDetailIndexes,
      longLineIndexes,
    };
  }, [eventSquares, savedSquareSignatures]);

  function toggleSection(section: AdminSectionKey) {
    setCollapsedSections((currentSections) => ({
      ...currentSections,
      [section]: !currentSections[section],
    }));
  }

  function handleSquareValueChange(
    index: number,
    field: "labelLine1" | "labelLine2" | "labelLine3",
    value: string,
  ) {
    const normalizedValue = normalizeSquareInput(value);

    setEventSquares((currentSquares) =>
      currentSquares.map((square, squareIndex) =>
        squareIndex === index
          ? {
              ...square,
              [field]: normalizedValue,
            }
          : square,
      ),
    );
    setSquareError(null);
    setActionMessage(null);
  }

  async function handleSaveSquares() {
    if (!eventId) {
      setSquareError("No active event is available to save.");
      return;
    }

    setSavingSquares(true);
    setSquareError(null);
    setActionMessage(null);

    try {
      await updateActiveEventSquares(eventId, eventSquares);
      setEventSquares((currentSquares) => {
        const nextSquares = currentSquares.map((square, index) => ({
          ...square,
          id: square.id.trim() || `square-${String(index + 1).padStart(2, "0")}`,
          labelLine1: square.labelLine1.trim(),
          labelLine2: square.labelLine2.trim(),
          labelLine3: square.labelLine3?.trim() ?? "",
          order: index + 1,
        }));

        setSavedSquareSignatures(nextSquares.map(getSquareSignature));
        return nextSquares;
      });
      setActionMessage("Board tiles updated.");
    } catch (saveError) {
      setSquareError(
        saveError instanceof Error
          ? saveError.message
          : "We could not save the active event tiles.",
      );
    } finally {
      setSavingSquares(false);
    }
  }

  function handleDrawWinners() {
    const requestedCount = Number.parseInt(winnerCount, 10);

    setWinnerError(null);
    setCopyMessage(null);
    setActionMessage(null);

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

  async function handleLockWinners() {
    const adminEmail = user?.email?.trim().toLowerCase();

    if (!adminEmail || drawnUnlockedWinners.length === 0) {
      return;
    }

    setLockingWinners(true);
    setWinnerError(null);
    setActionMessage(null);

    try {
      await lockWinners(
        winnerResults[0]?.eventId ?? "",
        drawnUnlockedWinners.map((winner) => winner.id),
        adminEmail,
      );

      const lockedAt = new Date();
      const nextWinnerResults = winnerResults.map((winner) =>
        drawnUnlockedWinners.some((drawnWinner) => drawnWinner.id === winner.id)
          ? {
              ...winner,
              winnerLocked: true,
              winnerLockedAt: lockedAt,
              winnerLockedBy: adminEmail,
            }
          : winner,
      );

      setWinnerResults(nextWinnerResults);
      setEntries((currentEntries) =>
        currentEntries.map((entry) =>
          drawnUnlockedWinners.some((winner) => winner.id === entry.id)
            ? {
                ...entry,
                winnerLocked: true,
                winnerLockedAt: lockedAt,
                winnerLockedBy: adminEmail,
              }
            : entry,
        ),
      );
      setActionMessage("Winners locked and excluded from future drawings.");
    } catch (lockError) {
      setWinnerError(
        lockError instanceof Error
          ? lockError.message
          : "We could not lock the selected winners.",
      );
    } finally {
      setLockingWinners(false);
    }
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

  function handleStartEdit(entry: EntryRecord) {
    setEditingEntryId(entry.id);
    setEditValues({
      name: entry.name,
      company: entry.company,
      email: entry.email,
    });
    setEditError(null);
    setActionMessage(null);
  }

  function handleCancelEdit() {
    setEditingEntryId(null);
    setEditError(null);
  }

  async function handleSaveEdit() {
    if (!editableEntry) {
      return;
    }

    setSavingEdit(true);
    setEditError(null);
    setActionMessage(null);

    try {
      const updatedEntry = await updateEntryByAdmin(editableEntry, editValues);

      setEntries((currentEntries) =>
        currentEntries
          .filter((entry) => entry.id !== editableEntry.id)
          .concat(updatedEntry)
          .sort((firstEntry, secondEntry) => {
            if (firstEntry.winnerLocked !== secondEntry.winnerLocked) {
              return firstEntry.winnerLocked ? 1 : -1;
            }

            if (firstEntry.completed !== secondEntry.completed) {
              return firstEntry.completed ? -1 : 1;
            }

            return firstEntry.name.localeCompare(secondEntry.name);
          }),
      );
      setWinnerResults((currentWinners) =>
        currentWinners.map((winner) =>
          winner.id === editableEntry.id || winner.id === updatedEntry.id
            ? updatedEntry
            : winner,
        ),
      );
      setEditingEntryId(null);
      setActionMessage("Entry updated.");
    } catch (saveError) {
      setEditError(
        saveError instanceof Error
          ? saveError.message
          : "We could not save that entry.",
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteEntry(entry: EntryRecord) {
    const confirmed = window.confirm(
      `Delete entry for ${entry.name || entry.email}? This cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingEntryId(entry.id);
    setActionMessage(null);
    setError(null);

    try {
      await deleteEntryById(entry.eventId, entry.id);
      setEntries((currentEntries) =>
        currentEntries.filter((currentEntry) => currentEntry.id !== entry.id),
      );
      setWinnerResults((currentWinners) =>
        currentWinners.filter((winner) => winner.id !== entry.id),
      );
      setActionMessage("Entry deleted.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "We could not delete that entry.",
      );
    } finally {
      setDeletingEntryId(null);
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
        {actionMessage ? <p className="status-note">{actionMessage}</p> : null}

        <section className="admin-drawing-card">
          <div className="space-y-2">
            <p className="eyebrow">Overview</p>
            <h2 className="section-title">Entry Summary</h2>
            <p className="body-copy">Quick counts for the current active event.</p>
          </div>
          <div className="admin-summary-grid">
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
          </div>
        </section>

        <AdminSection
          className="admin-drawing-card"
          description="Edit the attendee board as a fixed 4x4 grid. Line 1 and line 2 appear on the front of the square, and line 3 shows on the back of the flip card."
          eyebrow="Board Setup"
          isCollapsed={collapsedSections.boardSetup}
          onToggle={() => toggleSection("boardSetup")}
          title="Active Event Tiles"
        >
          <div className="admin-board-guidance">
            <p className="status-note">
              Line 3 is the detail copy attendees see after the square zooms and flips open.
            </p>
            {squareGuidance.hasUnsavedChanges ? (
              <p className="status-note admin-board-guidance-warning">
                You have unsaved board edits.
              </p>
            ) : (
              <p className="status-note admin-board-guidance-success">
                Tile content is in sync with the latest save.
              </p>
            )}
            {squareGuidance.duplicateGroups.length > 0 ? (
              <p className="status-message">
                Duplicate tile copy detected in tiles {squareGuidance.duplicateGroups
                  .map((indexes) => indexes.join(", "))
                  .join(" and ")}.
              </p>
            ) : null}
            {squareGuidance.longLineIndexes.length > 0 ? (
              <p className="status-note">
                Front-of-card copy may wrap tightly in tiles {squareGuidance.longLineIndexes.join(", ")}.
              </p>
            ) : null}
            {squareGuidance.longDetailIndexes.length > 0 ? (
              <p className="status-note">
                Back-of-card detail is getting long in tiles {squareGuidance.longDetailIndexes.join(", ")}.
              </p>
            ) : null}
          </div>

          <div className="admin-square-grid">
            {eventSquares.map((square, index) => (
              <article className="admin-square-card" key={square.id || `square-${index + 1}`}>
                <div className="admin-square-card-header">
                  <p className="eyebrow">Tile {index + 1}</p>
                  <span className="admin-square-index">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="admin-square-preview">
                  <div className="admin-square-preview-label">
                    <span className="admin-square-preview-line">
                      {square.labelLine1.trim() || "Line 1"}
                    </span>
                    <span className="admin-square-preview-line">
                      {square.labelLine2.trim() || "Line 2"}
                    </span>
                    {square.labelLine3?.trim() ? (
                      <span className="admin-square-preview-line admin-square-preview-line-optional">
                        {square.labelLine3.trim()}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="admin-square-fields">
                  <label className="field-group">
                    <span className="field-label">1</span>
                    <input
                      className="field-input admin-square-input"
                      maxLength={40}
                      onChange={(event) =>
                        handleSquareValueChange(index, "labelLine1", event.target.value)
                      }
                      placeholder="Top line"
                      type="text"
                      value={square.labelLine1}
                    />
                  </label>

                  <label className="field-group">
                    <span className="field-label">2</span>
                    <input
                      className="field-input admin-square-input"
                      maxLength={40}
                      onChange={(event) =>
                        handleSquareValueChange(index, "labelLine2", event.target.value)
                      }
                      placeholder="Second line"
                      type="text"
                      value={square.labelLine2}
                    />
                  </label>

                  <label className="field-group">
                    <span className="field-label">3</span>
                    <textarea
                      className="field-input admin-square-input admin-square-textarea"
                      maxLength={60}
                      onChange={(event) =>
                        handleSquareValueChange(index, "labelLine3", event.target.value)
                      }
                      placeholder="Optional"
                      rows={2}
                      value={square.labelLine3 ?? ""}
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>

          {squareError ? <p className="status-message">{squareError}</p> : null}

          <div className="admin-edit-actions">
            <button
              className="button-primary admin-drawing-button"
              disabled={savingSquares || loading}
              onClick={() => void handleSaveSquares()}
              type="button"
            >
              {savingSquares ? "Saving Tiles..." : "Save Tiles"}
            </button>
          </div>
        </AdminSection>

        <AdminSection
          className="admin-drawing-card"
          description="Draw from all entries or only completed entries. Winners are selected randomly from the current admin dataset. Locked winners are excluded."
          eyebrow="Prize Drawing"
          isCollapsed={collapsedSections.prizeDrawing}
          onToggle={() => toggleSection("prizeDrawing")}
          title="Random Winner Selection"
        >
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
                <div className="admin-winner-actions">
                  <button
                    className="admin-link-button"
                    onClick={() => void handleCopyWinners()}
                    type="button"
                  >
                    Copy Winners
                  </button>
                  <button
                    className="admin-link-button"
                    disabled={lockingWinners || drawnUnlockedWinners.length === 0}
                    onClick={() => void handleLockWinners()}
                    type="button"
                  >
                    {lockingWinners ? "Locking..." : "Lock Winners"}
                  </button>
                </div>
              </div>

              <div className="admin-winners-list">
                {winnerResults.map((winner, index) => (
                  <article className="admin-winner-card" key={`${winner.id}-winner`}>
                    <p className="eyebrow">Winner {index + 1}</p>
                    <h4 className="admin-entry-title">{winner.name}</h4>
                    <p className="body-copy">{winner.company || "No company provided"}</p>
                    <p className="admin-entry-email">{winner.email}</p>
                    <p className="status-note">
                      {winner.winnerLocked
                        ? `Locked${winner.winnerLockedBy ? ` by ${winner.winnerLockedBy}` : ""}`
                        : "Not locked"}
                    </p>
                    <p className="status-note">
                      Timestamp: {formatWinnerTimestamp(winner)}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </AdminSection>

        <AdminSection
          className="admin-drawing-card"
          description="Review, edit, and delete event entries across desktop and mobile layouts."
          eyebrow="Entries"
          isCollapsed={collapsedSections.entries}
          onToggle={() => toggleSection("entries")}
          title="Entry Management"
        >
          <section className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Email</th>
                  <th>Selected</th>
                  <th>Status</th>
                  <th>Winner Lock</th>
                  <th>Completed At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="admin-empty-cell" colSpan={8}>
                      Loading entries...
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td className="admin-empty-cell" colSpan={8}>
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
                      <td>
                        <span
                          className={
                            entry.winnerLocked
                              ? "admin-status admin-status-locked"
                              : "admin-status"
                          }
                        >
                          {entry.winnerLocked ? "Locked" : "Open"}
                        </span>
                      </td>
                      <td>{formatCompletedAt(entry.completedAt)}</td>
                      <td>
                        <div className="admin-row-actions">
                          <button
                            className="admin-link-button"
                            onClick={() => handleStartEdit(entry)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="admin-link-button admin-link-button-danger"
                            disabled={deletingEntryId === entry.id}
                            onClick={() => void handleDeleteEntry(entry)}
                            type="button"
                          >
                            {deletingEntryId === entry.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
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
                      <dt>Winner Lock</dt>
                      <dd>
                        {entry.winnerLocked
                          ? `Locked${entry.winnerLockedBy ? ` by ${entry.winnerLockedBy}` : ""}`
                          : "Open"}
                      </dd>
                    </div>
                    <div>
                      <dt>Completed At</dt>
                      <dd>{formatCompletedAt(entry.completedAt)}</dd>
                    </div>
                  </dl>
                  <div className="admin-card-actions">
                    <button
                      className="admin-link-button"
                      onClick={() => handleStartEdit(entry)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="admin-link-button admin-link-button-danger"
                      disabled={deletingEntryId === entry.id}
                      onClick={() => void handleDeleteEntry(entry)}
                      type="button"
                    >
                      {deletingEntryId === entry.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </article>
              ))
            )}
          </section>
        </AdminSection>

        {editableEntry ? (
          <AdminSection
            className="admin-edit-card"
            description="Update the participant details for this event entry."
            eyebrow="Edit Entry"
            isCollapsed={collapsedSections.editEntry}
            onToggle={() => toggleSection("editEntry")}
            title="Update Participant"
          >
            <div className="admin-edit-grid">
              <label className="field-group">
                <span className="field-label">Name</span>
                <input
                  className="field-input"
                  onChange={(event) =>
                    setEditValues((currentValues) => ({
                      ...currentValues,
                      name: event.target.value,
                    }))
                  }
                  type="text"
                  value={editValues.name}
                />
              </label>

              <label className="field-group">
                <span className="field-label">Company</span>
                <input
                  className="field-input"
                  onChange={(event) =>
                    setEditValues((currentValues) => ({
                      ...currentValues,
                      company: event.target.value,
                    }))
                  }
                  type="text"
                  value={editValues.company}
                />
              </label>

              <label className="field-group">
                <span className="field-label">Email</span>
                <input
                  className="field-input"
                  onChange={(event) =>
                    setEditValues((currentValues) => ({
                      ...currentValues,
                      email: event.target.value,
                    }))
                  }
                  type="email"
                  value={editValues.email}
                />
              </label>
            </div>

            {editError ? <p className="status-message">{editError}</p> : null}

            <div className="admin-edit-actions">
              <button
                className="button-primary admin-drawing-button"
                disabled={savingEdit}
                onClick={() => void handleSaveEdit()}
                type="button"
              >
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
              <button
                className="admin-link-button"
                disabled={savingEdit}
                onClick={handleCancelEdit}
                type="button"
              >
                Cancel
              </button>
            </div>
          </AdminSection>
        ) : null}
      </section>
    </main>
  );
}
