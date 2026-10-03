# Cyberine Session Switcher design record

Settled decisions, each with the reason. Change one only together with the user who made it.

## Name

- D1. Plugin and marketplace `cyberine-session-switcher`, display name Cyberine Session Switcher, repository `cyberinecore/cc-session-switcher`, following the Cyberine plugins (`cyberine-snippets`, `cyberine-devguard`, `cyberine-releaseguard`): a name made only of generic words is held at directory submission.
- D2. The command is `/switch`, short enough to type from muscle memory.

## Data sources

- D3. Live sessions come from `claude agents --json`, the documented interface. Background sessions that are not running come from `~/.claude/jobs/<id>/state.json`, read for five fields only, because no documented command lists them. Both are tolerant: a missing or changed field drops information, never the pane. A job that ran `/clear` keeps its first conversation in `sessionId` and the one it continues in `resumeSessionId`; `claude agents --json` reports the latter, so the job is keyed by `resumeSessionId` when present, keeping the job folder name as its short id. Keyed by `sessionId`, such a job showed as a second, dead row whose resume loaded the conversation from before `/clear`.
- D4. Last use is the modification time of the transcript file (`<config>/projects/<cwd with every non-alphanumeric character as ->/<session id>.jsonl`), falling back to the job's last update and the process start. The file is stat'ed, never opened: the directory policy forbids reading chat history.
- D5. An unfinished relay is detected from file names alone: `baton-<name>.md` newer than 48 hours with no `baton-<name>.briefed.json` beside it marks `<name>`. Reading the baton would name the predecessor too, but a baton is a conversation summary, which the directory policy forbids reading. The cost: the predecessor of a relay is not marked, and a relay whose successor wrote a briefed file with a question still open counts as finished.
- D6. Projects are grouped by the lineage base of a `<base>_<N>` session name, else by the repository folder name with any `.claude/worktrees/...` tail removed. Claude Code's own derived names end in `-<hex>` and so fall to the folder.

## Actions

- D7. Every stop, delete and resume opens a confirmation with No focused. Nothing ends a session from one key press.
- D8. An interactive session is ended by killing its tmux session only when it is the tmux session's sole pane and the tmux session carries the session's name (`ownsTmux`): that is the shape session launchers create. Any other interactive session gets SIGTERM on its own pid, so a person's shared tmux session or terminal is never closed.
- D9. Delete on an interactive session ends it like Stop (user decision 2026-10-03); its transcript stays for `claude --resume`.
- D10. Group stop and delete act only on background sessions that are not working, and skip the current session and unfinished relays, listing each skipped session with the reason. Ending a working or interactive session is a one-row decision.
- D11. Resume uses Claude Code's own `/resume <id>` through `$.command.run`, not a reimplementation.
- D18. The confirmation focuses No itself with `$.ui.focus` instead of relying on `autoFocus`, because `autoFocus` only acts when the pane takes the keyboard: without it the ring stayed on the vanished search field and No handed the keyboard back to the prompt. No returns the ring to its row; an action returns it to the row if still listed, else to the search field. Tab on the confirmation is redirected from the engine's close mark back to No.
- D19. Resuming a running background session attaches to it, observed live on Claude Code 2.1.288: one process, every window showing the same conversation, the transcript one chain. Only a live interactive session in another terminal gets a second process, and only that case is warned as such. The session the resume ran in is moved to the background as its own job when the target is live (the same path as the left-arrow shortcut); with a target that is not running, the conversation is swapped in place.

## Layout

- D12. A page is at most ten rows. An inline pane always draws a full page, padded with blank rows: the inline block grows to its content, so sizing the page from the body rows it reports locks the pane at its first, empty, height.
- D13. A docked pane sizes the page from its body rows; under eight spare rows it folds the tools row into letter keys (`f`, `o`, `l`, `e`) and drops the rule and hint line.
- D14. Opening a project scrolls its header to the top of the list, so its sessions are never pushed to the next page.
- D15. Default sort is most recent use; the choice is kept in the plugin store.

## Packaging

- D16. The hooks file holds no template literal and no regex with a `$` anchor, and interpolates no upper-case name, because the directory scanner loses track after them (lessons from `cyberine-snippets` and `cyberine-devguard`). Strings are built in `src/text.ts`.
- D17. The README images are drawn from SVG with sample session names, so no real project or session name ships.
