# Refresh the README screenshots

[← Back to MyLight](../README.md)

The six PNGs in `docs/images/` are real Chromium captures of the production app, using the fictional Meadow family. The banner is a hand-authored SVG. No personal household database or API mocks are used.

```sh
make build
npx playwright install chromium
npm run screenshots -- ./mylight
```

To use a system Chromium instead:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run screenshots -- ./mylight
```

The script starts the supplied executable on loopback port `3301`, creates a temporary data directory, completes owner setup through the API, and adds fictional events, tasks, meals, and lists. `SCREENSHOT_PORT` can select another unused port. It stops its server and removes the temporary household afterward.

Browser time is fixed to September 7, 2026 at 9:15 AM in America/Chicago. The viewport is 1600 × 1200. Screenshots include Today, the weekly calendar, Tasks, Meals, Lists, and the dark calendar. Review each PNG before committing it; these are documentation assets, not visual regression baselines.
