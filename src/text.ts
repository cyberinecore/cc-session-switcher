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

function resumeNote(targets: SwitcherSession[]): string {
  const s = targets[0]
  const head = 'It replaces this conversation here.'
  if (!s?.isLive) return head
  if (s.kind === 'background') return head + ' The background session keeps running: this terminal attaches to it, and the session you are in moves to the background, still running, until you stop it.'
  return head + ' It is still open in another terminal; both processes would then write to the same conversation. Stop it first if that matters.'
}

function stopNote(targets: SwitcherSession[]): string {
  const hasBg = targets.some(s => s.kind === 'background')
  const hasTty = targets.some(s => s.kind === 'interactive')
  const back = [hasBg ? 'a background session comes back with claude attach <id> or /switch' : '', hasTty ? 'an interactive one leaves this list and comes back with claude --resume' : ''].filter(Boolean).join('; ')
  return 'Frees its memory. The conversation stays on disk: ' + back + '. A background session is stopped with claude stop; an interactive one in its own tmux session has that tmux session killed, any other gets SIGTERM.'
}

export function confirmNote(action: SwitcherAction, ramKb: number, targets: SwitcherSession[]): string {
  const base =
    action === 'resume'
      ? resumeNote(targets)
      : action === 'stop'
        ? stopNote(targets)
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
