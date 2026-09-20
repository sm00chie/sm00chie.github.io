# SD Surf Cams

## GitHub Pages

The maintained app is hosted at https://tylerw.fyi/surf/ in the personal-site repository. No Vercel service is required.

- `index.html` and `insights.js`: dashboard, condition cues, and spot comparisons.
- `map.html` and the `*-test.html` pages: original map and camera experiments.
- `api/`: original data handlers, now reused by `scripts/refresh-data.mjs` under Node 22.
- `data/`: NOAA high/low predictions (explicit UTC) and CDIP nearshore snapshots.
Automatic refresh is pending approval. Run `node surf/scripts/refresh-data.mjs` to regenerate snapshots; commit the changed JSON files to publish new readings. The proposed scheduled workflow has not been installed.

The browser reads snapshots from the public repository's raw GitHub URL, with the deployed snapshot as a fallback. This avoids relying on a Pages rebuild after commits made by GITHUB_TOKEN. Old wave readings are visibly flagged and excluded from comparisons. Open-Meteo and webcam media load directly from their providers.

Wind labels assume a west-facing PB / La Jolla coast. Spot comparisons use fresh nearshore modeled heights at similar timestamps, not breaking-wave estimates or quality ratings. Nearby proxy points are identified in the list.
