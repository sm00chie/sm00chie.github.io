/* Hennemans surf forecast.
 *
 * Data:
 *   Open-Meteo marine API  - wave height / direction / period, swell components
 *   Open-Meteo forecast API - wind at 10 m, air temp, precipitation
 *   NOAA CO-OPS            - hourly predicted tides, interpolated to hourly
 *
 * The rating is this app's own formula. See scoreHour() for the weights.
 */

const SPOT = {
  name: 'Hennemans',
  lat: 32.81,
  lon: -117.27,
  timeZone: 'America/Los_Angeles',
  tideStation: '9410230', // La Jolla, closest open-coast reference for the spot
};

const REFRESH_MS = 30 * 60 * 1000;

const state = {
  hours: [],
  best: null,
  nextRefresh: 0,
  lastUpdated: null,
  refreshError: false,
};

/* ---------------------------------------------------------------- scoring */

// A south-facing reef likes southerly swell. Perfect window is 180-225 deg.
function directionScore(deg) {
  if (deg == null) return 0;
  let off = Math.abs(deg - 205);
  if (off > 180) off = 360 - off;
  if (off <= 30) return 1;      // dead south to SSW
  if (off <= 60) return 0.65;
  if (off <= 85) return 0.3;
  return 0.08;                  // north or west swell does not wrap in here
}

// 0 m -> 0, ramps to full credit at ~0.9 m and stays there. Rewards size
// without pretending 3 m of empty air is better than 1.5 m of shape.
function heightScore(m) {
  if (m == null) return 0;
  return Math.min(1, m / 0.9);
}

// Longer period = more shape and more push over the boulder. 17 s is plenty.
function periodScore(s) {
  if (s == null) return 0;
  return Math.min(1, Math.max(0, (s - 8) / 9));
}

// Wind direction is where-from, like the swell. For a south-facing break the
// offshore directions are roughly 280-360 (NW through N).
function windScore(dirDeg, speedMs) {
  if (dirDeg == null) return 0.4;
  const off = Math.abs(dirDeg - 330);
  const wrapped = off > 180 ? 360 - off : off;
  // 0 deg = straight offshore, 180 deg = straight onshore.
  const quality = 1 - wrapped / 180;
  const strength = speedMs == null ? 0.5 : Math.min(1, 7 / Math.max(speedMs, 0.1));
  return Math.max(0, quality * 0.75 + strength * 0.25);
}

// Boulder reef: dead low drains onto shallow rock and the wave stands up, dead
// high floods the inside. Best through the middle of the tide.
function tideScore(ft) {
  if (ft == null) return 0.5;
  if (ft < 0.5) return 0.35;
  if (ft < 1.5) return 0.75;
  if (ft <= 3.5) return 1;
  if (ft <= 5.0) return 0.8;
  return 0.55;
}

function scoreHour(h) {
  // Require actual swell energy before wind and tide can improve the rating.
  const energy = heightScore(h.swellHeight) * periodScore(h.swellPeriod);
  const exposure = directionScore(h.swellDirection);
  const conditions = windScore(h.windDirection, h.windSpeed) * 0.75 + tideScore(h.tide) * 0.25;
  return Math.round(10 * energy * (0.7 * exposure + 0.3 * conditions));
}

/* ------------------------------------------------------------ tide lookup */

// NOAA hourly predictions bracket the forecast; interpolate only within that range.
function buildTideCurve(predictions) {
  const pts = predictions
    // time_zone=gmt in the request means these strings are UTC; the Z pins it so the
    // browser's local zone cannot shift them.
    .map((p) => ({ t: new Date(p.t.replace(' ', 'T') + ':00Z'), v: parseFloat(p.v) }))
    .filter((p) => !Number.isNaN(p.t.getTime()) && !Number.isNaN(p.v))
    .sort((a, b) => a.t - b.t);

  return (when) => {
    if (!pts.length) return null;
    if (when < pts[0].t) return null;
    if (when > pts[pts.length - 1].t) return null; // beyond the prediction range
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (when >= a.t && when <= b.t) {
        const f = (when - a.t) / (b.t - a.t);
        return a.v + (b.v - a.v) * f;
      }
    }
    return null;
  };
}

/* ------------------------------------------------------------------ fetch */

async function getJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function tideURL() {
  const today = new Date(Date.now() - 864e5);
  const end = new Date(today.getTime() + 8 * 864e5);
  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const p = new URLSearchParams({
    product: 'predictions',
    application: 'NOS.COOPS.TAC.MET',
    begin_date: fmt(today),
    end_date: fmt(end),
    datum: 'MLLW',
    station: SPOT.tideStation,
    // Ask for GMT so the timestamps are unambiguously UTC and can be parsed
    // without depending on the browser's own timezone.
    time_zone: 'gmt',
    units: 'english',
    interval: 'h',
    format: 'json',
  });
  return `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${p}`;
}

