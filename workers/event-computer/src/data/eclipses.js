// eclipses.js — eclipse catalog, 2026–2031.
//
// The rows below are copied verbatim from NASA's Five Millennium Canon
// (Fred Espenak, eclipse.gsfc.nasa.gov/LEcat5/LE2001-2100.html and
// SEcat5/SE2001-2100.html), so they can be diffed against the source. Times
// are TD (dynamical time), and the parser converts them to UT with each row's own ΔT.
//
// Everything location-specific (local times, whether the Moon or Sun is up,
// how much of the Sun is covered) is computed per subscriber from these rows.
//
// ⚠ RUNWAY: this table is the one piece of event data that runs out.
// ECLIPSE_DATA_THROUGH is checked by the dispatcher's daily health check,
// which starts failing 180 days before the data ends. To extend it, paste the
// next rows from the NASA catalogs in the same format.

// Catalog columns: date, TD of greatest eclipse, ΔT (s), lunation, saros, type,
// QSE, gamma, penumbral mag, umbral mag, durations in minutes (penumbral,
// partial, total; '-' if none), and the sub-lunar point at greatest eclipse.
const LUNAR_ROWS = `
2026 Mar 03  11:34:52     75    323  133   T   a-  -0.3765  2.1838  1.1507  338.6  207.2   58.3    6N  171W
2026 Aug 28  04:14:04     75    329  138   P   t-   0.4964  1.9645  0.9299  337.8  198.1    -      9S   63W
2027 Feb 20  23:14:06     76    335  143   N   a-  -1.0480  0.9266 -0.0569  241.0    -      -     10N   15E
2027 Jul 18  16:04:09     76    340  110   Ne  -t  -1.5758  0.0014 -1.0680   11.8    -      -     22S  121E
2027 Aug 17  07:14:59     76    341  148   N   t-   1.2797  0.5456 -0.5254  218.6    -      -     12S  108W
2028 Jan 12  04:14:13     76    346  115   P   -a   0.9817  1.0468  0.0662  250.7   56.0    -     23N   61W
2028 Jul 06  18:20:57     77    352  120   P   -t  -0.7903  1.4266  0.3892  310.6  141.5    -     23S   86E
2028 Dec 31  16:53:15     77    358  125   T   -p   0.3258  2.2742  1.2463  336.2  208.8   71.3   23N  108E
2029 Jun 26  03:23:22     77    364  130   T+  pp   0.0124  2.8266  1.8436  335.1  219.5  101.9   23S   50W
2029 Dec 20  22:43:12     78    370  135   T   p-  -0.3811  2.2008  1.1174  358.0  213.3   53.7   23N   19E
2030 Jun 15  18:34:34     78    376  140   P   a-   0.7534  1.4480  0.5025  278.2  144.4    -     23S   82E
2030 Dec 09  22:28:51     78    382  145   N   t-  -1.0731  0.9416 -0.1628  279.2    -      -     22N   21E
2031 May 07  03:52:02     78    387  112   N   -a  -1.0694  0.8814 -0.0904  237.3    -      -     18S   59W
2031 Jun 05  11:45:17     78    388  150   N   a-   1.4731  0.1292 -0.8199   95.6    -      -     21S  176W
2031 Oct 30  07:46:45     79    393  117   N   -h   1.1773  0.7161 -0.3204  231.8    -      -     15N  121W
`;

// Catalog columns: date, TD of greatest eclipse, ΔT (s), lunation, saros, type,
// QLE, gamma, magnitude, point of greatest eclipse, Sun altitude there, path
// width (km), central duration.
const SOLAR_ROWS = `
2026 Feb 17  12:13:06     75    323  121   A   -t  -0.9743  0.9630  65S  87E  12  616  02m20s
2026 Aug 12  17:47:06     75    329  126   T   -p   0.8977  1.0386  65N  25W  26  294  02m18s
2027 Feb 06  16:00:48     76    335  131   A   -n  -0.2952  0.9281  31S  48W  73  282  07m51s
2027 Aug 02  10:07:50     76    341  136   T   nn   0.1421  1.0790  26N  33E  82  258  06m23s
2028 Jan 26  15:08:59     76    347  141   A   p-   0.3901  0.9208   3N  52W  67  323  10m27s
2028 Jul 22  02:56:40     77    353  146   T   p-  -0.6056  1.0560  16S 127E  53  230  05m10s
2029 Jan 14  17:13:48     77    359  151   P   t-   1.0553  0.8714  64N 114W   0
2029 Jun 12  04:06:13     77    364  118   P   -t   1.2943  0.4576  67N  66W   0
2029 Jul 11  15:37:19     77    365  156   P   t-  -1.4191  0.2303  64S  86W   0
2029 Dec 05  15:03:58     77    370  123   P   -t  -1.0609  0.8911  68S 136E   0
2030 Jun 01  06:29:13     78    376  128   A   -p   0.5626  0.9443  57N  80E  55  250  05m21s
2030 Nov 25  06:51:37     78    382  133   T   -n  -0.3867  1.0468  44S  71E  67  169  03m44s
2031 May 21  07:16:04     78    388  138   A   nn  -0.1970  0.9589   9N  72E  79  152  05m26s
2031 Nov 14  21:07:31     79    394  143   H   n-   0.3078  1.0106   1S 138W  72   38  01m08s
`;

