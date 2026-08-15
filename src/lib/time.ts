const DATE_FMT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
};

const TIME_FMT: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
};

export function formatDate(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, { ...DATE_FMT, timeZone }).format(new Date(iso));
}

export function formatTime(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, { ...TIME_FMT, timeZone }).format(new Date(iso));
}

export function formatDateTime(iso: string, timeZone?: string) {
  return `${formatDate(iso, timeZone)} · ${formatTime(iso, timeZone)}`;
}

export function dayKey(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function countdown(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return null;
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours >= 48) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours >= 1) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function matchStatus(iso: string) {
  const start = new Date(iso).getTime();
  const now = Date.now();
  if (now < start) return "upcoming" as const;
  if (now < start + 90 * 60_000) return "live" as const;
  return "done" as const;
}

export const venueZone = "Europe/Brussels";
