import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import type { EventSquare } from "../features/event/event.types";
import { launchSquarePoof } from "../lib/celebration";

type BingoBoardProps = {
  boardSize: number;
  eventName: string;
  isReadyToSubmit: boolean;
  isLocked: boolean;
  isSaving: boolean;
  markedSquareIds: string[];
  onSubmitCompletedBoard: () => Promise<void>;
  onToggleSquare: (square: EventSquare) => Promise<void>;
  restoreMessage?: string | null;
  restoreMessageVisible?: boolean;
  squares: EventSquare[];
};

export default function BingoBoard({
  boardSize,
  eventName: _eventName,
  isReadyToSubmit,
  isLocked,
  isSaving,
  markedSquareIds,
  onSubmitCompletedBoard,
  onToggleSquare,
  restoreMessage,
  restoreMessageVisible = false,
  squares,
}: BingoBoardProps) {
  const detailTitleId = useId();
  const [expandedSquare, setExpandedSquare] = useState<EventSquare | null>(null);
  const actionButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const expandedSquareSelected = expandedSquare
    ? markedSquareIds.includes(expandedSquare.id)
    : false;
  const progressCount = markedSquareIds.length;
  const progressPercent =
    squares.length > 0 ? Math.round((progressCount / squares.length) * 100) : 0;

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

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [expandedSquare]);

  useEffect(() => {
    if (!expandedSquare) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      actionButtonRef.current?.focus();
    }, 30);

    return () => {
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

  async function handleExpandedSquareSubmit() {
    if (!expandedSquare || isLocked || isSaving) {
      return;
    }

    const isSelected = markedSquareIds.includes(expandedSquare.id);

    if (!isSelected) {
      launchSquarePoof(0.5, 0.5);
    }

    await onToggleSquare(expandedSquare);
    requestCloseExpandedSquare();
  }

  return (
    <div className="board-layout">
      <div className="board-header">
        <h2 className="section-title">Bingo Board</h2>
        <p className="board-subtitle">
          Tap any square to read the details and mark it complete when you spot it.
        </p>
        {restoreMessage ? (
          <p
            className={[
              "status-note",
              "board-return-note",
              restoreMessageVisible ? "board-return-note-visible" : "board-return-note-hidden",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {restoreMessage}
          </p>
        ) : null}
        <div className="board-progress">
          <div className="board-progress-copy">
            <div className="board-progress-stack">
              <p className="eyebrow">Progress</p>
              <p className="board-progress-value">
                {progressCount} of {squares.length} complete
              </p>
            </div>
            <span className="board-progress-badge">{progressPercent}%</span>
          </div>
          <div aria-hidden="true" className="board-progress-bar">
            <span className="board-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        <p className="status-note">
          {isLocked
            ? "Your board is complete and now locked."
            : isSaving
              ? "Saving your progress..."
              : isReadyToSubmit
                ? "All 25 squares are complete."
                : "Tap any square for details."}
        </p>
      </div>

      <div
        className="board-grid"
        style={{ gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))` }}
      >
        {squares.map((square, index) => {
          const selected = markedSquareIds.includes(square.id);
          const tileLabel = square.shortLabel?.trim() || square.label;

          return (
            <button
              aria-label={`${square.label}. ${selected ? "Completed" : "Not completed"}. Open details.`}
              className={["board-square", selected ? "board-square-selected" : ""]
                .filter(Boolean)
                .join(" ")}
              disabled={isLocked || isSaving}
              key={square.id}
              onClick={(event) => handleSquareClick(square, event)}
              type="button"
            >
              <span className="board-square-topline">
                <span className="board-square-number">{index + 1}</span>
                {selected ? <span className="board-square-check" aria-hidden="true">✓</span> : null}
              </span>
              <span className="square-label">{tileLabel}</span>
            </button>
          );
        })}
      </div>

      {isReadyToSubmit ? (
        <div className="board-cta-wrap">
          <button
            className="button-primary board-cta-button"
            disabled={isSaving || isLocked}
            onClick={() => void onSubmitCompletedBoard()}
            type="button"
          >
            {isSaving ? "Entering Drawing..." : "Enter Drawing"}
          </button>
        </div>
      ) : null}

      {expandedSquare ? (
        <div className="board-square-overlay" onClick={requestCloseExpandedSquare}>
          <div
            aria-labelledby={detailTitleId}
            aria-modal="true"
            className="board-square-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="board-square-sheet-grabber" />
            <div className="board-square-sheet-header">
              <div className="board-square-sheet-title-wrap">
                <p className="eyebrow">Square Detail</p>
                <h3 className="board-square-sheet-title" id={detailTitleId}>
                  {expandedSquare.label}
                </h3>
              </div>
              <span
                className={[
                  "board-square-sheet-status",
                  expandedSquareSelected ? "board-square-sheet-status-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {expandedSquareSelected ? "Completed" : "Not completed"}
              </span>
            </div>

            <p className="board-square-sheet-copy">
              {expandedSquare.detail.trim() || "More details for this square will appear here."}
            </p>

            <div className="board-square-sheet-actions">
              <button
                ref={actionButtonRef}
                className="button-primary board-square-action-button"
                disabled={isLocked || isSaving}
                onClick={() => void handleExpandedSquareSubmit()}
                type="button"
              >
                {isLocked
                  ? "Board Locked"
                  : isSaving
                    ? "Saving..."
                    : expandedSquareSelected
                      ? "Unmark Square"
                      : "Mark Square"}
              </button>
              <button
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
