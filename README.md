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
- The address string is split into components (`parseAddress` in `content.js`) so the export matches the importer's schema.
- Rows are stored in `localStorage` under key `turfbuilder_places`.
- **Download CSV** exports exactly the supported columns, in order:

  `name, address_line_1, address_line_2, city, state_or_region, postal_code, country_code, latitude, longitude`

Latitude and longitude are always populated when a plus code or URL coordinate was available — that's what enables turf cutting. The other things we scrape (`plus_code`, `url`, `coord_source`, `added_at`) stay in `localStorage` and are deliberately kept out of the CSV so the importer doesn't choke on unknown columns.

`coord_source` (visible in `localStorage`, not the CSV) is `plus_code` when coords came from decoding, `url` when it fell back to the `!3d/!4d` coords in the page URL, `none` if neither was found.

### Address parsing

Splitting a one-line address is heuristic. US, Canadian, UK, Australian and most European formats are handled:

| Maps address | → |
| --- | --- |
| `1600 Amphitheatre Pkwy, Mountain View, CA 94043, United States` | L1 `1600 Amphitheatre Pkwy`, city `Mountain View`, region `CA`, postal `94043`, cc `US` |
| `2000 Market St, Fl 12, Philadelphia, PA 19103` | L1 `2000 Market St`, L2 `Fl 12`, city `Philadelphia`, region `PA`, postal `19103`, cc `US` |
| `290 Bremner Blvd, Toronto, ON M5V 3L9, Canada` | region `ON`, postal `M5V 3L9`, cc `CA` |
| `10 Downing St, London SW1A 2AA, United Kingdom` | city `London`, postal `SW1A 2AA`, cc `GB` (no region) |

A US-style `XX 12345` tail implies `country_code` `US` even when Maps omits the country, same for a Canadian postal pattern. Unrecognized country names leave `country_code` empty rather than guessing.

## License
MIT — see [LICENSE](LICENSE).