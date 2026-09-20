export default async function handler(req, res) {
  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 36 * 60 * 60 * 1000);
    const fmt = d => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(d);
      const get = t => parts.find(p => p.type === t)?.value;
      return `${get('year')}${get('month')}${get('day')}`;
    };
    const url = new URL('https://api.tidesandcurrents.noaa.gov/api/prod/datagetter');
    url.search = new URLSearchParams({
      product: 'predictions',
      application: 'sd-surf-cams',
      begin_date: fmt(now),
      end_date: fmt(tomorrow),
      datum: 'MLLW',
      station: '9410170',
      time_zone: 'gmt',
      units: 'english',
      interval: 'hilo',
      format: 'json'
    }).toString();

    const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'sd-surf-cams/1.0' } });
    const text = await r.text();
    if (!r.ok) return res.status(r.status).send(text);
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.setHeader('Content-Type', 'application/json');
    const data = JSON.parse(text);
    if (!Array.isArray(data.predictions)) return res.status(502).json({error: 'tide_data_unavailable'});
    return res.status(200).json({...data, timeZone: 'UTC'});
  } catch (err) {
    return res.status(500).json({ error: 'tide_fetch_failed' });
  }
}

