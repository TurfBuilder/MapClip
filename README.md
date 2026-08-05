# MapClip
A free utility to help collect data from internet sources for use in canvassing.

## Install — Chrome

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → pick this folder.
3. Open https://www.google.com/maps, click a business.

## Install — Firefox

1. `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on**.
2. Pick `manifest.json` in this folder. (Temporary = gone on restart; sign via AMO for permanence.)

## What it does

- Adds a **+ Add to Turf list** button under the place title in the Maps sidebar, plus a floating panel (bottom right).
- On add, it scrapes **name**, **address**, and **plus code** from the sidebar.
- The plus code is decoded to raw **lat/lng** (Open Location Code, implemented in `olc.js` — no network calls). Short codes like `XR66+C2` are expanded using the coordinates in the page URL.
- Rows are stored in `localStorage` under key `turfbuilder_places`.
- **Download CSV** exports: `name, address, plus_code, latitude, longitude, coord_source, url, added_at`.

`coord_source` is `plus_code` when coords came from decoding, `url` when it fell back to the `!3d/!4d` coords in the page URL, `none` if neither was found.

## License
MIT — see [LICENSE](LICENSE).