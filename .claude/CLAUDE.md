# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this repo is

`cyberine-session-switcher` (display name Cyberine Session Switcher): a Claude Code mod whose `/switch` pane lists every Claude Code session by project and resumes, stops or deletes them. Design record and every settled decision: `docs/DECISIONS.md`. Read it before changing behaviour.

## Commands

- Packaging rules: `npm test` (runs `node --test tests/*.test.mjs`).
- Unit and pane tests: `claude plugin test .` (runs `tests/*.test.tsx` against the engine). If it says the rollout switch was saved off, run any short `claude -p` once and retry.
- Validate: `claude plugin validate . --strict` and `claude plugin validate .claude-plugin/plugin.json --strict`. This file sits in `.claude/` because a root `CLAUDE.md` makes strict validation fail.
- Type-check: `tsc -p .` once the engine has laid `.claude-plugin/types/` (any session loading the mod with `--plugin-dir .`).

## Layout

- `hooks/register.tsx`: every hook and every function that touches `$`. The engine only follows `$` within this file. It holds no template literal and no regex with a `$` anchor, because the directory scanner misreads both (`tests/package.test.mjs` enforces it).
- `src/core.ts`: pure parsing, grouping, paging inputs, action planning and the argv of every command. `src/text.ts`: every string the pane draws. `src/look.ts`: colours and glyphs.
- `types/index.d.ts`: the `$.state` contract, keyed by the plugin name.
- `tests/switcher.test.tsx`: core and pane tests through the engine. `tests/package.test.mjs`: directory rules.

## Constraints

- Never read a transcript's content, Claude's memory or chat history (directory policy). Transcript files are only stat'ed for their modification time; relay files are only listed by name.
- Every program runs through `$.process.run` with a fixed argv and no shell. A stop or delete runs only from the confirmation's Yes.
- A tmux session is killed only when the session runs alone in a tmux session named after it (`ownsTmux` in `src/core.ts`); never widen that.
- Group actions skip the current session, interactive sessions, working sessions and unfinished relays; never widen that.
- No `userConfig` with `options` (directory Block), no `documentationUrl` or `supportUrl`, no top-level `bin/`, no lockfile.
- Bump `version` in `.claude-plugin/plugin.json` and add a dated `CHANGELOG.md` entry on every release.
