// time.js — All helpers work in UTC. Local conversion only at render time.

/**
 * Returns true if the UTC peak time falls within the notification window for this subscriber.
 * Window: peak is between 12 hours ago and 36 hours from now (catches today and tomorrow).
 */
export function isPeakTonight(peakUtc, nowUtc) {
  const now = new Date(nowUtc);
  const peak = new Date(peakUtc);
  const diffHours = (peak - now) / (1000 * 60 * 60);
  return diffHours >= -12 && diffHours <= 36;
}

/**
 * Given a UTC ISO string and an IANA timezone, returns a human-readable local time.
 * e.g. "10:45 PM"
 */
export function formatLocalTime(utcStr, timezone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(utcStr));
}

/**
 * Given a UTC ISO string and an IANA timezone, returns a local date string.
 * e.g. "April 22"
 */
export function formatLocalDate(utcStr, timezone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'long',
    day: 'numeric',
  }).format(new Date(utcStr));
}
