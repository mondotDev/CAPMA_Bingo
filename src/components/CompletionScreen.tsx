import type { EventConfig } from "../features/event/event.types";

type CompletionScreenProps = {
  event: EventConfig;
};

export default function CompletionScreen({
  event,
}: CompletionScreenProps) {
  return (
    <div className="space-y-6 text-center">
      <div className="space-y-3">
        <p className="eyebrow">Board Complete</p>
        <h2 className="section-title">
          {event.completionMessage?.title ?? "You are entered into the prize drawing"}
        </h2>
        <p className="body-copy">
          {event.completionMessage?.body ??
            "Thanks for completing CAPMA Bingo. Your finished board has been saved for this event."}
        </p>
      </div>

      <div className="info-panel">
        <p className="body-copy">
          You are entered into the prize drawing.
        </p>
        <p className="body-copy">
          After the event, you will receive a follow-up email with a training
          discount.
        </p>
      </div>
    </div>
  );
}
