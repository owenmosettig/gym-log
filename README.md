# Gym Log

A personal lift tracker. It's an installable web app (PWA) that works fully offline. All data is saved on your phone only (no accounts, no server).

## Install on iPhone
Open the site in **Safari**, then tap Share › **Add to Home Screen**.

## Back up your data
Settings › **Export data** › Save to Files (or iCloud Drive). To restore, Settings › **Import data** and pick the file.

## Publish a change
1. Bump `VERSION` in `sw.js` and `APP_VERSION` in `js/app.js` (e.g. 1.0.0 → 1.0.1). If the stored data shape changes, bump `SCHEMA` in `js/store.js` and handle old data in `normalizeData`.
2. Commit and push. GitHub Pages updates in about a minute.
3. On the phone, open the app. The new version downloads and takes over by itself; tap **Update ready** (or reopen the app) to see it. Saved data is untouched.

If you add a new file, also add it to the `FILES` list in `sw.js`.

## Run locally
```
python3 -m http.server 8000
```
Then open http://localhost:8000.
