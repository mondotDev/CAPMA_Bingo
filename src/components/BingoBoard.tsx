import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from "react";
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
  squares: EventSquare[];
};

type ExpandedSquareMotion = {
  scale: number;
  translateX: number;
  translateY: number;
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
  squares,
}: BingoBoardProps) {
  const detailTitleId = useId();
  const [expandedSquare, setExpandedSquare] = useState<EventSquare | null>(null);
  const [expandedSquareMotion, setExpandedSquareMotion] = useState<ExpandedSquareMotion | null>(
    null,
  );
  const [isExpandedSquareFlipped, setIsExpandedSquareFlipped] = useState(false);
  const [isExpandedSquareVisible, setIsExpandedSquareVisible] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const expandedSquareSelected = expandedSquare
    ? markedSquareIds.includes(expandedSquare.id)
    : false;
  const progressCount = markedSquareIds.length;
  const progressPercent = squares.length > 0 ? Math.round((progressCount / squares.length) * 100) : 0;
  const closeTimeoutRef = useRef<number | null>(null);
  const flipTimeoutRef = useRef<number | null>(null);
  const expandedActionButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    syncPreference();
    mediaQuery.addEventListener("change", syncPreference);

    return () => {
      mediaQuery.removeEventListener("change", syncPreference);
    };
  }, []);

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

    if (prefersReducedMotion) {
      setIsExpandedSquareVisible(true);
      setIsExpandedSquareFlipped(true);
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      setIsExpandedSquareVisible(true);
      flipTimeoutRef.current = window.setTimeout(() => {
        setIsExpandedSquareFlipped(true);
      }, 70);
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);

      if (flipTimeoutRef.current !== null) {
        window.clearTimeout(flipTimeoutRef.current);
        flipTimeoutRef.current = null;
      }
    };
  }, [expandedSquare, prefersReducedMotion]);

  useEffect(() => {
    if (!expandedSquare) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      expandedActionButtonRef.current?.focus();
    }, prefersReducedMotion ? 0 : 120);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [expandedSquare, prefersReducedMotion]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }

      if (flipTimeoutRef.current !== null) {
        window.clearTimeout(flipTimeoutRef.current);
      }
    };
  }, []);

  function requestCloseExpandedSquare() {
    if (!expandedSquare) {
      return;
    }

    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
    }

    setIsExpandedSquareVisible(false);
    setIsExpandedSquareFlipped(false);
    if (prefersReducedMotion) {
      setExpandedSquare(null);
      setExpandedSquareMotion(null);
      lastTriggerRef.current?.focus();
      return;
    }

    closeTimeoutRef.current = window.setTimeout(() => {
      setExpandedSquare(null);
      setExpandedSquareMotion(null);
      lastTriggerRef.current?.focus();
      closeTimeoutRef.current = null;
    }, 220);
  }

  function handleSquareClick(square: EventSquare, event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    lastTriggerRef.current = event.currentTarget;

    const rect = event.currentTarget.getBoundingClientRect();
    const targetWidth = Math.min(window.innerWidth - 40, 352);
    const targetHeight = Math.min(window.innerWidth * 0.72, 320);

    setExpandedSquareMotion({
      scale: Math.max(rect.width / targetWidth, rect.height / targetHeight),
      translateX: rect.left + rect.width / 2 - window.innerWidth / 2,
      translateY: rect.top + rect.height / 2 - window.innerHeight / 2,
    });
    setIsExpandedSquareVisible(false);
    setIsExpandedSquareFlipped(false);
    setExpandedSquare(square);
  }

  async function handleExpandedSquareSubmit() {
    if (!expandedSquare || isLocked || isSaving) {
      return;
    }

    const isSelected = markedSquareIds.includes(expandedSquare.id);

    if (!isSelected) {
      const originX = 0.5;
      const originY = 0.5;
      launchSquarePoof(originX, originY);
    }

    await onToggleSquare(expandedSquare);
    requestCloseExpandedSquare();
  }

  return (
    <div className="board-layout">
      <div className="board-header">
        <h2 className="section-title">Bingo Board</h2>
        <p className="board-subtitle">
          Tap a square to take a closer look, then enter the drawing when your board is full.
        </p>
        {restoreMessage ? (
          <p className="status-note board-return-note">{restoreMessage}</p>
        ) : null}
        <div className="board-progress">
          <div className="board-progress-copy">
            <p className="eyebrow">Progress</p>
            <p className="board-progress-value">
              {progressCount} of {squares.length} complete
            </p>
          </div>
          <div
            aria-hidden="true"
            className="board-progress-bar"
          >
            <span
              className="board-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <p className="status-note">
          {isLocked
            ? "Your board is complete and now locked."
            : isSaving
              ? "Saving your progress..."
              : isReadyToSubmit
                ? "All squares are selected. Enter the drawing when you are ready."
              : "Open any square to explore it before marking it complete."}
        </p>
      </div>

      <div
        className="board-grid"
        style={{ gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))` }}
      >
        {squares.map((square) => {
          const selected = markedSquareIds.includes(square.id);
          const squareLines = [square.labelLine1, square.labelLine2];

          return (
            <button
              className={[
                "board-square",
                selected ? "board-square-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={isLocked || isSaving}
              key={square.id}
              onClick={(event) => handleSquareClick(square, event)}
              type="button"
            >
              <span className="square-label">
                {squareLines.map((line) => (
                  <span className="square-line" key={`${square.id}-${line}`}>
                    {line}
                  </span>
                ))}
              </span>
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
        <div
          className="board-square-overlay"
          onClick={requestCloseExpandedSquare}
        >
          <div
            aria-labelledby={detailTitleId}
            aria-modal="true"
            className="board-square-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <button
              aria-label={isExpandedSquareFlipped ? "Show front of card" : "Show back of card"}
              className={[
                "board-square-modal-card",
                expandedSquareSelected ? "board-square-modal-card-selected" : "",
                isExpandedSquareFlipped ? "board-square-modal-card-flipped" : "",
                isExpandedSquareVisible ? "board-square-modal-card-visible" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setIsExpandedSquareFlipped((currentValue) => !currentValue)}
              style={
                expandedSquareMotion
                  ? ({
                      "--board-origin-scale": expandedSquareMotion.scale,
                      "--board-origin-x": `${expandedSquareMotion.translateX}px`,
                      "--board-origin-y": `${expandedSquareMotion.translateY}px`,
                    } as CSSProperties)
                  : undefined
              }
              type="button"
            >
              <span className="board-square-modal-rotator">
                <span className="board-square board-square-modal-face board-square-modal-front">
                  <span className="square-label">
                    <span className="square-line">{expandedSquare.labelLine1}</span>
                    <span className="square-line">{expandedSquare.labelLine2}</span>
                  </span>
                  <span className="status-note board-square-face-hint">
                    Tap to flip
                  </span>
                </span>

                <span className="board-square board-square-modal-face board-square-modal-back">
                  <span className="board-square-back-header">
                    <span className="eyebrow">Square Detail</span>
                    <span className="board-square-back-title" id={detailTitleId}>
                      {expandedSquare.labelLine1}
                      <br />
                      {expandedSquare.labelLine2}
                    </span>
                  </span>

                  <span className="board-square-back-copy">
                    {expandedSquare.labelLine3?.trim() ||
                      "More details for this square will appear here."}
                  </span>

                  <div className="board-square-back-actions">
                    <button
                      ref={expandedActionButtonRef}
                      className="button-primary board-square-action-button"
                      disabled={isLocked || isSaving}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleExpandedSquareSubmit();
                      }}
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
                    <span className="status-note board-square-face-hint">
                      Tap anywhere else on the card to flip back.
                    </span>
                  </div>
                </span>
              </span>
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
      ) : null}
    </div>
  );
}
