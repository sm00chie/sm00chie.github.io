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
function compass(from) {
  if (!finite(from)) return '';
  const heading = ((from + 180) % 360 + 360) % 360;
  return `<svg class="compass" viewBox="0 0 64 64" role="img" aria-label="From ${degToCardinal(from)} ${Math.round(from)} degrees; traveling ${degToCardinal(heading)}"><circle cx="32" cy="33" r="22"/><text x="32" y="8" text-anchor="middle">N</text><text x="59" y="36" text-anchor="middle">E</text><text x="32" y="63" text-anchor="middle">S</text><text x="5" y="36" text-anchor="middle">W</text><path class="needle" d="M32 15 L39 30 L34 28 L34 49 L30 49 L30 28 L25 30 Z" transform="rotate(${heading} 32 33)"/></svg>`;
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
  try { return await json(base + name + '.json'); }
  catch { return await json('./data/' + name + '.json'); }
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
  text('windSummary','Wind data unavailable; use the cams to check local texture.');
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
      document.getElementById('swellCompass').innerHTML = compass(d);
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
      signal('windSignal',cue[0],cue[1]); text('windSummary',cue[2]);
      document.getElementById('windCompass').innerHTML = compass(c.wind_direction_10m);
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
function makePick(label, item) {
  const a = document.createElement('a'); a.className='pick'; a.href='#spot-'+item.id;
  for (const [tag,value] of [['small',label],['strong',item.name],['span',`${item.w.hsFt.toFixed(1)} ft · ${Math.round(item.w.tpS)}s peak${finite(item.w.direction)?' · from '+degToCardinal(item.w.direction):''}`]]) {
    const e=document.createElement(tag); e.textContent=value; a.append(e);
  }
  return a;
}
async function loadWaves() {
  const picks = document.getElementById('quickPicks'); picks.replaceChildren();
  text('waveUpdated','');
  try {
    const data = await snapshot('waves');
    const unique = new Map();
    const now = Date.now();
    document.querySelectorAll('.wave[data-mop]').forEach(el => {
      const id=el.dataset.mop, w=data.spots?.[id], row=el.closest('.camrow');
      row.removeAttribute('id'); el.replaceChildren();
      if (!w || !finite(w.hsFt) || !finite(w.tpS) || w.hsFt<0 || w.tpS<=0) { el.textContent='Unavailable'; return; }
      const fresh=freshWave(w,now);
      const values=document.createElement('div'); values.textContent=`${w.hsFt.toFixed(1)} ft · ${Math.round(w.tpS)}s`;
      el.append(values);
      if (finite(w.direction)) {
        const dir=document.createElement('div'), arrow=document.createElement('span');
        arrow.className='mini-arrow'; arrow.textContent='↑'; arrow.setAttribute('aria-hidden','true'); arrow.style.transform=`rotate(${(w.direction+180)%360}deg)`;
        dir.append(arrow,` from ${degToCardinal(w.direction)}`); el.append(dir);
      }
      const cue=fresh ? swellCue(w.hsFt,w.tpS) : ['Stale reading','mixed'];
      const badge=document.createElement('span'); badge.className='signal '+cue[1]; badge.textContent=cue[0]; el.append(badge);
      if (el.dataset.proxy) { const proxy=document.createElement('div'); proxy.className='source-time'; proxy.textContent=el.dataset.proxy; el.append(proxy); }
      el.title=`Nearshore model, not breaking height. ${w.date} ${w.timeUTC} UTC`;
      if (fresh && !unique.has(id)) { row.id='spot-'+id; unique.set(id,{id,w,name:row.querySelector('.camname').textContent}); }
    });
    let spots=[...unique.values()];
    // Avoid comparing readings from meaningfully different model times.
    const newest=Math.max(...spots.map(s=>waveTime(s.w,now)));
    spots=spots.filter(s=>newest-waveTime(s.w,now)<=3600000).sort((a,b)=>b.w.hsFt-a.w.hsFt);
    if (!spots.length) { picks.textContent='No fresh nearshore readings. Use the cameras below.'; return; }
    if (spots.length===1) picks.append(makePick('Available reading',spots[0]));
    else if (spots[0].w.hsFt-spots.at(-1).w.hsFt<0.3) { picks.append(makePick('Similar size across reporting spots',spots[0])); }
    else { picks.append(makePick('More size · check the cam',spots[0]),makePick('Less size · check the cam',spots.at(-1))); }
    const max=spots[0].w.hsFt;
    document.querySelectorAll('.wave[data-mop]').forEach(el=>{
      const w=data.spots?.[el.dataset.mop]; if(!freshWave(w,now) || !max) return;
      const bar=document.createElement('div'),fill=document.createElement('i');bar.className='wave-bar';bar.setAttribute('aria-hidden','true');fill.style.width=Math.min(100,w.hsFt/max*100)+'%';bar.append(fill);el.append(bar);
    });
    text('waveUpdated',`CDIP nearshore model · ${spots.length} distinct points · latest ${localTime(newest)} PT. Larger does not always mean better.`);
  } catch {
    picks.textContent='Nearshore readings unavailable. Use the cameras below.';
    document.querySelectorAll('.wave').forEach(el=>{el.textContent='Unavailable';});
  }
}
if (typeof document !== 'undefined') {
  loadConditions(); loadWaves();
  setInterval(loadConditions,15*60*1000); setInterval(loadWaves,10*60*1000);
}
if (typeof module !== 'undefined') module.exports={swellCue,windCue,compass,waveTime,freshWave,degToCardinal};
