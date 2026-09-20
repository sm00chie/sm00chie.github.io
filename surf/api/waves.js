export default async function handler(req, res) {
  try {
    const url = 'https://cdip.ucsd.edu/mops/?moplist=San_Diego_County&pub=public&xitem=pmtable';
    const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'sd-surf-cams/1.0' } });
    if (!r.ok) throw new Error(`CDIP ${r.status}`);
    const html = await r.text();

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ');

    const ids = ['D0405','D0453','D0502','D0513','D0618','D0655','D0683','D0722','D0768','D0843'];
    const out = {};

    for (const id of ids) {
      const i = text.indexOf(id);
      if (i < 0) continue;
      const chunk = text.slice(i, i + 220);
      // After site/location text, the summary row contains MM/DD HH:MM Hs(m) Tp(s) Dp(deg).
      const m = chunk.match(/(\d{2}\/\d{2})\s+(\d{1,2}:\d{2})\s+([0-9.]+)\s+([0-9.]+)\s+(\d{1,3})/);
      if (!m) continue;
      out[id] = {
        date: m[1],
        timeUTC: m[2],
        hsM: Number(m[3]),
        hsFt: Number(m[3]) * 3.28084,
        tpS: Number(m[4]),
        direction: Number(m[5])
      };
    }

    if (!Object.keys(out).length) throw new Error('No CDIP rows parsed');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    res.status(200).json({ source: 'CDIP MOP', spots: out });
  } catch (e) {
    res.status(502).json({ error: 'Wave data unavailable', detail: String(e?.message || e) });
  }
}

