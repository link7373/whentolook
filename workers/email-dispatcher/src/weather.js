// weather.js
// Returns cloud cover percentage (0-100) for the given lat/lon at the UTC hour
// matching utcIso (e.g. "2026-04-01T09:30:00Z" checks the 09:00 UTC hour).
// Returns null on any error -- callers MUST fail open (send anyway) on null.
export async function getCloudCover(lat, lon, utcIso) {
  // Open-Meteo returns hourly times as "2026-04-01T09:00" -- must match exactly
  const targetHour = utcIso.slice(0, 13) + ':00'; // e.g. "2026-04-01T09:00"
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&hourly=cloud_cover&forecast_days=2&timezone=UTC`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const times = data.hourly?.time;
    const covers = data.hourly?.cloud_cover;
    if (!times || !covers) return null;
    const idx = times.indexOf(targetHour);
    if (idx === -1) return null;
    return covers[idx]; // 0-100
  } catch {
    return null;
  }
}
