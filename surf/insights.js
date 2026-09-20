'use strict';
const finite = Number.isFinite;
const degToCardinal = d => ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round((((d % 360) + 360) % 360) / 22.5) % 16];
const mToFt = m => m * 3.28084;
const localTime = d => new Date(d).toLocaleTimeString('en-US', {timeZone:'America/Los_Angeles',hour:'numeric',minute:'2-digit'});
const text = (id, value) => { document.getElementById(id).textContent = value; };
function signal(id, label, tone = '') { const el = document.getElementById(id); el.textContent = label; el.className = 'signal ' + tone; }
function swellCue(ft, period) {
  if (!finite(ft) || ft < 0) return ['Unavailable',''];
  if (ft < 1.5) return ['Small swell','mixed'];
  if (ft >= 6) return ['Large swell','strong'];
  if (!finite(period) || period <= 0) return ['Period unavailable',''];
  if (period < 10) return ['Short-period','mixed'];
  if (period < 13) return ['Mid-period',''];
  return ['Longer-period','good'];
}
function windCue(speed, from, gust) {
  if (!finite(speed) || speed < 0) return ['Unavailable','','Wind data unavailable.'];
  if (speed <= 4 && (!finite(gust) || gust <= 8)) return ['Light wind','good','Light wind near PB / La Jolla; check the cams for local texture.'];
  if (!finite(from)) return ['Direction unavailable','','Wind direction unavailable; check the cams.'];
  const d = ((from % 360) + 360) % 360;
  const offshore = d >= 45 && d <= 135;
  const onshore = d >= 225 && d <= 315;
  const strong = speed >= 15 || (finite(gust) && gust >= 20);
  const name = offshore ? 'Offshore' : onshore ? 'Onshore' : 'Cross-shore';
  return [strong ? 'Strong / gusty ' + name.toLowerCase() : name,
    strong ? 'strong' : offshore ? 'good' : 'mixed',
    offshore ? (strong ? 'Strong offshore wind near PB / La Jolla; conditions may be challenging.' : 'Offshore wind near PB / La Jolla may help keep faces cleaner.') : onshore ? 'Onshore wind near PB / La Jolla may add chop; check local cams before driving.' : 'Cross-shore wind near PB / La Jolla; texture will vary with beach orientation.'];
}
function directionArrow(from) {
  if (!finite(from)) return '';
  const heading = ((from + 180) % 360 + 360) % 360;
  return `<span aria-label="traveling ${degToCardinal(heading)}" style="display:inline-block;transform:rotate(${heading}deg)">↑</span> ${degToCardinal(from)}`;
}
async function json(url) {
  const r = await fetch(url, {signal:AbortSignal.timeout(15000)});
  if (!r.ok) throw new Error('Data request failed');
  const data = await r.json();
  if (data.error) throw new Error('Data unavailable');
  return data;
}
async function snapshot(name) {
  // Read committed snapshots directly: automated commits do not rebuild Pages.
  const base = 'https://raw.githubusercontent.com/sm00chie/sm00chie.github.io/main/surf/data/';
  try { return await json('./data/' + name + '.json'); }
  catch { return await json(base + name + '.json'); }
}
function recentModel(c) { return finite(c?.time) && Math.abs(Date.now() - c.time * 1000) <= 3 * 3600000; }
async function loadConditions() {
  const marine = 'https://marine-api.open-meteo.com/v1/marine?latitude=32.82&longitude=-117.33&current=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature&timeformat=unixtime';
  const weather = 'https://api.open-meteo.com/v1/forecast?latitude=32.82&longitude=-117.27&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=mph&timeformat=unixtime';
  const [mr,wr,tr] = await Promise.allSettled([json(marine),json(weather),snapshot('tides')]);
  let available = 0;
  for (const key of ['swell','wind','tide','water']) { text(key,'—'); text(key+'Detail','Data unavailable'); signal(key+'Signal','Unavailable'); }
  document.getElementById('swellCompass').innerHTML = '';
  document.getElementById('windCompass').innerHTML = '';
  if (mr.status === 'fulfilled' && recentModel(mr.value.current)) {
    const c = mr.value.current, hasSwell = finite(c.swell_wave_height);
    const h = hasSwell ? c.swell_wave_height : c.wave_height;
    const p = hasSwell ? c.swell_wave_period : c.wave_period;
    const d = hasSwell ? c.swell_wave_direction : c.wave_direction;
    text('swellLabel',hasSwell ? 'Offshore swell' : 'Offshore waves');
    if (finite(h) && h >= 0) {
      available++;
      text('swell',`${mToFt(h).toFixed(1)} ft`);
      text('swellDetail',[finite(p) ? `${p.toFixed(0)}s mean period` : '',finite(d) ? `from ${degToCardinal(d)} ${Math.round(d)}°` : '',`Model ${localTime(c.time*1000)} PT`].filter(Boolean).join(' · '));
      signal('swellSignal',...swellCue(mToFt(h),p));
      document.getElementById('swellCompass').innerHTML = directionArrow(d);
    }
    if (finite(c.sea_surface_temperature)) {
      available++;
      const f = c.sea_surface_temperature * 9/5 + 32;
      text('water',`${Math.round(f)}°F`); text('waterDetail','Modeled surface temperature');
      signal('waterSignal',f < 60 ? 'Cold water' : f < 66 ? 'Cool water' : 'Milder water');
    }
  }
  if (wr.status === 'fulfilled' && recentModel(wr.value.current)) {
    const c = wr.value.current;
    if (finite(c.wind_speed_10m) && c.wind_speed_10m >= 0) {
      available++;
      text('wind',`${Math.round(c.wind_speed_10m)} mph`);
      text('windDetail',[finite(c.wind_direction_10m) ? `from ${degToCardinal(c.wind_direction_10m)} ${Math.round(c.wind_direction_10m)}°` : '',finite(c.wind_gusts_10m) ? `gusts ${Math.round(c.wind_gusts_10m)} mph` : ''].filter(Boolean).join(' · '));
      const cue = windCue(c.wind_speed_10m,c.wind_direction_10m,c.wind_gusts_10m);
      signal('windSignal',cue[0],cue[1]);
      document.getElementById('windCompass').innerHTML = directionArrow(c.wind_direction_10m);
    }
  }
  if (tr.status === 'fulfilled' && tr.value.timeZone === 'UTC' && Array.isArray(tr.value.predictions)) {
    const next = tr.value.predictions.map(p => ({time:new Date(p.t.replace(' ','T')+'Z'),value:Number(p.v),type:p.type})).filter(t => finite(t.time.getTime()) && finite(t.value) && ['H','L'].includes(t.type)).sort((a,b)=>a.time-b.time).find(t=>t.time>=new Date());
    if (next) {
      available++;
      const high = next.type === 'H';
      text('tide',`${next.value.toFixed(1)} ft`);
      text('tideDetail',`${high?'High':'Low'} at ${localTime(next.time)} PT · San Diego`);
      signal('tideSignal',high?'↗ Rising toward high':'↘ Falling toward low');
    }
  }
  text('updated',`${available === 4 ? 'Conditions' : available ? 'Some conditions unavailable' : 'Conditions unavailable'} · checked ${localTime(Date.now())} PT`);
}
function waveTime(w, now = Date.now()) {
  if (!/^\d{2}\/\d{2}$/.test(w?.date || '') || !/^\d{1,2}:\d{2}$/.test(w?.timeUTC || '')) return NaN;
  const [m,d] = w.date.split('/').map(Number), [h,min] = w.timeUTC.split(':').map(Number);
  if (m<1 || m>12 || d<1 || d>31 || h>23 || min>59) return NaN;
  const year = new Date(now).getUTCFullYear();
  return [year-1,year,year+1].map(y=>Date.UTC(y,m-1,d,h,min)).sort((a,b)=>Math.abs(a-now)-Math.abs(b-now))[0];
}
function freshWave(w, now = Date.now()) {
  const age = now-waveTime(w,now);
  return finite(w?.hsFt) && w.hsFt>=0 && finite(w?.tpS) && w.tpS>0 && age>=-3600000 && age<=3*3600000;
}
async function loadWaves() {
  try {
    const data = await snapshot('waves');
    const now = Date.now();
    document.querySelectorAll('.wave[data-mop]').forEach(el => {
      const w = data.spots?.[el.dataset.mop];
      el.replaceChildren();
      if (!w || !finite(w.hsFt) || !finite(w.tpS) || w.hsFt < 0 || w.tpS <= 0) {
        el.textContent = '—';
        return;
      }
      const value = document.createElement('span');
      value.textContent = `${w.hsFt.toFixed(1)} ft · ${Math.round(w.tpS)}s${finite(w.direction) ? ' · ' + degToCardinal(w.direction) : ''}`;
      el.append(value);
      if (!freshWave(w, now)) {
        const stale = document.createElement('span');
        stale.className = 'signal mixed';
        stale.textContent = 'stale';
        el.append(stale);
      }
      el.title = `${w.date} ${w.timeUTC} UTC`;
    });
  } catch {
    document.querySelectorAll('.wave').forEach(el => { el.textContent = '—'; });
  }
}
if (typeof document !== 'undefined') {
  loadConditions(); loadWaves();
  setInterval(loadConditions,15*60*1000); setInterval(loadWaves,10*60*1000);
}
if (typeof module !== 'undefined') module.exports={swellCue,windCue,directionArrow,waveTime,freshWave,degToCardinal};
