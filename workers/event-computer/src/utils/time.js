// time.js — timezone helpers and the queueing window shared by every event type.
// All scheduling is done in UTC. The IANA timezone is only used to answer
// "what is 7 AM on this subscriber's calendar day?"

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

// The event computer runs daily at 00:00 UTC. Queuing anything due in the next
// 36h leaves 12h of overlap, so a slow or skipped-by-minutes run misses nothing.
// The dedupe checks keep the overlap from sending anything twice.
const QUEUE_HORIZON = 36 * HOUR;
// A notification computed slightly in the past (e.g. a manual /trigger run
// mid-evening) is still worth queuing. The dispatcher's freshness window
// decides whether it's too late to send.
const QUEUE_GRACE = 1 * HOUR;

export function inQueueWindow(notifyMs, nowMs) {
  return notifyMs >= nowMs - QUEUE_GRACE && notifyMs <= nowMs + QUEUE_HORIZON;
}

// Calendar date/time in `timeZone` for an instant.
export function localParts(ms, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = type => Number(parts.find(p => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

function offsetMs(ms, timeZone) {
  const p = localParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// The UTC instant of a wall-clock time in `timeZone`. `day` may overflow
// (e.g. day 0 = last day of the previous month), same as Date.UTC.
export function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(guess, timeZone);
  // Second pass settles the answer when a DST change falls between the guess and the result.
  return guess - offsetMs(first, timeZone);
}

// A wall-clock time on the same local calendar day as `ms`, plus `dayOffset` days.
export function localTimeOnDay(ms, timeZone, hour, minute = 0, dayOffset = 0) {
  const p = localParts(ms, timeZone);
  return zonedTimeToUtc(p.year, p.month, p.day + dayOffset, hour, minute, timeZone);
}

export const iso = ms => new Date(ms).toISOString();
