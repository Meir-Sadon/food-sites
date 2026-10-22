# Promo video generator

Builds the 9:16 "מרוויחים ביחד" promo video for any food site: real screens of the site, animated Hebrew captions, a synthesized music track. No external service is needed.

## Make a video for a site

1. Run the site (any `sites/<id>`; see the root `CLAUDE.md`) with open supply days so the order page works. Dish photos that fail to load are replaced by a neutral placeholder.
   `./setup-demo.sh` fills a local demo database (open days, delivery fee, badges, a dish that is almost out, a club member with a past order).
2. Record real clips of the site: `node capture-clips.mjs http://localhost:5000 out/clips` (admin user and password in `ADMIN_USER` / `ADMIN_PASS`, default `admin`/`admin`). For the delivery-zones clip set `Settings.DeliveryPricing='zones'` and draw zones first.
3. Render: `node render.mjs --name "<business name>" --clips out/clips --out out/promo.mp4`. It also writes `promo.srt` and `promo.narration.txt`; a recorded voice-over is mixed in with `--voice voice.mp3`.
   Options: `--phone`, `--contact` (defaults in `config.json`), `--fps 30`, `--workers 4`, `--only <seconds>` (writes one frame to `out/work/frame.png` for a quick look).

The business name is the only per-site text; screens come from the running site. The final slide has a dashed placeholder for a landing-page link or QR code (`.ph` in `video.html`).

Needs Playwright with Chromium (`PLAYWRIGHT_MODULE` points at it, `CHROMIUM` at the browser binary), `ffmpeg`, `python3` with `numpy`, and the Heebo fonts from `frontend/node_modules/@fontsource/heebo` (`--fonts` to change).

`music.py` writes the background track; scenes and caption timing are in `video.html` (`scene(start, end, ...)` and `say(start, end, text)`).
