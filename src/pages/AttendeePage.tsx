import { useEffect, useMemo, useRef, useState } from "react";
import BingoBoard from "../components/BingoBoard";
import CompletionScreen from "../components/CompletionScreen";
import EntryForm from "../components/EntryForm";
import OnboardingScreen from "../components/OnboardingScreen";
import { useAppAuth } from "../features/auth/appAuth";
import { loadActiveEvent } from "../features/event/event.api";
import type { EventConfig, EventSquare } from "../features/event/event.types";
import {
  createOrLoadEntry,
  getEntryById,
  saveMarkedSquares,
  submitCompletedEntry,
} from "../features/entry/entry.api";
import type {
  EntryFormValues,
  EntryRecord,
  EntrySaveResult,
} from "../features/entry/entry.types";
import { launchCompletionConfetti } from "../lib/celebration";

type AppView = "entry" | "onboarding" | "board" | "completed";

const SESSION_STORAGE_KEY = "capma-bingo-session";

function getOnboardingStorageKey(eventId: string) {
  return `capma-bingo-onboarding-seen:${eventId}`;
}

function readStoredSession() {
  const rawValue = window.localStorage.getItem(SESSION_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as {
      eventId?: string;
      entryId?: string;
    };

    if (!parsedValue.eventId || !parsedValue.entryId) {
      return null;
    }

    return parsedValue;
  } catch {
    return null;
  }
}

function writeStoredSession(eventId: string, entryId: string) {
  window.localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ eventId, entryId }),
  );
}

function clearStoredSession() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function hasSeenOnboarding(eventId: string) {
  return window.localStorage.getItem(getOnboardingStorageKey(eventId)) === "true";
}

function markOnboardingSeen(eventId: string) {
  window.localStorage.setItem(getOnboardingStorageKey(eventId), "true");
}

function applyTheme(event: EventConfig | null) {
  const root = document.documentElement;
  const theme = event?.theme;
  const themeEntries = [
    ["--color-primary", theme?.primary],
    ["--color-secondary", theme?.secondary],
    ["--color-accent", theme?.accent],
    ["--color-background", theme?.background],
    ["--color-text", theme?.text],
  ] as const;

  themeEntries.forEach(([key, value]) => {
    if (value) {
      root.style.setProperty(key, value);
      return;
    }

    root.style.removeProperty(key);
  });
}

function getDisplayEventName(eventName: string) {
  return eventName.replace(/^CAPMA\s+/i, "").trim() || eventName;
}

