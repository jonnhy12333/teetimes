# Releasing

Before pushing a user-facing update, update `src/releases.ts`.

- Put the newest release first.
- Group small related pushes into one entry per day; use a separate entry for a major release when helpful.
- Give every published revision a unique `id` so the unread indicator returns when an existing day's notes gain new changes.
- Describe visible changes in plain language; omit commit hashes and implementation details.
- Keep the history curated rather than mirroring every commit.
