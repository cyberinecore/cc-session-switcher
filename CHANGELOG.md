# Changelog

All notable changes to Cyberine Session Switcher. Versions follow `version` in `.claude-plugin/plugin.json`.

## [0.1.2] - 2026-10-03

- A background session that ran `/clear` is one row again. Its job was keyed by the conversation from before `/clear`, so it showed as a second, dead row with the same name, `/switch <name>` found two sessions, and resuming that row loaded the old conversation in a new process.
- The resume confirmation for a running background session says the session you are in moves to the background and keeps running.
- README says what happens to the session you resume from: moved to the background when the target is live, swapped in place otherwise; and that sessions no longer listed are still reachable with `claude --resume`.

## [0.1.1] - 2026-10-03

- The confirmation now takes the keyboard on its No button. Before, No on the confirmation that `/switch <query>` opens handed the keyboard back to the prompt.
- No returns the focus to the row it came from, with its actions shown. After a stop or delete the focus goes to the row if it is still listed, else to the search field.
- Tab on a confirmation stays on its buttons instead of moving to the pane's close mark, where `y` and `n` did nothing.
- The resume note is accurate per session: a running background session is attached to (one process, two windows), an interactive one open in another terminal would get a second process.
- The stop note promises `/switch` only for background sessions; a stopped interactive session leaves the list and comes back with `claude --resume`.

## [0.1.0] - 2026-10-03

- `/switch` opens a pane that lists every Claude Code session from `claude agents --json` and Claude Code's background job folder, grouped by project and collapsed by default, newest first, with state, memory and last activity per session and per project.
- Search by session name, a bare number or a session id prefix; `/switch <query>` opens filtered, and a single hit opens straight on the resume confirmation.
- Resume runs `/resume <id>` in the current session after a confirmation.
- Stop and Delete for one session or a whole project, each behind a confirmation that lists targets, skipped sessions with reasons, warnings and the memory they hold. Background sessions go through `claude stop` and `claude rm`; an interactive session in its own tmux session has that tmux session killed, any other gets SIGTERM.
- Group actions skip the current session, interactive sessions, working sessions and the successor of an unfinished relay.
- Ten rows a page with `n` and `p`; opening a project scrolls it to the top; a short docked pane folds the tools row into letter keys.
