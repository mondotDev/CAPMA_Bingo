export type EventTheme = {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
};

export type EventOnboarding = {
  title?: string;
  body?: string;
  buttonText?: string;
};

export type EventCompletionMessage = {
  title?: string;
  body?: string;
};

export type EventSquare = {
  id: string;
  labelLine1: string;
  labelLine2: string;
  labelLine3?: string;
  order: number;
};

export type EventConfig = {
  eventId: string;
  name: string;
  isActive: boolean;
  boardSize: number;
  submissionOpen: boolean;
  theme?: EventTheme;
  onboarding?: EventOnboarding;
  completionMessage?: EventCompletionMessage;
  squares: EventSquare[];
};
