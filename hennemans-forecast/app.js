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

// Spot guides favor west swell and northeast offshore wind. These curves
// are qualitative defaults, not a local refraction or breaking-wave model.
const TIDE_RULES = { minimumFt: 1.5, fullCreditFt: 3.0 };
const clamp = value => Math.max(0, Math.min(1, value));
function angleDifference(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}
function directionScore(deg) {
  if (!Number.isFinite(deg)) return 0;
  const off = angleDifference(deg, 270);
  if (off <= 30) return 1;
  if (off <= 60) return 0.75;
  if (off <= 90) return 0.4;
  return 0.1;
}
function heightScore(m) {
  return Number.isFinite(m) ? clamp(m / 0.9) : 0;
}
function periodScore(seconds) {
  return Number.isFinite(seconds) ? clamp((seconds - 8) / 9) : 0;
}
function windScore(dirDeg, speedMs) {
  if (!Number.isFinite(speedMs)) return null;
  // Calm is favorable regardless of its unreliable direction reading.
  if (speedMs <= 2) return 1;
  if (!Number.isFinite(dirDeg)) return null;
  const off = angleDifference(dirDeg, 45);
  // NE offshore; SW onshore. Strong offshore winds also lose some credit.
  if (off <= 60) return 1 - 0.5 * clamp((speedMs - 6) / 10);
  if (off <= 120) return 1 - 0.85 * clamp((speedMs - 3) / 9);
  return 1 - clamp((speedMs - 2) / 10);
}
function tideScore(ft) {
  if (!Number.isFinite(ft)) return null;
  // Provisional MLLW limits: low water blocks the entire rating. Mid/high
  // gets full credit; there is no evidence-based upper cutoff yet.
  return clamp((ft - TIDE_RULES.minimumFt) /
    (TIDE_RULES.fullCreditFt - TIDE_RULES.minimumFt));
}
function scoreHour(h) {
  const tide = tideScore(h.tide);
  const wind = windScore(h.windDirection, h.windSpeed);
  if (tide === 0) return 0;
  if (tide == null || wind == null ||
      ![h.swellHeight, h.swellPeriod, h.swellDirection].every(Number.isFinite)) return null;
  const energy = heightScore(h.swellHeight) * periodScore(h.swellPeriod);
  const base = energy * directionScore(h.swellDirection);
  // Keep the clarified two-layer wind blend, but require swell energy and
  // multiply the whole result by tide suitability. Size cannot outvote tide.
  const quality = (base * 0.78 + energy * wind * 0.22) * (0.45 + 0.55 * wind);
  return Math.round(10 * clamp(quality * tide));
}
function hourStatus(h) {
  if (tideScore(h.tide) === 0) return 'Too low';
  if (h.score == null) return 'Data missing';
  return ratingLabel(h.score);
}
function summarizeDay(day) {
  const rated = day.hours.filter(h => Number.isFinite(h.score));
  const eligible = rated.filter(h => tideScore(h.tide) > 0);
  const best = eligible.length ? eligible.reduce((a, b) => b.score > a.score ? b : a) : null;
  const scores = rated.map(h => h.score).sort((a, b) => a - b);
  const middle = Math.floor(scores.length / 2);
  const median = scores.length ? (scores.length % 2 ? scores[middle] : (scores[middle - 1] + scores[middle]) / 2) : 0;
  // Missing input must not silently make a day look good or bad.
  const score = rated.length === day.hours.length
    ? Math.round(0.45 * (best?.score ?? 0) + 0.55 * median) : null;
  const label = score == null ? 'Data missing' : !best ? 'Too low' : ratingLabel(score);
  return { best, score, label };
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
  const end = new Date(Date.now() + 9 * 864e5);
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
    getJSON(tideURL()).catch(() => null), // retain other data, but do not rate unknown tides
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
  if (score == null) return 'r-unknown';
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
    (h) => h.when >= now && h.when <= horizon && isDaylight(h) && h.score >= 5 && tideScore(h.tide) > 0
  );
  if (!candidates.length) {
    document.getElementById('verdict-label').textContent = 'No recommended window this week';
    document.getElementById('verdict-detail').textContent =
      hours.some(h => h.when >= now && isDaylight(h) && h.score == null)
        ? 'Some ratings are unavailable because tide, wind, or swell data is missing.'
        : 'No daylight hour clears the tide limits and reaches 5/10.';
    return;
  }
  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));

  document.getElementById('verdict-label').textContent =
    `Best window: ${dayName(best.when, true)}, ${clock(best.when)}`;

  document.getElementById('verdict-detail').textContent =
    `${ratingLabel(best.score)} · best hour ${best.score}/10 · tide ${tideText(best)}. Daily cards also account for the rest of the day.`;
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
  if (score == null) return 'Data missing';
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
  const bestScore = Math.max(...days.map(day => summarizeDay(day).score ?? -1));
  const today = dayName(new Date());
  let highlighted = false;
  container.innerHTML = days.map(day => {
    const { best, score, label } = summarizeDay(day);
    const reference = day.hours[0];
    const top = !highlighted && score === bestScore && bestScore >= 5;
    if (top) highlighted = true;
    const date = reference.when.toLocaleDateString('en-US', {month: 'short', day: 'numeric', timeZone: SPOT.timeZone});
    const weekday = day.key === today ? 'Today' : reference.when.toLocaleDateString('en-US', {weekday: 'short', timeZone: SPOT.timeZone});
    return `<article class="day-card ${ratingClass(score)}${top ? ' best-day' : ''}" aria-label="${day.key}: ${label}, ${score ?? 'unavailable'} out of 10">
      <div class="day-name">${weekday}</div><div class="day-date">${date}</div>
      <svg class="wave-icon" viewBox="0 0 64 44" fill="none" aria-hidden="true"><path d="M5 32c9 0 12-5 17-13C28 9 39 7 48 14c-9-1-13 4-11 9 2 6 10 9 22 9M5 39h54" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div class="day-quality">${label}</div>
      <div class="day-score">${score ?? '—'}<span>/10</span></div>
      <div class="score-track" aria-hidden="true"><span style="width:${(score ?? 0) * 10}%"></span></div>
      <div class="day-time">${best && best.score > 0 ? `Best ${clock(best.when)} · ${best.score}/10` : 'No rated window'}</div>
      ${top ? '<div class="day-pick">Week’s best</div>' : ''}
    </article>`;
  }).join('');
}

