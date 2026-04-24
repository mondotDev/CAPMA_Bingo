import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import type { EventSquare } from "../features/event/event.types";

type SponsorBoardProps = {
  eventName: string;
  squares: EventSquare[];
};

function buildSponsorMailto(eventName: string, square: EventSquare) {
  const subject = encodeURIComponent(`CAPMA Sponsor Inquiry: Tile ${square.order} - ${square.label}`);
  const body = encodeURIComponent(
    [
      "Hello CAPMA,",
      "",
      "I would like to ask about sponsor availability for:",
      `Event: ${eventName}`,
      `Tile: ${square.order}`,
      `Title: ${square.label}`,
      "",
      "Please send me next steps.",
    ].join("\n"),
  );

  return `mailto:info@capma.org?subject=${subject}&body=${body}`;
}

function getSponsorStatus(square: EventSquare) {
  return square.sponsorStatus ?? (square.tileType === "booth" ? "available" : "unavailable");
}

function getSponsorPopupTitle(square: EventSquare) {
  const sponsorStatus = getSponsorStatus(square);

  if (sponsorStatus === "claimed") {
    return square.sponsorClaimedBy?.trim() || square.label;
  }

  if (sponsorStatus === "unavailable") {
    return "Spot Unavailable";
  }

  if (sponsorStatus === "held") {
    return "Spot Held";
  }

  return "Sponsor This Spot";
}

function getTileLines(square: EventSquare) {
  if (square.tileType === "booth" || square.boardLine1?.trim().toUpperCase() === "BOOTH") {
    const boothNumber = square.boardLine2?.trim() || square.shortLabel?.trim() || square.label.trim();

    return {
      isBooth: true,
      line1: "BOOTH",
      line2: boothNumber || "\u00A0",
    };
  }

  if (square.boardLine1?.trim() || square.boardLine2?.trim()) {
    return {
      isBooth: false,
      line1: square.boardLine1?.trim() || "\u00A0",
      line2: square.boardLine2?.trim() || "\u00A0",
    };
  }

  return {
    isBooth: false,
    line1: square.shortLabel?.trim() || square.label,
    line2: "",
  };
}

