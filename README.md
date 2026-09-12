# DANSK — Citizenship Test Prep

An offline-first Android app for practising the Danish citizenship test (Indfødsretsprøven), built with Expo and React Native. Progress is tracked locally with a spaced-repetition algorithm and synced to a Supabase backend when a connection is available.

This repository is a personal project and is not published on the Google Play Store. Anyone who wants to run it has to clone the repository and build it themselves, as described below.

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Development](#development)
- [Building a release APK](#building-a-release-apk)
- [Project structure](#project-structure)
- [Architecture](#architecture)
- [Security](#security)
- [Contributing](#contributing)
- [Licence](#licence)

## Features

- 120 questions covering history, government, geography, culture, rights and values, and current affairs
- Practice Quiz, Full Mock Test, Exam Simulator (45-minute timer), Weak Spots, and Flashcards modes
- Bilingual English/Danish interface
- Spaced-repetition progress tracking (SM-2) with per-category mastery
- Daily streak counter and full session history, including per-question review of past attempts
- Dark mode
- Offline-first: the question bank, progress and history are cached locally in SQLite and work fully without a network connection, syncing to Supabase in the background when one becomes available
- Email/password authentication with anonymous-to-registered account upgrade, so progress made before signing up is not lost

## Tech stack

- [Expo](https://expo.dev) / React Native (New Architecture)
- [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) for the local offline cache
- [Supabase](https://supabase.com) (Postgres, Auth, Row Level Security) as the backend
- Plain React state and hooks; no additional state management library

## Prerequisites

- [Node.js](https://nodejs.org) 20 or later
- An Android device or emulator, with [Android Studio](https://developer.android.com/studio) set up for local builds
- A Supabase project (see [Setup](#setup))

## Setup

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/Lena-LSG/dansk-app.git
   cd dansk-app
   npm install
   ```

2. Copy the environment template and fill in your own Supabase project values:

   ```bash
   cp .env.example .env
   ```

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
   ```

   Use the **anon/publishable** key here, never the service role key. The anon key is designed to be embedded in client applications and is safe to ship, provided Row Level Security is enabled on every table (it is, in the reference backend). See [Security](#security).

3. Your Supabase project needs the following tables, each with Row Level Security enabled: `questions` (public read), `progress`, `history` and `streaks` (each scoped to `auth.uid()`), and `_keepalive` (a single empty row, used only to stop the free-tier project pausing — see `.github/workflows/supabase-keepalive.yml`).

## Development

```bash
npm start
```

This starts the Metro bundler. Connect a device over USB with debugging enabled, forward the Metro port, and launch a debug build:

```bash
adb reverse tcp:8081 tcp:8081
npm run android
```

Changes to JavaScript hot-reload through Fast Refresh; changes to native configuration (`app.json`) require a rebuild.

## Building a release APK

For a standalone build that runs without a Metro connection:

```bash
npm run build:local
```

This compiles a release variant for all supported ABIs and installs it directly on a connected device. It takes considerably longer than a debug build (around 40 minutes on typical hardware) because it compiles native code from scratch, so it is worth doing only once a batch of changes is ready, not after every small fix.

## Project structure

```
App.js              Screens, navigation state and UI
src/
  supabase.js        Supabase client configuration
  db.js              SQLite schema, offline cache, sync queue, auth helpers
  storage.js         Spaced-repetition (SM-2) logic and public data API
  questions.js        Bundled fallback question set for offline cold start
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for a description of the offline-first sync design, the authentication model, and the spaced-repetition algorithm.

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability disclosure process. In short:

- No secrets are committed to this repository. `src/supabase.js` reads configuration from environment variables at build time; see `.env.example`.
- The Supabase anon key used by the app is intentionally public and relies on Row Level Security policies, not secrecy, to restrict access to user data.
- Dependencies are kept current and audited; see the badge and workflow status in the Actions tab.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before opening a pull request.

## Licence

Released under the [MIT Licence](LICENSE).
