# Changelog

All notable changes to Cyberine Session Switcher. Versions follow `version` in `.claude-plugin/plugin.json`.

## [0.1.0] - 2026-10-03

- `/switch` opens a pane that lists every Claude Code session from `claude agents --json` and Claude Code's background job folder, grouped by project and collapsed by default, newest first, with state, memory and last activity per session and per project.
- Search by session name, a bare number or a session id prefix; `/switch <query>` opens filtered, and a single hit opens straight on the resume confirmation.
- Resume runs `/resume <id>` in the current session after a confirmation.
- Stop and Delete for one session or a whole project, each behind a confirmation that lists targets, skipped sessions with reasons, warnings and the memory they hold. Background sessions go through `claude stop` and `claude rm`; an interactive session in its own tmux session has that tmux session killed, any other gets SIGTERM.
- Group actions skip the current session, interactive sessions, working sessions and the successor of an unfinished relay.
- Ten rows a page with `n` and `p`; opening a project scrolls it to the top; a short docked pane folds the tools row into letter keys.
