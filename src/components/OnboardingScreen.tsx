import type { EventConfig } from "../features/event/event.types";

type OnboardingScreenProps = {
  event: EventConfig;
  onContinue: () => void;
};

export default function OnboardingScreen({
  event,
  onContinue,
}: OnboardingScreenProps) {
  const previewSquares = [...event.squares]
    .sort((firstSquare, secondSquare) => firstSquare.order - secondSquare.order)
    .slice(0, event.boardSize * event.boardSize);

  return (
    <div className="space-y-6">
      <div className="space-y-3 text-center">
        <h2 className="section-title">
          {event.onboarding?.title ?? "How To Play"}
        </h2>
        <p className="body-copy">
          {event.onboarding?.body ??
            "Tap each square as you complete it during the event. You must complete the full board to be entered into the prize drawing."}
        </p>
      </div>

      <section className="onboarding-board-preview">
        <div className="onboarding-board-copy">
          <p className="eyebrow">Your 4x4 Board</p>
          <p className="body-copy">
            Every tile is live for this event, and there is no free space in the center.
          </p>
        </div>

        <div
          className="board-grid onboarding-board-grid"
          style={{ gridTemplateColumns: `repeat(${event.boardSize}, minmax(0, 1fr))` }}
        >
          {previewSquares.map((square) => (
            <div className="board-square onboarding-board-square" key={square.id}>
              <span className="square-label">
                <span className="square-line">{square.labelLine1}</span>
                <span className="square-line">{square.labelLine2}</span>
                {square.labelLine3 ? (
                  <span className="square-line onboarding-square-line-optional">
                    {square.labelLine3}
                  </span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="info-panel">
        <p className="body-copy">
          Complete all 16 squares to finish your board. There is no free space,
          and every square counts.
        </p>
        <p className="body-copy">
          Your email gives you one board per event. If you return later with the
          same email, we will reload your progress.
        </p>
      </div>

      <button className="button-primary" onClick={onContinue} type="button">
        {event.onboarding?.buttonText ?? "Start Playing"}
      </button>
    </div>
  );
}
