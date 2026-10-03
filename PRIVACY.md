# Privacy policy

Cyberine Session Switcher is a Claude Code plugin that runs only on your computer. This policy covers the plugin as published from https://github.com/cyberinecore/cc-session-switcher.

## What it collects

Nothing. The plugin has no telemetry, makes no network requests, and sends no data to its author, to Anthropic, or to anyone else.

## What it reads locally

- The session list that `claude agents --json` prints: each session's id, name, kind, status, working directory and process id.
- For each background session, five fields of Claude Code's job state file (`~/.claude/jobs/<id>/state.json`): name, state, working directory, session id and last update time. Other fields in that file are not used.
- The modification time of each session's transcript file, to sort sessions by last use. It never opens a transcript.
- The names of the files in a project's `.local/relay/` folder, to notice an unfinished handoff. It never opens those files.
- Process ids, parent process ids and resident memory from `ps`, and the tmux session layout from `tmux list-panes`.
- The `HOME` and `CLAUDE_CONFIG_DIR` environment variables, only to find Claude Code's folder.

It never reads your conversation, a transcript's content, Claude's memory, chat history or conversation summaries.

## What it changes, only when you confirm

- Resume runs `/resume <session id>` in your current session.
- Stop and Delete run `claude stop`, `claude rm`, `tmux kill-session` or `kill -TERM` for the sessions the confirmation listed. `claude rm` is Claude Code's own command and may remove a worktree Claude created for that session, as Claude Code documents.

## What it stores, and for how long

In the plugin's own Claude Code store: your sort choice (most recent or name). It stays until you remove the plugin's store file. The plugin writes no other file.

## Children

Cyberine Session Switcher is a developer tool and is not directed at children under 18.

## Contact

Questions or concerns: open an issue at https://github.com/cyberinecore/cc-session-switcher/issues or email xinchao@nghia-pham.com. Security reports: see `SECURITY.md`.

## Changes

Changes to this policy are published in this file in the repository, with the history kept by git.
