import { useEffect, useState } from "react";
import SponsorBoard from "../components/SponsorBoard";
import { loadActiveEvent } from "../features/event/event.api";
import type { EventConfig } from "../features/event/event.types";

const capmaLogoSrc = "/capma-logo.png";

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

export default function SponsorsPage() {
  const [event, setEvent] = useState<EventConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setError(null);

      try {
        const activeEvent = await loadActiveEvent();

        if (cancelled) {
          return;
        }

        setEvent(activeEvent);
        applyTheme(activeEvent);
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
  }, []);

  useEffect(() => {
    document.title = event?.name ? `CAPMA Bingo | Sponsors | ${event.name}` : "CAPMA Bingo | Sponsors";
  }, [event?.name]);

  if (loading) {
    return (
      <main className="app-shell">
        <section className="surface-card">
          <p className="eyebrow">Loading Sponsor Board</p>
          <h1 className="display-title">CAPMA Bingo Sponsors</h1>
          <p className="body-copy">Pulling the active sponsor availability board now.</p>
        </section>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="app-shell">
        <section className="surface-card">
          <p className="eyebrow">Sponsor Board Unavailable</p>
          <h1 className="display-title">CAPMA Bingo Sponsors</h1>
          <p className="body-copy">{error ?? "No active CAPMA event is available right now."}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="surface-card">
        <header className="attendee-brand-header sponsor-page-header">
          <div className="attendee-brand-lockup">
            <img
              alt="CAPMA"
              className="attendee-brand-logo"
              height="337"
              src={capmaLogoSrc}
              width="461"
            />
            <div className="sponsor-page-title-wrap">
              <p className="attendee-brand-event">{getDisplayEventName(event.name)}</p>
              <p className="status-note sponsor-page-mode">Sponsor-facing board</p>
            </div>
          </div>
        </header>

        {error ? <p className="attendee-brand-status status-message">{error}</p> : null}

        <SponsorBoard eventName={event.name} squares={event.squares} />
      </section>
    </main>
  );
}
