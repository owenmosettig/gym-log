# Gym Log

A personal lift tracker. It's an installable web app (PWA) that works fully offline. All data is saved on your phone only (no accounts, no server).

## Install on iPhone
Open the site in **Safari**, then tap Share › **Add to Home Screen**.

## Back up your data
Settings › **Export data** › Save to Files (or iCloud Drive). To restore, Settings › **Import data** and pick the file.

## Publish a change
1. Bump `VERSION` in `sw.js` and `APP_VERSION` in `js/app.js` (e.g. 1.0.0 → 1.0.1).
2. Commit and push. GitHub Pages updates in about a minute.
3. On the phone, open the app. An **Update available** button appears; tap it.

If you add a new file, also add it to the `FILES` list in `sw.js`.

## Run locally
```
python3 -m http.server 8000
```
Then open http://localhost:8000.
