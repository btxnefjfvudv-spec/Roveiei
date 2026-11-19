# Handoff: ROV sports-day OBS graphics

## What this is
OBS overlay graphics for a school ROV (Arena of Valor) sports-day match. The output goes from OBS to a big screen.
- `overlay.html`: the graphic, 1920×1080 with a transparent background. It has 4 scenes: `score` (scoreboard at the top), `break` (Starting Soon / Intermission / Thank You with a countdown), `winner` (champion screen) and `hidden`.
- `index.html`: the control dashboard. It shows a live preview of the overlay in an iframe and has controls for teams, scores, scenes, BO, game number and countdown.
- `assets/`: the school emblem and the ROV logo, background already removed. **The current design does not use them yet.**

Both pages are self-contained (the shared JS is inlined). The only external dependency is Google Fonts.

## How sync works
`index.html` writes the state to `localStorage` under the key `rov-sportday-state-v2`. It also posts the state on a `BroadcastChannel` with the same name. `overlay.html` listens to both and also polls every 500 ms. So **both pages must run in the same browser profile and on the same origin**. In OBS, that means the Browser Source and a Custom Browser Dock, both pointing at the same origin.

## Current status / the problem
- **Works:** both pages open fine in a normal browser, and sync works between two tabs (tested with Playwright).
- **Also works:** the user enabled GitHub Pages, and the site loads in a normal browser:
  - https://btxnefjfvudv-spec.github.io/Roveiei/obs/overlay.html
  - https://btxnefjfvudv-spec.github.io/Roveiei/obs/index.html
- **Broken:** in OBS on the user's Windows PC, the Browser Source and the Custom Browser Dock **both show blank**. That happened with the `file:///` URLs, and also with the GitHub Pages URLs.
- **Also broken:** files the user downloaded from chat would not open in Chrome either. The download may have been corrupt, so get fresh copies from git (branch `claude/eager-newton-e9kjae`, folder `obs/`).

## What to do locally
1. Check the OBS version and whether the browser plugin (obs-browser) is installed. Docks → Custom Browser Docks exists only when the plugin is present.
2. Try a simple page first. Add a Browser Source with the URL `https://example.com`.
   - If that is blank too, it's an OBS/CEF problem: GPU, hardware acceleration, or a missing plugin.
   - Try Settings → Advanced → turning off "Enable Browser Source Hardware Acceleration" (needs an OBS restart).
3. Check the Browser Source settings:
   - Width 1920, Height 1080.
   - "Local file" unchecked when using a URL.
   - Nothing hiding the source: it's visible, the transform isn't 0 size, it's above the game capture.
   - Default scene is `score`. The board is a small bar at the top centre on a transparent background, so on a black canvas it can look empty. Press "พัก" (Break) in the dock to get a full-screen scene that's easy to see.
4. If `file://` won't work, use the GitHub Pages URLs for both the source and the dock. Or serve the folder locally with `python -m http.server 8000` and use `http://localhost:8000/overlay.html` and `http://localhost:8000/index.html`.
5. Fallback if the dock won't sync: open the control page in OBS through Interact on the Browser Source. Or build one page that contains both and is interacted with in OBS.
6. To debug inside OBS, launch it with `--remote-debugging-port=9222`, then open `http://localhost:9222` in Chrome to see the console of the browser source.

## User preferences
- Thai speaker. Wants short, simple answers. Ask before acting. No step-by-step narration, one wrap-up at the end.
- Design: chose **minimal black-gold** (the current files) after trying royal-gold and flat-broadcast versions (see git history).
- Teams: SUKHOTHAI (abbr SKT, pink `#ec4f93`) vs CHIANG SAEN (abbr CSN, yellow `#f5c518`). The scoreboard shows the abbreviations; the break and winner screens show the full names. The next matchup isn't decided yet, and the names are editable in the dashboard.
- Possible follow-up: add the school emblem and ROV logo from `assets/` to the break and winner scenes.
