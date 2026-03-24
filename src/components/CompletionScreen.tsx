import type { EventConfig } from "../features/event/event.types";

type CompletionScreenProps = {
  event: EventConfig;
};

export default function CompletionScreen({
  event,
}: CompletionScreenProps) {
  return (
    <div className="completion-layout">
      <div className="completion-hero">
        <p className="eyebrow">Board Complete</p>
        <h2 className="section-title">
          {event.completionMessage?.title ?? "You are entered into the prize drawing"}
        </h2>
        <p className="body-copy">
          {event.completionMessage?.body ??
            "Thanks for completing CAPMA Bingo. Your finished board has been saved for this event."}
        </p>
      </div>

      <section className="completion-highlight">
        <div className="completion-highlight-badge">16 of 16</div>
        <div className="completion-highlight-copy">
          <p className="eyebrow">You Made It</p>
          <p className="completion-highlight-title">Your board is complete and officially in.</p>
          <p className="body-copy">
            Everything is saved for this event, so you can enjoy the rest of the experience
            knowing your entry is already counted.
          </p>
        </div>
      </section>

      <div className="info-panel">
        <p className="body-copy">
          Your finished board has been entered into the prize drawing.
        </p>
        <p className="body-copy">
          Keep an eye on your inbox after the event for the follow-up email and
          training discount details.
        </p>
      </div>
    </div>
  );
}
