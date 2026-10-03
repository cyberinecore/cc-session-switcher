# Security policy

Cyberine Session Switcher stops, deletes and resumes Claude Code sessions, so a way to make it end a session, process or tmux session you did not confirm, act on a target other than the one the confirmation named, or read the content of a conversation or transcript is a security bug.

## Reporting

Report privately through GitHub's "Report a vulnerability" button on https://github.com/cyberinecore/cc-session-switcher/security, or by email to xinchao@nghia-pham.com. Please include the plugin version, the Claude Code version, the operating system, the steps involved (a minimal reproduction), what happened and what you expected. Do not open a public issue for an unfixed vulnerability.

## Scope

In scope: a session name, tmux session name, working directory or job file that makes the plugin signal a process other than the listed session, kill a tmux session that is not the session's own, run a program other than the ones `README.md` lists, or pass a shell-interpreted string to any of them; an action that runs without the confirmation; a group action that reaches a session it lists as skipped; and any read of a transcript's or a relay file's content.

Out of scope: what Claude Code's own `claude stop`, `claude rm` and `/resume` do once called, and Anthropic turning installed mods off remotely.
