import type { EventConfig } from "../features/event/event.types";

type OnboardingScreenProps = {
  event: EventConfig;
  onContinue: () => void;
};

export default function OnboardingScreen({
  event,
  onContinue,
}: OnboardingScreenProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-3 text-center">
        <h2 className="section-title">
          {event.onboarding?.title ?? "How To Play"}
        </h2>
        <p className="body-copy">
          {event.onboarding?.body ??
            "Your board is filled with moments to spot around the event. As each one happens, you can mark it off and watch your card come to life."}
        </p>
      </div>

      <div className="info-panel">
        <p className="body-copy">
          There are 25 squares on the board and no free space in the middle, so every
          square adds to the fun.
        </p>
        <p className="body-copy">
          When the whole board is filled in, your card is ready for the prize drawing.
          If you pop back in later with the same email, your progress will be waiting.
        </p>
      </div>

      <button className="button-primary" onClick={onContinue} type="button">
        {event.onboarding?.buttonText ?? "Start Playing"}
      </button>
    </div>
  );
}
