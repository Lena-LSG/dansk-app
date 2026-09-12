# Security Policy

## Supported versions

This is a personal project distributed only as source; there is no versioned release channel with backported fixes. Security fixes are applied to the `main` branch, and users are expected to rebuild from `main` to receive them.

## Reporting a vulnerability

Please report suspected security vulnerabilities using **GitHub's private vulnerability reporting** feature on this repository, rather than opening a public issue:

1. Go to the **Security** tab of this repository.
2. Select **Report a vulnerability**.
3. Describe the issue, the impact, and steps to reproduce it if known.

This keeps the report private between you and the maintainer until a fix is available. Please do not disclose the issue publicly (including in a public issue, pull request or discussion) until it has been resolved.

You should expect an initial response within a few days. This project has a single maintainer, so response and fix times will vary with availability rather than following a fixed service-level agreement.

## Scope

This repository contains the Android client. Relevant areas for security review include:

- Handling of the Supabase client configuration and environment variables (`src/supabase.js`, `.env.example`)
- Authentication and session handling, including the anonymous-to-registered account upgrade path (`src/db.js`)
- The local SQLite cache and sync queue, and what it stores on-device
- Any change that reads from or writes to Supabase tables

### Out of scope / by design

- The Supabase **anon/publishable key** embedded in the built app (via `EXPO_PUBLIC_SUPABASE_ANON_KEY`) is intended to be public. It is not a secret, and finding it in the compiled app or its bundle is not itself a vulnerability. Access to user data is controlled by Row Level Security policies on the Supabase project, not by keeping this key hidden. A report showing that a Row Level Security policy is missing, incorrect or bypassable is very much in scope and appreciated.
- The Supabase **service role key** is never used in this client and must never appear in this repository. If you find one, please report it immediately as a critical issue.

## Dependencies

Dependency vulnerabilities are monitored via GitHub Dependabot and `npm audit`, and are expected to be kept at zero known vulnerabilities on `main`. If `npm audit` reports an issue that has not been addressed, please open a normal issue rather than a private report, unless you believe it is actively exploitable in this app's usage of the dependency.