async function loadForecast() {
  const tz = encodeURIComponent(SPOT.timeZone);
  const marineURL =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${SPOT.lat}&longitude=${SPOT.lon}` +
    `&hourly=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period` +
    `&forecast_days=8&timezone=${tz}&timeformat=unixtime`;

  const windURL =
    `https://api.open-meteo.com/v1/forecast?latitude=${SPOT.lat}&longitude=${SPOT.lon}` +
    `&forecast_days=8&timezone=${tz}&timeformat=unixtime&wind_speed_unit=ms&hourly=wind_speed_10m,wind_direction_10m,temperature_2m,precipitation,is_day`;

  const [marine, wind, tides] = await Promise.all([
    getJSON(marineURL),
    getJSON(windURL),
    getJSON(tideURL()).catch(() => null), // tides are a bonus, not a blocker
  ]);

  const tideAt = tides && tides.predictions ? buildTideCurve(tides.predictions) : () => null;

  const mh = marine.hourly, wh = wind.hourly;
  if (!mh?.time?.length || !wh?.time?.length) throw new Error('Forecast data is unavailable. Please try again later.');
  const windIndices = new Map(wh.time.map((time, index) => [time, index]));
  const hours = mh.time.map((iso, i) => {
    const when = new Date(iso * 1000);
    const wi = windIndices.get(iso);
    const h = {
      when,
      daylight: wh.is_day?.[wi] === 1,
      waveHeight: mh.wave_height[i],
      waveDirection: mh.wave_direction[i],
      wavePeriod: mh.wave_period[i],
      swellHeight: mh.swell_wave_height[i],
      swellDirection: mh.swell_wave_direction[i],
      swellPeriod: mh.swell_wave_period[i],
      windSpeed: wh.wind_speed_10m ? wh.wind_speed_10m[wi] : null,
      windDirection: wh.wind_direction_10m ? wh.wind_direction_10m[wi] : null,
      airTemp: wh.temperature_2m ? wh.temperature_2m[wi] : null,
      precip: wh.precipitation ? wh.precipitation[wi] : null,
      tide: tideAt(when),
    };
    h.score = scoreHour(h);
    return h;
  }).filter((h) => Number.isFinite(h.waveHeight));

  if (!hours.length) throw new Error("No valid marine forecast hours are available.");
  return hours;
}

/* ------------------------------------------------------------- formatting */

const MS_TO_MPH = 2.23694;
const M_TO_FT = 3.28084;
const C_TO_F = (c) => (c * 9) / 5 + 32;

function compass(deg) {
  if (deg == null) return '--';
  const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
               'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return pts[Math.round(deg / 22.5) % 16];
}

function ft(m) {
  if (m == null) return '--';
  const v = m * M_TO_FT;
  return (v >= 10 ? v.toFixed(1) : v.toFixed(2)) + ' ft';
}

function mps(ms) {
  if (ms == null) return '--';
  return ms.toFixed(1) + ' m/s (' + Math.round(ms * MS_TO_MPH) + ' mph)';
}

function clock(d) {
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: SPOT.timeZone,
  });
}

function dayName(d, withDate) {
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: SPOT.timeZone,
  });
}

function ratingClass(score) {
  if (score >= 7) return 'r-good';
  if (score >= 5) return 'r-ok';
  if (score >= 3) return 'r-meh';
  return 'r-bad';
}

/* --------------------------------------------------------------- rendering */

function swellText(h) {
  const d = compass(h.swellDirection);
  const p = h.swellPeriod ? Math.round(h.swellPeriod) + 's' : '--';
  return `${d} ${ft(h.swellHeight)} @ ${p}`;
}

function windText(h) {
  return `${compass(h.windDirection)} ${mps(h.windSpeed)}`;
}

function tideText(h) {
  return h.tide == null ? '--' : h.tide.toFixed(1) + ' ft';
}

// Use the weather provider's solar daylight flag for this location and date.
function isDaylight(h) {
  return h.daylight === true;
}

function renderVerdict(hours) {
  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * 864e5);
  const candidates = hours.filter(
    (h) => h.when >= now && h.when <= horizon && isDaylight(h) && h.score >= 4
  );
  if (!candidates.length) {
    document.getElementById('verdict-label').textContent = 'No strong model signal this week';
    document.getElementById('verdict-detail').textContent =
      'Every daylight hour in the next 7 days scores below 4. This experimental rating may miss local conditions.';
    return;
  }
  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));

  document.getElementById('verdict-label').textContent =
    `Best window: ${dayName(best.when, true)}, ${clock(best.when)}`;

  document.getElementById('verdict-detail').textContent =
    `${ratingLabel(best.score)} · ${best.score}/10. See the daily cards above to compare the week.`;
}

function groupByDay(hours) {
  const now = new Date();
  const days = [];
  for (const h of hours) {
    if (h.when < now || !isDaylight(h)) continue;
    const key = dayName(h.when);
    let day = days.find((d) => d.key === key);
    if (!day) days.push((day = { key, hours: [] }));
    day.hours.push(h);
  }
  return days;
}

function ratingLabel(score) {
  if (score >= 7) return 'Good';
  if (score >= 5) return 'Fair';
  if (score >= 3) return 'Marginal';
  return 'Poor';
}

