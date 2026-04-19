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

export type EventSquareTileType = "booth" | "custom";
export type EventSquareSponsorStatus = "available" | "claimed" | "held" | "unavailable";

export type EventSquare = {
  id: string;
  label: string;
  shortLabel?: string;
  boardLine1?: string;
  boardLine2?: string;
  detail: string;
  logoUrl?: string;
  tileType?: EventSquareTileType;
  sponsorStatus?: EventSquareSponsorStatus;
  sponsorClaimedBy?: string;
  category?: string;
  points: number;
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
  requiresSquareUpgrade?: boolean;
};
