# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) on a best-effort basis.

## [Unreleased]

### Added

- Repository governance documentation: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `ARCHITECTURE.md`, `LICENSE`, and GitHub issue/pull request templates.
- Tappable history entries with a per-question detail view of past quiz attempts.

### Fixed

- Weak Spots now uses each question's spaced-repetition due date instead of its lifetime wrong-answer count, so a question drops off the list once it has actually been rescheduled, rather than staying flagged indefinitely.
- Session persistence: the Supabase client now uses an AsyncStorage-backed session store, so signing in survives an app restart instead of silently falling back to an anonymous session.
- Supabase keepalive workflow: switched from querying the `streaks` table (which correctly denies the `anon` role access) to a dedicated, empty `_keepalive` table created for this purpose, so the health check no longer requires widening access to real user data.
- Several instances of an emoji and adjacent text sharing a single `Text` node, which could cause the text portion to fail to render on some devices; each is now a separate sibling element.
- Home screen header layout, to remove unintended empty space above the title.
- Results screen confetti emoji and share button text alignment.

### Changed

- Supabase client configuration moved to environment variables (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`); see `.env.example`.
- Mock Test and Exam Simulator mode descriptions now state explicitly which is untimed with explanations and which is timed without, to reduce ambiguity between the two.

## [2.0.0] - 2026-09-11

### Added

- Offline-first local cache: questions, progress and history are stored in SQLite via `expo-sqlite` and synced to Supabase through a deduplicated, idempotent sync queue, so the app is fully usable without a network connection.
- Email/password authentication, including upgrading an anonymous session to a registered account without losing local progress, matching the pattern already used by the companion web app.
- Supabase-backed question bank, replacing the previous bundled-only question set (the bundled set is retained as an offline cold-start fallback).

### Security

- Upgraded from Expo SDK 56 to SDK 57 (React Native 0.86), and applied targeted `npm` dependency overrides, closing all dependency vulnerabilities reported by `npm audit`.

### Fixed

- Category filter no longer resets incorrectly relative to the saved language preference on load.

## [1.0.0] - 2026-05-14

### Added

- Initial Supabase integration and a local SQLite schema skeleton.

### Changed

- Dependency updates addressing Dependabot alerts for `postcss` and `shell-quote`.

## [0.1.0] - 2026-04-07

### Added

- First working build, on Expo SDK 53 / React Native 0.79.2, with local progress tracking via AsyncStorage, the spaced-repetition weak-spot quiz mode, and the full question bank.
