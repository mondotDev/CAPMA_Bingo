export type ZonedDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export type ZonedDateTimeConfig = ZonedDateTimeParts & {
  timeZone: string;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string) {
  const cachedFormatter = formatterCache.get(timeZone);

  if (cachedFormatter) {
    return cachedFormatter;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  formatterCache.set(timeZone, formatter);
  return formatter;
}

export function getCurrentTime() {
  return new Date();
}

export function getZonedDateTimeParts(date: Date, timeZone: string): ZonedDateTimeParts {
  const parts = getFormatter(timeZone).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
  };
}

export function compareZonedDateTimeParts(
  left: ZonedDateTimeParts,
  right: ZonedDateTimeParts,
) {
  const comparisonOrder: Array<keyof ZonedDateTimeParts> = [
    "year",
    "month",
    "day",
    "hour",
    "minute",
  ];

  for (const key of comparisonOrder) {
    if (left[key] !== right[key]) {
      return left[key] - right[key];
    }
  }

  return 0;
}

export function isAtOrAfterZonedDateTime(date: Date, target: ZonedDateTimeConfig) {
  return compareZonedDateTimeParts(
    getZonedDateTimeParts(date, target.timeZone),
    target,
  ) >= 0;
}
