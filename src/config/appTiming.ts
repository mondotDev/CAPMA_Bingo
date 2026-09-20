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

export function isAttendeeBingoOpen(now: Date = getCurrentTime()) {
  return isAtOrAfterZonedDateTime(now, ATTENDEE_BINGO_OPEN_TIME);
}

export function isAttendeeBingoAccessible(
  now: Date = getCurrentTime(),
  isVerifiedAdmin = false,
) {
  return isAttendeeBingoOpen(now) || isVerifiedAdmin;
}
