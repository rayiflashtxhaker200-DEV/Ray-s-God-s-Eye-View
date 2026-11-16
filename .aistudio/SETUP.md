# AI Studio setup

Use the repository's npm manifest and lockfile as the source of truth.

## Install

- Use Node.js 24.14 or later in the 24.x line, or Node.js 26.x.
- Run `npm ci` from the repository root.
- Do not install dependencies individually or replace `package-lock.json`.

## Run locally

Run `npm run dev -- --host 0.0.0.0 --port 3000` and open port 3000.
The Vite server provides both the app and its `/api/*` middleware routes.

This is not a static-only app: mobile remote control and data providers need
the Node.js server routes. Do not deploy only the generated `dist/` directory
to a static host if those features are required. Provider API keys are
optional for keyless startup; configure any required keys as server-side
environment secrets, never in client code.