function renderBreakdown(hours) {
  const container = document.getElementById('daily-breakdown');
  const openDays = new Set(Array.from(container.querySelectorAll('details[open]'), el => el.dataset.day));
  const days = groupByDay(hours).slice(0, 7);
  if (!days.length) {
    container.innerHTML = '<p class="empty">No daylight forecast available.</p>';
    return;
  }
  container.innerHTML = days.map(day => {
    const { best, score, label } = summarizeDay(day);
    const rows = day.hours.map(h => `<tr>
      <td>${clock(h.when)}</td>
      <td><span class="rating ${ratingClass(h.score)}">${h.score == null ? '—' : `${h.score}/10`}</span><span class="hour-status">${hourStatus(h)}</span></td>
      <td class="num">${ft(h.waveHeight)}</td>
      <td>${swellText(h)}</td><td>${windText(h)}</td><td>${tideText(h)}</td>
    </tr>`).join('');
    return `<details class="day-details" data-day="${day.key}"${openDays.has(day.key) ? ' open' : ''}>
      <summary><span class="detail-day">${day.key}</span><span class="detail-quality"><span class="rating ${ratingClass(score)}">${score == null ? '—' : `${score}/10`}</span> ${label}</span><span class="detail-time">${best && best.score > 0 ? `Best ${clock(best.when)} · ${best.score}/10` : 'No rated window'}</span></summary>
      <div class="tablewrap"><table aria-label="${day.key} daylight hourly forecast"><thead><tr><th>Pacific time</th><th>Rating</th><th>Model waves</th><th>Swell</th><th>Wind</th><th>Tide</th></tr></thead><tbody>${rows}</tbody></table></div>
    </details>`;
  }).join('');
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
  renderBreakdown(hours);
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
    document.getElementById('daily-breakdown').innerHTML = '<p class="empty">Daily details will appear when the forecast loads.</p>';
    document.getElementById('verdict-label').innerHTML =
      `<span class="error">Could not load forecast</span>`;
    document.getElementById('verdict-detail').textContent = String(err.message || err);
  }
}

refresh();
setInterval(refresh, REFRESH_MS);
setInterval(renderMeta, 30000);
