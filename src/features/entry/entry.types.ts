export type EntryFormValues = {
  name: string;
  company: string;
  email: string;
};

export type EntryRecord = {
  id: string;
  eventId: string;
  name: string;
  company: string;
  email: string;
  normalizedEmail: string;
  markedSquareIds: string[];
  completed: boolean;
  completedAt: Date | null;
  prizeEntryEligible: boolean;
  createdAt: Date | null;
  winnerLocked: boolean;
  winnerLockedAt: Date | null;
  winnerLockedBy: string;
};

export type EntrySaveResult = {
  completed: boolean;
  completedAt: Date | null;
  prizeEntryEligible: boolean;
};

export type AdminEntryUpdateValues = {
  name: string;
  company: string;
  email: string;
};
