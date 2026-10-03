import type { SwitcherAction, SwitcherSession } from '../types'
import type { Row } from './core'
import { ago, mb, stateLabel } from './core'
import { CLOSED, fit, GONE, LIVE, OPEN } from './look'

const DOT = ' · '

export function rowParts(row: Row, width: number, now: number): { label: string; tail: string } {
  if (row.type === 'group') {
    const g = row.group
    const bits = [String(g.sessions.length)]
    if (g.live) bits.push(g.live + ' live')
    if (g.rssKb) bits.push(mb(g.rssKb))
    const when = ago(g.lastActiveMs, now)
    if (when) bits.push(when)
    const tail = bits.join(DOT)
    return { label: (row.isOpen ? OPEN : CLOSED) + fit(g.project, Math.max(8, width - tail.length - 6)), tail }
  }
  const s = row.session
  const kind = s.kind === 'interactive' ? (s.tmux ? 'tmux' : 'tty') : 'bg'
  const bits = [(s.relay ? 'relay ' : '') + kind, stateLabel(s)]
  if (s.rssKb) bits.push(mb(s.rssKb))
  const when = ago(s.lastActiveMs, now)
  if (when) bits.push(when)
  if (s.isSelf) bits.push('(here)')
  const tail = bits.join(' ')
  return { label: '  ' + (s.isLive ? LIVE : GONE) + ' ' + fit(s.name, Math.max(8, width - tail.length - 10)), tail }
}

export function verbOf(action: SwitcherAction): string {
  return action === 'resume' ? 'Resume' : action === 'stop' ? 'Stop' : 'Delete'
}

export function confirmHeading(action: SwitcherAction, scope: string, targets: SwitcherSession[]): string {
  const verb = verbOf(action)
  if (targets.length === 0) return 'Nothing to ' + verb.toLowerCase() + ' in ' + scope
  if (targets.length === 1) return verb + ' ' + (targets[0]?.name ?? '') + '?'
  return verb + ' ' + targets.length + ' sessions in ' + scope + '?'
}

export function targetLine(s: SwitcherSession): string {
  const bits = [s.kind, stateLabel(s)]
  if (s.rssKb) bits.push(mb(s.rssKb))
  return '  ' + (s.isLive ? LIVE : GONE) + ' ' + s.name + '  ' + bits.join(', ') + '  ' + s.short
}

export function confirmNote(action: SwitcherAction, ramKb: number): string {
  const base =
    action === 'resume'
      ? 'It replaces this conversation here. The session is still open elsewhere if it is live; both processes would then hold the same conversation.'
      : action === 'stop'
        ? 'Frees its memory. The conversation stays on disk: claude attach <id>, claude --resume or /switch resumes it. A background session is stopped with claude stop; an interactive one in its own tmux session has that tmux session killed, any other gets SIGTERM.'
        : 'A background session goes through claude rm: off the list, plus its Claude-created worktree when that has no uncommitted changes. An interactive one is ended like Stop, its own tmux session killed. The transcript stays for claude --resume.'
  return ramKb > 0 && action !== 'resume' ? base + ' About ' + mb(ramKb) + ' resident now.' : base
}

export function failureLine(name: string, out: string, exitCode: number): string {
  return name + ': ' + (out || 'exit ' + exitCode)
}

export function summaryLine(action: SwitcherAction, done: number, total: number, failed: string[], notes: string[]): string {
  const verb = action === 'stop' ? 'Stopped' : 'Deleted'
  return [verb + ' ' + done + '/' + total + '.', ...failed.map(f => 'failed ' + f), ...notes].join('  ')
}

export function hintLine(sessions: number, live: number, ramKb: number, isLoading: boolean, notice: string): string {
  let s = sessions + ' sessions, ' + live + ' live'
  if (ramKb) s += ', ' + mb(ramKb) + ' RAM'
  if (isLoading) s += ', refreshing'
  if (notice) s += '  ' + notice
  return s + '  Esc close  Tab move  Enter open/resume  on a row: 1-9 pick, r resume, s stop, x delete, n/p page'
}

export function rangeLabel(start: number, budget: number, total: number): string {
  return (total === 0 ? 0 : start + 1) + '-' + Math.min(start + budget, total) + '/' + total
}

export function lastLine(text: string): string {
  return text.trim().split('\n').filter(Boolean).pop() ?? ''
}

export function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}
