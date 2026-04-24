import { getCurrentTime, isAtOrAfterZonedDateTime, type ZonedDateTimeConfig } from "../lib/appTime";

export const ATTENDEE_BINGO_OPEN_TIME: ZonedDateTimeConfig = {
  timeZone: "America/Los_Angeles",
  year: 2026,
  month: 9,
  day: 29,
  hour: 6,
  minute: 0,
};

export const ATTENDEE_BINGO_OPEN_LABEL = "September 29, 2026 at 6:00 AM Pacific";

const STAFF_PREVIEW_EMAILS = new Set([
  "melissa@capma.org",
  "crystelle@capma.org",
]);

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || "";
}

export function isAttendeeBingoOpen(now: Date = getCurrentTime()) {
  return isAtOrAfterZonedDateTime(now, ATTENDEE_BINGO_OPEN_TIME);
}

export function isStaffPreviewAllowed(email?: string | null) {
  return STAFF_PREVIEW_EMAILS.has(normalizeEmail(email));
}

export function isAttendeeBingoAccessible(
  now: Date = getCurrentTime(),
  email?: string | null,
) {
  return isAttendeeBingoOpen(now) || isStaffPreviewAllowed(email);
}
