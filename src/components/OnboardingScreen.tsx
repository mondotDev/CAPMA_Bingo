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
            "Tap each square as you complete it during the event. You must complete the full board to be entered into the prize drawing."}
        </p>
      </div>

      <div className="info-panel">
        <p className="body-copy">
          Complete all 9 squares to finish your board. There is no free space,
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
