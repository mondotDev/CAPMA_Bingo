import type { MouseEvent } from "react";
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
  squares,
}: BingoBoardProps) {
  function handleSquareClick(
    square: EventSquare,
    selected: boolean,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    if (!selected) {
      const rect = event.currentTarget.getBoundingClientRect();
      const originX = (rect.left + rect.width / 2) / window.innerWidth;
      const originY = (rect.top + rect.height / 2) / window.innerHeight;
      launchSquarePoof(originX, originY);
    }

    void onToggleSquare(square);
  }

  return (
    <div className="board-layout">
      <div className="board-header">
        <h2 className="section-title">Bingo Board</h2>
        <p className="board-subtitle">
          Tap squares as you go, then enter the drawing when your board is full.
        </p>
        <p className="status-note">
          {isLocked
            ? "Your board is complete and now locked."
            : isSaving
              ? "Saving your progress..."
              : isReadyToSubmit
                ? "All squares are selected. Enter the drawing when you are ready."
              : "Your progress saves as you tap."}
        </p>
      </div>

      <div
        className="board-grid"
        style={{ gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))` }}
      >
        {squares.map((square, index) => {
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
              onClick={(event) => handleSquareClick(square, selected, event)}
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
    </div>
  );
}
