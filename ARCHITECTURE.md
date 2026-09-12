# Architecture

This document describes the offline-first sync design, the authentication model, and the spaced-repetition algorithm used by the app. It is intended for anyone modifying `src/db.js` or `src/storage.js`, where these concerns are implemented.

## Overview

SQLite (`expo-sqlite`) is the local source of truth for reads. Every write lands in SQLite first, which is instant and works offline, and is then queued for background sync to Supabase. `src/db.js` owns the SQLite schema, the sync queue, and authentication; `src/storage.js` contains the spaced-repetition maths and the public API the UI calls, and does not talk to Supabase directly.

```
UI (App.js)
   |
   v
storage.js  ── SM-2 scheduling, mastery, public data API
   |
   v
db.js       ── SQLite reads/writes, sync queue, auth
   |               |
   v               v
SQLite         Supabase (Postgres, Auth, RLS)
(on-device)    (source of truth once synced)
```

## Local schema

Five tables, created on first launch by `createTables()`:

| Table         | Purpose                                                             |
|---------------|----------------------------------------------------------------------|
| `progress`    | One row per question: SM-2 state (`n`, `ef`, `interval`, `due`), plus lifetime `wrong`/`seen` counters. |
| `history`     | Completed quiz attempts, stored as opaque JSON (`entry`) keyed by a client-generated id. |
| `meta`        | Small key/value store: streak count, last study date, and sync bookkeeping flags. |
| `sync_queue`  | Outbound writes not yet confirmed by Supabase, with retry state. |
| `questions`   | The question bank, cached locally so the app can start without a network connection. |

## Sync queue: idempotency

The queue is designed so that retrying a flush after a network failure, including one where the write actually succeeded remotely but the response was lost, can never corrupt state or duplicate an effect:

- **Progress writes** enqueue the *already-computed final SM-2 row*, never an instruction like "apply one more correct answer". `writeLocalProgress` computes the new `ef`/`interval`/`due` once in `storage.js`, writes that exact row locally, and queues that same row. Replaying it is a no-op upsert (`onConflict: 'user_id,question_id'`), not a double-application of the algorithm.
- **History writes** carry a client-generated id (`uuid()` in `db.js`) that is used as the upsert key remotely (`onConflict: 'id'`). Retrying an upsert with the same id cannot create a duplicate entry.
- **Streak writes** upsert on `user_id`, so the latest write always wins regardless of retries.

The `uuid()` helper deliberately does not use a cryptographically secure random source. It only needs to be unique per device for this purpose; it is never used for anything security-sensitive such as a session token or access credential.

## Flush behaviour

`flushSyncQueue()`:

1. Skips entirely if the device reports no network connection.
2. Resolves (or creates) the current user id; skips if that fails.
3. Processes up to 50 queued rows in order, each in its own try/catch.
4. On success, deletes the row from the queue.
5. On failure, increments the row's attempt count and schedules its next attempt using exponential backoff (5s, 30s, 2min, 15min, capped), then **stops the pass** rather than continuing to the next row — later rows are usually failing for the same reason (e.g. the device just went offline), so there is no point burning through the rest of the batch.

The flush is triggered opportunistically rather than on a fixed schedule: on every local write, when the app returns to the foreground, when the network state changes to connected, and as a periodic five-minute sweep in case neither of those fires during a long session.

## Initial hydration

A brand-new local database is empty, which would otherwise make an existing account's Supabase-side progress and history appear to have vanished the first time they use this device. `initialHydrate()` runs once (tracked via a `meta` flag) and pulls existing `progress`, `history` and `streaks` rows for the current user into the local cache before the app is considered ready. If this fails (offline on first launch, or no remote data yet), it is retried on the next app launch rather than being marked complete.

By design, this hydration only ever happens for **new logins on a given local database**, never as a way to merge two different histories together. Local progress made before signing up is preserved by the anonymous-to-registered upgrade path below, not by hydration.

## Question bank sync

Questions follow a cache-then-revalidate pattern shared with the web app: show whatever is cached locally immediately, refetch from Supabase in the background, and replace the local cache on success. The bundled fallback set in `src/questions.js` is only used to seed a genuinely cold start (empty local cache *and* no network) — after that, Supabase is the sole source of truth for question content, which matters for keeping current-affairs questions up to date.

## Identity switching

Signing in as a different account, or signing out (which starts a fresh anonymous session), means the local cache belongs to the wrong identity. `armIdentityWatcher()` detects a change in the authenticated user id, makes a best-effort attempt to flush whatever the previous identity still owed, then wipes local `progress`/`history`/`sync_queue` and re-runs initial hydration for the new identity.

## Authentication model

Every device starts with an anonymous Supabase session (`signInAnonymously`), so the app is fully functional, including sync, before the user ever creates an account. When a user signs up:

- If the current session is already anonymous, `signUpEmail` calls `supabase.auth.updateUser({ email, password })` to **upgrade the existing identity in place**, keeping the same user id. Progress already synced under the anonymous id therefore stays attached to the account rather than being lost or requiring a merge.
- If there is no existing session (or it is not anonymous), a normal `signUp` is used instead.

This means "sign up" and "upgrade an anonymous session" are the same code path from the user's perspective, and existing local/synced progress is preserved automatically for that case. Signing in with an *existing* account on a device that already has local anonymous progress is intentionally **not** merged — hydration replaces the local cache with that account's own remote data. This mirrors normal expectations: switching to an existing account should show that account's history, not blend in whatever a different, unauthenticated session on the same device happened to accumulate.

## Spaced repetition (SM-2)

`src/storage.js` implements a standard SM-2 scheduler. Each question's `progress` row tracks:

- `n` — repetition count
- `ef` — ease factor
- `interval` — days until next review
- `due` — timestamp of the next scheduled review
- `wrong` / `seen` — lifetime counters, used for mastery reporting, not scheduling

Two related but distinct concepts are derived from this state, and are easy to conflate:

- **Due for review**: `due <= now`. Used by the Weak Spots mode to decide which previously-missed questions to resurface. A question that was answered wrong once but has since been rescheduled further out is not "due" and should not still appear as weak.
- **Long-term mastery**: `ef >= 2.0 && interval >= 7`. A stricter bar used only for the mastery/progress reporting shown to the user, unrelated to what Weak Spots surfaces.

Weak Spots filters on `wrong > 0 && due <= now`, not on the mastery bar. Using the mastery bar here was tried and rejected: because it is stricter, most recently-answered questions stayed listed as weak immediately after being answered correctly, which is confusing. The due-date filter matches user expectations: a question you just answered leaves the "weak" list until SM-2 says it is actually due again.