function renderWeek(hours) {
  const container = document.getElementById('week-cards');
  const days = groupByDay(hours).slice(0, 7);
  if (!days.length) {
    container.innerHTML = '<p class="empty">No daylight forecast available.</p>';
    return;
  }
  const bestScore = Math.max(...days.flatMap(day => day.hours.map(h => h.score)));
  const today = dayName(new Date());
  let highlighted = false;
  container.innerHTML = days.map(day => {
    const best = day.hours.reduce((a, b) => b.score > a.score ? b : a);
    const top = !highlighted && best.score === bestScore && bestScore >= 5;
    if (top) highlighted = true;
    const date = best.when.toLocaleDateString('en-US', {month: 'short', day: 'numeric', timeZone: SPOT.timeZone});
    const weekday = day.key === today ? 'Today' : best.when.toLocaleDateString('en-US', {weekday: 'short', timeZone: SPOT.timeZone});
    return `<article class="day-card ${ratingClass(best.score)}${top ? ' best-day' : ''}" aria-label="${day.key}: ${ratingLabel(best.score)}, ${best.score} out of 10; best at ${clock(best.when)}">
      <div class="day-name">${weekday}</div><div class="day-date">${date}</div>
      <svg class="wave-icon" viewBox="0 0 64 44" fill="none" aria-hidden="true"><path d="M5 32c9 0 12-5 17-13C28 9 39 7 48 14c-9-1-13 4-11 9 2 6 10 9 22 9M5 39h54" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div class="day-quality">${ratingLabel(best.score)}</div>
      <div class="day-score">${best.score}<span>/10</span></div>
      <div class="score-track" aria-hidden="true"><span style="width:${best.score * 10}%"></span></div>
      <div class="day-time">Best ${clock(best.when)}</div>
      ${top ? '<div class="day-pick">Week’s best</div>' : ''}
    </article>`;
  }).join('');
}

function renderDaily(hours) {
  const tbody = document.querySelector('#daily tbody');
  tbody.innerHTML = '';
  const days = groupByDay(hours).slice(0, 7);

  if (!days.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">No forecast hours available.</td></tr>';
    return;
  }

  for (const day of days) {
    const best = day.hours.reduce((a, b) => (b.score > a.score ? b : a));
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${day.key}</td>
      <td><span class="rating ${ratingClass(best.score)}">${best.score}</span></td>
      <td>${clock(best.when)}</td>
      <td class="num">${ft(best.waveHeight)}</td>
      <td>${swellText(best)}</td>
      <td>${windText(best)}</td>
      <td>${tideText(best)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderHourly(hours) {
  const tbody = document.querySelector('#hourly tbody');
  tbody.innerHTML = '';
  const now = new Date();
  const next = hours
    .filter((h) => h.when >= now - 36e5 && isDaylight(h))
    .slice(0, 72);

  if (!next.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No forecast hours available.</td></tr>';
    return;
  }

  let lastDay = null;
  for (const h of next) {
    const label = dayName(h.when);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${label !== lastDay ? `<strong>${label}</strong> ${clock(h.when)}` : clock(h.when)}</td>
      <td><span class="rating ${ratingClass(h.score)}">${h.score}</span></td>
      <td class="num">${ft(h.waveHeight)}</td>
      <td>${swellText(h)}</td>
      <td>${windText(h)}</td>
      <td>${tideText(h)}</td>
    `;
    tbody.appendChild(tr);
    lastDay = label;
  }
}

function renderMeta() {
  const now = new Date();
  document.getElementById('updated').textContent = state.lastUpdated
    ? 'Updated ' + state.lastUpdated.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: SPOT.timeZone, timeZoneName: 'short' }) + (state.refreshError ? ' · refresh failed; showing earlier data' : '')
    : 'Forecast has not loaded';

  if (!state.nextRefresh) return;
  const mins = Math.max(0, Math.round((state.nextRefresh - now.getTime()) / 60000));
  document.getElementById('countdown').textContent = `Refreshing in ${mins} min`;
}

function render(hours) {
  state.hours = hours;
  renderWeek(hours);
  renderVerdict(hours);
  renderDaily(hours);
  renderHourly(hours);
  renderMeta();
}

/* ------------------------------------------------------------------- boot */

async function refresh() {
  try {
    const hours = await loadForecast();
    state.lastUpdated = new Date();
    state.refreshError = false;
    state.nextRefresh = Date.now() + REFRESH_MS;
    render(hours);
  } catch (err) {
    console.error(err);
    state.refreshError = true;
    state.nextRefresh = Date.now() + REFRESH_MS;
    renderMeta();
    if (state.hours.length) return;
    document.getElementById('week-cards').innerHTML = '<p class="empty error">Forecast unavailable. Please try again later.</p>';
    document.getElementById('verdict-label').innerHTML =
      `<span class="error">Could not load forecast</span>`;
    document.getElementById('verdict-detail').textContent = String(err.message || err);
  }
}

refresh();
setInterval(refresh, REFRESH_MS);
setInterval(renderMeta, 30000);
