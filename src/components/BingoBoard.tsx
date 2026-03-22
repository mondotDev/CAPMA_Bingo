import type { EventSquare } from "../features/event/event.types";

type BingoBoardProps = {
  boardSize: number;
  eventName: string;
  isLocked: boolean;
  isSaving: boolean;
  markedSquareIds: string[];
  onToggleSquare: (square: EventSquare) => Promise<void>;
  squares: EventSquare[];
};

export default function BingoBoard({
  boardSize,
  eventName,
  isLocked,
  isSaving,
  markedSquareIds,
  onToggleSquare,
  squares,
}: BingoBoardProps) {
  const centerIndex = Math.floor(squares.length / 2);

  return (
    <div className="space-y-5">
      <div className="space-y-2 text-center">
        <h2 className="section-title">{eventName} Board</h2>
        <p className="body-copy">
          Tap squares on or off as you go. Finish the full board to complete
          your entry.
        </p>
        <p className="status-note">
          {isLocked
            ? "Your board is complete and now locked."
            : isSaving
              ? "Saving your progress..."
              : "Your progress saves as you tap."}
        </p>
      </div>

      <div
        className="board-grid"
        style={{ gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))` }}
      >
        {squares.map((square, index) => {
          const selected = markedSquareIds.includes(square.id);
          const isCenterSquare = index === centerIndex;

          return (
            <button
              className={[
                "board-square",
                selected ? "board-square-selected" : "",
                isCenterSquare ? "board-square-center" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={isLocked || isSaving}
              key={square.id}
              onClick={() => onToggleSquare(square)}
              type="button"
            >
              <span className="square-line">{square.labelLine1}</span>
              <span className="square-line">{square.labelLine2}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