// Short context for the email only. These are written from general knowledge,
// not transcribed from NASA's maps. Subscribers' own circumstances are
// computed, and each email links to NASA's interactive map.
const SOLAR_PATHS = {
  '2027-02-06': 'Chile, Argentina and Uruguay, then across the Atlantic to West Africa',
  '2027-08-02': 'southern Spain, North Africa (including Luxor, Egypt) and the Arabian Peninsula',
  '2028-01-26': 'Ecuador, Peru and Brazil, ending at sunset over Portugal and Spain',
  '2028-07-22': 'Australia (including Sydney) and New Zealand',
  '2030-06-01': 'North Africa, Greece, Turkey, Russia and northern Japan',
  '2030-11-25': 'southern Africa and southern Australia',
  '2031-05-21': 'central Africa, southern India, Sri Lanka and Southeast Asia',
  '2031-11-14': 'the Pacific Ocean and Panama',
};

// Penumbral-only eclipses below this magnitude are effectively invisible. They
// are not worth an email, because nobody would see anything.
const MIN_PENUMBRAL_MAG = 0.9;

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

function parseUt(year, mon, day, hms, deltaT) {
  const [h, m, s] = hms.split(':').map(Number);
  return Date.UTC(+year, MONTHS[mon], +day, h, m, s) - deltaT * 1000;
}

function parseCoord(str) {
  const v = parseFloat(str);
  return /[SW]$/.test(str) ? -v : v;
}

const iso = ms => new Date(Math.round(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
const dateKey = (y, mon, d) => `${y}-${String(MONTHS[mon] + 1).padStart(2, '0')}-${d}`;

const LUNAR_TYPES = { T: 'total', P: 'partial', N: 'penumbral' };
const SOLAR_TYPES = { T: 'total', A: 'annular', P: 'partial', H: 'hybrid' };

export const LUNAR_ECLIPSES = LUNAR_ROWS.trim().split('\n').map(line => {
  const c = line.trim().split(/\s+/);
  const [y, mon, d, hms, dT] = c;
  const type = LUNAR_TYPES[c[7][0]];
  const penMag = parseFloat(c[10]);
  const [pen, par, tot] = [c[12], c[13], c[14]].map(v => (v === '-' ? null : parseFloat(v)));
  const max = parseUt(y, mon, d, hms, +dT);
  // Contacts are symmetric about greatest eclipse to well under a minute.
  const half = mins => mins * 30000;
  const date = dateKey(y, mon, d);
  return {
    id: `lunar-eclipse-${date}`,
    date,
    type,
    penumbral_magnitude: penMag,
    umbral_magnitude: parseFloat(c[11]),
    penumbral_start: iso(max - half(pen)),
    partial_start: par ? iso(max - half(par)) : null,
    total_start: tot ? iso(max - half(tot)) : null,
    maximum: iso(max),
    total_end: tot ? iso(max + half(tot)) : null,
    partial_end: par ? iso(max + half(par)) : null,
    penumbral_end: iso(max + half(pen)),
    zenith_lat: parseCoord(c[15]),
    zenith_lon: parseCoord(c[16]),
  };
}).filter(e => e.type !== 'penumbral' || e.penumbral_magnitude >= MIN_PENUMBRAL_MAG);

export const SOLAR_ECLIPSES = SOLAR_ROWS.trim().split('\n').map(line => {
  const c = line.trim().split(/\s+/);
  const [y, mon, d, hms, dT] = c;
  const date = dateKey(y, mon, d);
  return {
    id: `solar-eclipse-${date}`,
    date,
    type: SOLAR_TYPES[c[7][0]],
    greatest_utc: iso(parseUt(y, mon, d, hms, +dT)),
    magnitude: parseFloat(c[10]),
    greatest_lat: parseCoord(c[11]),
    greatest_lon: parseCoord(c[12]),
    sun_alt: parseInt(c[13], 10),
    path_description: SOLAR_PATHS[date] ?? null,
    map_url: `https://eclipse.gsfc.nasa.gov/SEsearch/SEsearchmap.php?Ecl=${date.replace(/-/g, '')}`,
  };
});

// Last date covered by either table (YYYY-MM-DD).
export const ECLIPSE_DATA_THROUGH = [
  LUNAR_ROWS.trim().split('\n').at(-1), SOLAR_ROWS.trim().split('\n').at(-1),
].map(line => {
  const [y, mon, d] = line.trim().split(/\s+/);
  return dateKey(y, mon, d);
}).sort().at(-1);