export default function SponsorBoard({ eventName, squares }: SponsorBoardProps) {
  const detailTitleId = useId();
  const [expandedSquare, setExpandedSquare] = useState<EventSquare | null>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const sponsorCounts = useMemo(() => {
    return squares.reduce(
      (counts, square) => {
        const status = getSponsorStatus(square);
        counts[status] += 1;
        return counts;
      },
      { available: 0, claimed: 0, held: 0, unavailable: 0 },
    );
  }, [squares]);

  useEffect(() => {
    if (!expandedSquare) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        requestCloseExpandedSquare();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 30);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [expandedSquare]);

  function requestCloseExpandedSquare() {
    setExpandedSquare(null);
    lastTriggerRef.current?.focus();
  }

  function handleSquareClick(square: EventSquare, event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    lastTriggerRef.current = event.currentTarget;
    setExpandedSquare(square);
  }

  return (
    <div className="board-layout sponsor-board-layout">
      <div className="board-header sponsor-board-header">
        <h2 className="section-title">Sponsor Availability</h2>
        <p className="board-subtitle">
          Review Best Pest Expo 2026 sponsor placements, tap any tile for details, and email CAPMA to request open spots.
        </p>
        <div className="sponsor-board-summary">
          <span className="sponsor-board-summary-chip sponsor-board-summary-chip-available">
            {sponsorCounts.available} available
          </span>
          <span className="sponsor-board-summary-chip sponsor-board-summary-chip-claimed">
            {sponsorCounts.claimed} claimed
          </span>
          <span className="sponsor-board-summary-chip sponsor-board-summary-chip-held">
            {sponsorCounts.held} held
          </span>
          <span className="sponsor-board-summary-chip sponsor-board-summary-chip-unavailable">
            {sponsorCounts.unavailable} unavailable
          </span>
        </div>
      </div>

      <div className="board-grid" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        {squares.map((square, index) => {
          const status = getSponsorStatus(square);
          const lines = getTileLines(square);

          return (
            <button
              aria-label={`${square.label}. Sponsor status: ${status}. Open details.`}
              className={[
                "board-square",
                "sponsor-board-square",
                `sponsor-board-square-${status}`,
              ].join(" ")}
              key={square.id}
              onClick={(event) => handleSquareClick(square, event)}
              type="button"
            >
              <span className="board-square-topline">
                <span className="board-square-number">{index + 1}</span>
                {status === "claimed" ? (
                  <span aria-hidden="true" className="sponsor-board-corner-indicator sponsor-board-corner-indicator-claimed">
                    ✓
                  </span>
                ) : null}
                {status === "held" ? (
                  <span aria-hidden="true" className="sponsor-board-corner-indicator sponsor-board-corner-indicator-held">
                    •
                  </span>
                ) : null}
                {status === "unavailable" ? (
                  <span aria-hidden="true" className="sponsor-board-corner-indicator sponsor-board-corner-indicator-unavailable">
                    🔒
                  </span>
                ) : null}
              </span>

              {lines.line2 ? (
                <span
                  className={[
                    "board-square-lines",
                    lines.isBooth ? "board-square-lines-booth" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span
                    className={[
                      "board-square-line",
                      lines.isBooth ? "board-square-line-booth-prefix" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {lines.line1}
                  </span>
                  <span
                    className={[
                      "board-square-line",
                      lines.isBooth ? "board-square-line-booth-number" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {lines.line2}
                  </span>
                </span>
              ) : (
                <span className="square-label">{lines.line1}</span>
              )}
            </button>
          );
        })}
      </div>

      {expandedSquare ? (
        <div className="board-square-overlay" onClick={requestCloseExpandedSquare}>
          <div
            aria-labelledby={detailTitleId}
            aria-modal="true"
            className="board-square-sheet sponsor-board-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="board-square-sheet-grabber" />
            <div className="board-square-sheet-header">
              <div className="board-square-sheet-title-wrap">
                <p className="eyebrow">
                  {getSponsorStatus(expandedSquare) === "claimed" ? "Sponsor" : "Sponsor Spot"}
                </p>
                {getSponsorStatus(expandedSquare) !== "claimed" ? (
                  <p className="sponsor-board-tile-id">Tile {expandedSquare.order}</p>
                ) : null}
                <h3 className="board-square-sheet-title sponsor-board-sheet-title" id={detailTitleId}>
                  {getSponsorPopupTitle(expandedSquare)}
                </h3>
              </div>
              <span
                className={[
                  "board-square-sheet-status",
                  "sponsor-board-sheet-status",
                  `sponsor-board-sheet-status-${getSponsorStatus(expandedSquare)}`,
                ].join(" ")}
              >
                {getSponsorStatus(expandedSquare) === "claimed"
                  ? "Sponsored"
                  : getSponsorStatus(expandedSquare)}
              </span>
            </div>

            {getSponsorStatus(expandedSquare) === "claimed" && expandedSquare.logoUrl ? (
              <img
                alt=""
                className="board-square-sheet-logo sponsor-board-claimed-logo"
                src={expandedSquare.logoUrl}
              />
            ) : null}

            {getSponsorStatus(expandedSquare) === "claimed" ? (
              <>
                <p className="status-note sponsor-board-sheet-note sponsor-board-claimed-attribution">
                  This is a live sponsor placement on the Expo board.
                </p>
                <p className="status-note sponsor-board-claimed-copy">
                  Sponsor squares include logo visibility and a dedicated message shown to attendees during the event.
                </p>
              </>
            ) : (
              <>
                <p className="status-note sponsor-board-sheet-note">
                  Attendees tap these tiles to complete their board—this puts your brand in front of them.
                </p>

                <ul className="sponsor-board-sheet-list">
                  <li>Your logo appears in the tile popup</li>
                  <li>Add a short message or call-to-action</li>
                  <li>Directs attendees to your booth</li>
                </ul>
              </>
            )}

            {getSponsorStatus(expandedSquare) === "held" ? (
              <p className="status-note sponsor-board-held-note">
                This placement is temporarily reserved while CAPMA is in conversation with a sponsor.
              </p>
            ) : null}

            {getSponsorStatus(expandedSquare) === "unavailable" ? (
              <p className="status-note sponsor-board-unavailable-reason">
                {expandedSquare.detail.trim() || "This placement is currently reserved and not available."}
              </p>
            ) : null}

            <div className="board-square-sheet-actions">
              {getSponsorStatus(expandedSquare) === "available" ? (
                <a
                  className="button-primary board-square-action-button sponsor-board-cta"
                  href={buildSponsorMailto(eventName, expandedSquare)}
                  rel="noreferrer"
                  target="_blank"
                >
                  Request This Spot
                </a>
              ) : null}
              <button
                ref={closeButtonRef}
                className="admin-link-button board-square-close"
                onClick={requestCloseExpandedSquare}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
