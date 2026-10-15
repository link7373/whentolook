// weather.js
// Cloud cover from Open-Meteo (free, no key), by the hour.
// Returns null for anything it can't answer. Callers MUST fail open on null
// (send anyway): a missed forecast should never cost someone a real event.

// Cloud cover (0–100) at each of `utcIsos`, from one request. Each entry is the
// forecast for the UTC hour containing that time, or null if unknown.
export async function getCloudCoverAt(lat, lon, utcIsos) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&hourly=cloud_cover&forecast_days=3&timezone=UTC`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return utcIsos.map(() => null);
    const data = await res.json();
    const times = data.hourly?.time;
    const covers = data.hourly?.cloud_cover;
    if (!times || !covers) return utcIsos.map(() => null);
    // Open-Meteo's hourly times look like "2026-04-01T09:00".
    return utcIsos.map(iso => {
      const idx = times.indexOf(new Date(iso).toISOString().slice(0, 13) + ':00');
      return idx === -1 ? null : covers[idx];
    });
  } catch {
    return utcIsos.map(() => null);
  }
}