export default function AttendeePage() {
  const { authReady, authError } = useAppAuth();
  const [view, setView] = useState<AppView>("entry");
  const [event, setEvent] = useState<EventConfig | null>(null);
  const [entry, setEntry] = useState<EntryRecord | null>(null);
  const [markedSquareIds, setMarkedSquareIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [entrySubmitting, setEntrySubmitting] = useState(false);
  const [boardSaving, setBoardSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completionCelebratedRef = useRef(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!authReady || initializedRef.current) {
      return;
    }

    if (authError) {
      setLoading(false);
      return;
    }

    initializedRef.current = true;
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setError(null);

      try {
        const activeEvent = await loadActiveEvent();
        const storedSession = readStoredSession();

        if (cancelled) {
          return;
        }

        setEvent(activeEvent);
        applyTheme(activeEvent);

        if (storedSession && storedSession.eventId === activeEvent.eventId) {
          try {
            if (storedSession?.entryId) {
              const storedEntry = await getEntryById(
                activeEvent.eventId,
                storedSession.entryId,
              );

              if (!cancelled && storedEntry?.eventId === activeEvent.eventId) {
                setEntry(storedEntry);
                setMarkedSquareIds(storedEntry.markedSquareIds);
                completionCelebratedRef.current = storedEntry.completed;
                setView(storedEntry.completed ? "completed" : "board");
                return;
              }
            }

            clearStoredSession();
          } catch {
            clearStoredSession();
          }
        } else if (storedSession && storedSession.eventId !== activeEvent.eventId) {
          clearStoredSession();
        }

        setView("entry");
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load the active CAPMA event.",
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
  }, [authError, authReady]);

  const orderedSquares = useMemo(() => {
    return [...(event?.squares ?? [])].sort((a, b) => a.order - b.order);
  }, [event?.squares]);

  const totalSquares = orderedSquares.length;
  const isLocked = Boolean(entry?.completed);
  const isReadyToSubmit =
    !isLocked && totalSquares > 0 && markedSquareIds.length === totalSquares;

  async function handleEntrySubmit(values: EntryFormValues) {
    if (!event || !authReady) {
      return;
    }

    setEntrySubmitting(true);
    setError(null);

    try {
      const loadedEntry = await createOrLoadEntry(event.eventId, values);
      setEntry(loadedEntry);
      setMarkedSquareIds(loadedEntry.markedSquareIds);
      completionCelebratedRef.current = loadedEntry.completed;
      writeStoredSession(event.eventId, loadedEntry.id);
      setView(
        loadedEntry.completed
          ? "completed"
          : hasSeenOnboarding(event.eventId)
            ? "board"
            : "onboarding",
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We could not save your bingo entry right now.",
      );
    } finally {
      setEntrySubmitting(false);
    }
  }

  function handleOnboardingContinue() {
    if (!event) {
      return;
    }

    markOnboardingSeen(event.eventId);
    setView(entry?.completed ? "completed" : "board");
  }

  async function handleSquareToggle(square: EventSquare) {
    if (!event || !entry || !authReady || isLocked || boardSaving) {
      return;
    }

    const nextMarkedSquareIds = markedSquareIds.includes(square.id)
      ? markedSquareIds.filter((squareId) => squareId !== square.id)
      : [...markedSquareIds, square.id];

    const orderedMarkedSquareIds = orderedSquares
      .map((item) => item.id)
      .filter((squareId) => nextMarkedSquareIds.includes(squareId));

    setMarkedSquareIds(orderedMarkedSquareIds);
    setBoardSaving(true);
    setError(null);

    try {
      const saveResult: EntrySaveResult = await saveMarkedSquares(
        event.eventId,
        entry.id,
        orderedMarkedSquareIds,
      );

      const nextEntry: EntryRecord = {
        ...entry,
        selectedSquares: orderedMarkedSquareIds,
        markedSquareIds: orderedMarkedSquareIds,
        completed: saveResult.completed,
        completedAt: saveResult.completedAt ?? entry.completedAt,
        prizeEntryEligible: saveResult.prizeEntryEligible,
      };

      setEntry(nextEntry);
    } catch (saveError) {
      setMarkedSquareIds(entry.markedSquareIds);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "We could not update your bingo board.",
      );
    } finally {
      setBoardSaving(false);
    }
  }

  async function handleSubmitCompletedBoard() {
    if (!entry || !event || !authReady || isLocked || boardSaving || !isReadyToSubmit) {
      return;
    }

    setBoardSaving(true);
    setError(null);

    try {
      const saveResult = await submitCompletedEntry(
        event.eventId,
        entry.id,
        markedSquareIds,
      );

      const nextEntry: EntryRecord = {
        ...entry,
        selectedSquares: markedSquareIds,
        markedSquareIds,
        completed: true,
        completedAt: saveResult.completedAt ?? entry.completedAt,
        prizeEntryEligible: true,
      };

      setEntry(nextEntry);

      if (!completionCelebratedRef.current) {
        completionCelebratedRef.current = true;
        launchCompletionConfetti();
      }

      setView("completed");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We could not enter your board into the drawing.",
      );
    } finally {
      setBoardSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="app-shell">
        <section className="surface-card">
          <p className="eyebrow">{authReady ? "Loading Event" : "Starting Secure Access"}</p>
          <h1 className="display-title">CAPMA Bingo</h1>
          <p className="body-copy">
            {authReady
              ? "Pulling the active event configuration now."
              : "Establishing anonymous access for public board use."}
          </p>
        </section>
      </main>
    );
  }

  if (authError) {
    return (
      <main className="app-shell">
        <section className="surface-card">
          <p className="eyebrow">Access Error</p>
          <h1 className="display-title">CAPMA Bingo</h1>
          <p className="body-copy">{authError}</p>
        </section>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="app-shell">
        <section className="surface-card">
          <p className="eyebrow">Event Unavailable</p>
          <h1 className="display-title">CAPMA Bingo</h1>
          <p className="body-copy">
            {error ?? "No active CAPMA event is available right now."}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="surface-card">
        <header className="space-y-2 text-center">
          <p className="eyebrow">CAPMA Event Game</p>
          <h1 className="display-title display-title-single-line">
            {getDisplayEventName(event.name)}
          </h1>
          {error ? <p className="status-message">{error}</p> : null}
        </header>

        {view === "entry" ? (
          <EntryForm
            disabled={entrySubmitting || !event.submissionOpen}
            event={event}
            onSubmit={handleEntrySubmit}
            submitting={entrySubmitting}
          />
        ) : null}

        {view === "onboarding" ? (
          <OnboardingScreen
            event={event}
            onContinue={handleOnboardingContinue}
          />
        ) : null}

        {view === "board" ? (
          <BingoBoard
            boardSize={event.boardSize}
            eventName={event.name}
            isReadyToSubmit={isReadyToSubmit}
            isLocked={isLocked}
            isSaving={boardSaving}
            markedSquareIds={markedSquareIds}
            onSubmitCompletedBoard={handleSubmitCompletedBoard}
            onToggleSquare={handleSquareToggle}
            squares={orderedSquares}
          />
        ) : null}

        {view === "completed" ? (
          <CompletionScreen event={event} />
        ) : null}
      </section>
    </main>
  );
}
