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
  getEntryByEmail,
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
const capmaLogoSrc = "/capma-logo.png";

function getOnboardingStorageKey(eventId: string, email: string) {
  return `capma-bingo-onboarding-seen:${eventId}:${email.trim().toLowerCase()}`;
}

function getEntryEmailStorageKey(eventId: string) {
  return `capma-bingo-entry-email:${eventId}`;
}

function hasSeenOnboarding(eventId: string, email: string) {
  return window.localStorage.getItem(getOnboardingStorageKey(eventId, email)) === "true";
}

function markOnboardingSeen(eventId: string, email: string) {
  window.localStorage.setItem(getOnboardingStorageKey(eventId, email), "true");
}

function getStoredEntryEmail(eventId: string) {
  return window.localStorage.getItem(getEntryEmailStorageKey(eventId)) ?? "";
}

function storeEntryEmail(eventId: string, email: string) {
  window.localStorage.setItem(getEntryEmailStorageKey(eventId), email.trim().toLowerCase());
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
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
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
      setRestoreMessage(null);

      try {
        const activeEvent = await loadActiveEvent();

        if (cancelled) {
          return;
        }

        setEvent(activeEvent);
        applyTheme(activeEvent);

        const storedEntryEmail = getStoredEntryEmail(activeEvent.eventId);

        if (storedEntryEmail) {
          try {
            const storedEntry = await getEntryByEmail(activeEvent.eventId, storedEntryEmail);

            if (!cancelled && storedEntry?.eventId === activeEvent.eventId) {
              setEntry(storedEntry);
              setMarkedSquareIds(storedEntry.markedSquareIds);
              setRestoreMessage(
                storedEntry.completed
                  ? "Welcome back. Your completed board is ready and your entry is already in."
                  : "Welcome back. We found your board and saved your progress.",
              );
              completionCelebratedRef.current = storedEntry.completed;
              setView(storedEntry.completed ? "completed" : "board");
              return;
            }
          } catch (entryLoadError) {
            console.error("[board] load failure", entryLoadError);
            if (!cancelled) {
              setError(
                entryLoadError instanceof Error
                  ? entryLoadError.message
                  : "We could not load your board.",
              );
            }
            return;
          }
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

  useEffect(() => {
    document.title = event?.name ? `CAPMA Bingo | ${event.name}` : "CAPMA Bingo";
  }, [event?.name]);

  async function handleEntrySubmit(values: EntryFormValues) {
    if (!event || !authReady) {
      return;
    }

    setEntrySubmitting(true);
    setError(null);
    setRestoreMessage(null);

    try {
      const loadedEntry = await createOrLoadEntry(event.eventId, values);
      storeEntryEmail(event.eventId, loadedEntry.emailKey);
      setEntry(loadedEntry);
      setMarkedSquareIds(loadedEntry.markedSquareIds);
      completionCelebratedRef.current = loadedEntry.completed;
      setView(
        loadedEntry.completed
          ? "completed"
          : hasSeenOnboarding(event.eventId, loadedEntry.emailKey)
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

    if (!entry) {
      return;
    }

    markOnboardingSeen(event.eventId, entry.emailKey);
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
    if (
      !entry ||
      !event ||
      !authReady ||
      isLocked ||
      boardSaving ||
      !isReadyToSubmit
    ) {
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
        <header className="attendee-brand-header">
          <div className="attendee-brand-lockup">
            <img
              alt="CAPMA"
              className="attendee-brand-logo"
              height="337"
              src={capmaLogoSrc}
              width="461"
            />
            <p className="attendee-brand-event">{getDisplayEventName(event.name)}</p>
          </div>
        </header>

        {error ? <p className="attendee-brand-status status-message">{error}</p> : null}

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
            restoreMessage={restoreMessage}
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
