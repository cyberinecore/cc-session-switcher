import type { SwitcherAction, SwitcherKind, SwitcherSession, SwitcherShow, SwitcherSort, SwitcherTmux } from '../types'

export type AgentRow = { sessionId: string; name: string | null; kind: string; status: string | null; cwd: string; pid: number; startedAt: number }
export type JobRow = { short: string; sessionId: string; name: string | null; state: string | null; cwd: string; updatedAt: number }

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

export function parseAgents(json: string): AgentRow[] {
  const raw: unknown = JSON.parse(json)
  if (!Array.isArray(raw)) return []
  const out: AgentRow[] = []
  for (const row of raw) {
    if (row === null || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const sessionId = str(r.sessionId)
    if (!sessionId) continue
    out.push({
      sessionId,
      name: str(r.name),
      kind: str(r.kind) ?? 'unknown',
      status: str(r.status),
      cwd: str(r.cwd) ?? '',
      pid: typeof r.pid === 'number' ? r.pid : 0,
      startedAt: toMs(r.startedAt),
    })
  }
  return out
}

function toMs(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return Number.isNaN(t) ? 0 : t
  }
  return 0
}

export function transcriptPath(configDir: string, cwd: string, sessionId: string): string {
  return `${configDir}/projects/${cwd.replace(/[^A-Za-z0-9]/g, '-')}/${sessionId}.jsonl`
}

export function parseJob(short: string, json: string): JobRow | null {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (raw === null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const sessionId = str(r.sessionId)
  if (!sessionId) return null
  return { short, sessionId, name: str(r.name), state: str(r.state), cwd: str(r.cwd) ?? '', updatedAt: toMs(r.updatedAt) }
}

export function projectOf(name: string, cwd: string): string {
  const m = /^(.+)_\d+$/.exec(name)
  if (m?.[1]) return m[1]
  const root = trimSlash(projectRoot(cwd))
  return root.slice(root.lastIndexOf('/') + 1) || 'unknown'
}

export type Extras = { activity?: ReadonlyMap<string, number>; tmux?: ReadonlyMap<number, SwitcherTmux>; relay?: ReadonlyMap<string, string> }

export function mergeSessions(agents: AgentRow[], jobs: JobRow[], selfId: string, rss: ReadonlyMap<number, number>, extras: Extras = {}): SwitcherSession[] {
  const activity = extras.activity ?? new Map<string, number>()
  const jobById = new Map(jobs.map(j => [j.sessionId, j]))
  const seen = new Set<string>()
  const out: SwitcherSession[] = []
  const add = (a: AgentRow | undefined, j: JobRow | undefined) => {
    const sessionId = a?.sessionId ?? j?.sessionId ?? ''
    if (sessionId === '' || seen.has(sessionId)) return
    seen.add(sessionId)
    const short = j?.short ?? sessionId.slice(0, 8)
    const name = a?.name ?? j?.name ?? short
    const cwd = a?.cwd || j?.cwd || ''
    const kind: SwitcherKind = j !== undefined || a?.kind === 'background' ? 'background' : 'interactive'
    const pid = a?.pid ?? 0
    out.push({
      sessionId,
      short,
      name,
      project: projectOf(name, cwd),
      cwd,
      kind,
      status: a?.status ?? null,
      jobState: j?.state ?? null,
      pid,
      isLive: a !== undefined && pid > 0,
      isSelf: sessionId === selfId,
      rssKb: rss.get(pid) ?? 0,
      lastActiveMs: Math.max(activity.get(sessionId) ?? 0, j?.updatedAt ?? 0, a?.startedAt ?? 0),
      tmux: pid > 0 ? extras.tmux?.get(pid) ?? null : null,
      relay: extras.relay?.get(name) ?? null,
    })
  }
  for (const a of agents) add(a, jobById.get(a.sessionId))
  for (const j of jobs) add(undefined, j)
  return out
}

export function parseRss(ps: string): Map<number, number> {
  const out = new Map<number, number>()
  for (const line of ps.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(line)
    if (m) out.set(Number(m[1]), Number(m[2]))
  }
  return out
}

export type Pane = { session: string; windows: number; panes: number; panePid: number; attached: boolean }

export function parsePanes(out: string): Pane[] {
  const panes: Pane[] = []
  for (const line of out.split('\n')) {
    const [session, windows, count, pid, attached] = line.split('\t')
    if (!session || !pid) continue
    panes.push({ session, windows: Number(windows), panes: Number(count), panePid: Number(pid), attached: Number(attached) > 0 })
  }
  return panes
}

export function parseParents(out: string): Map<number, number> {
  const parents = new Map<number, number>()
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(line)
    if (m) parents.set(Number(m[1]), Number(m[2]))
  }
  return parents
}

export function tmuxOf(pids: readonly number[], panes: Pane[], parents: ReadonlyMap<number, number>): Map<number, SwitcherTmux> {
  const byPanePid = new Map(panes.map(p => [p.panePid, p]))
  const out = new Map<number, SwitcherTmux>()
  for (const pid of pids) {
    let cur: number | undefined = pid
    for (let hops = 0; cur !== undefined && cur > 1 && hops < 12; hops++) {
      const pane = byPanePid.get(cur)
      if (pane) {
        out.set(pid, { name: pane.session, isSole: pane.windows === 1 && pane.panes === 1, isAttached: pane.attached })
        break
      }
      cur = parents.get(cur)
    }
  }
  return out
}

export type RelayEntry = { name: string; mtimeMs: number }

export function relaysFromListing(entries: readonly RelayEntry[], now: number, windowMs: number): Map<string, string> {
  const names = new Set(entries.map(e => e.name))
  const out = new Map<string, string>()
  for (const e of entries) {
    const m = /^baton-(.+)\.md$/.exec(e.name)
    const to = m?.[1]
    if (!to || to.endsWith('.answers') || now - e.mtimeMs > windowMs) continue
    if (names.has('baton-' + to + '.briefed.json')) continue
    out.set(to, 'relay to ' + to + ' is not briefed yet')
  }
  return out
}

export function isJobDirName(name: string): boolean {
  return /^[0-9a-f]{8}$/.test(name)
}

export function trimSlash(path: string): string {
  return path.replace(/\/+$/, '')
}

export function projectRoot(cwd: string): string {
  return cwd.replace(/\/\.claude\/worktrees\/.*$/, '')
}

export function isBusy(s: SwitcherSession): boolean {
  return s.status === 'busy' || s.jobState === 'working'
}

export function stateLabel(s: SwitcherSession): string {
  if (s.isLive) return s.status ?? s.jobState ?? 'live'
  return s.jobState ?? 'exited'
}

export function mb(kb: number): string {
  if (kb <= 0) return ''
  const m = kb / 1024
  return m >= 1024 ? `${(m / 1024).toFixed(1)}G` : `${Math.round(m)}M`
}

const norm = (s: string) => s.toLowerCase().replace(/[-_\s]+/g, '-')

export function matchSessions(sessions: SwitcherSession[], query: string): SwitcherSession[] {
  const q = norm(query.trim())
  if (q === '') return sessions
  const exact = sessions.filter(s => norm(s.name) === q || s.sessionId === query.trim() || s.short === q)
  if (exact.length > 0) return exact
  if (/^\d+$/.test(q)) {
    const bySuffix = sessions.filter(s => norm(s.name).endsWith(`-${q}`))
    if (bySuffix.length > 0) return bySuffix
  }
  if (q.length >= 6) {
    const byId = sessions.filter(s => s.sessionId.startsWith(q))
    if (byId.length > 0) return byId
  }
  return sessions.filter(s => norm(s.name).includes(q))
}

export type Group = { project: string; sessions: SwitcherSession[]; live: number; rssKb: number; lastActiveMs: number }

const byName = (a: SwitcherSession, b: SwitcherSession) => a.name.localeCompare(b.name, 'en', { numeric: true })

export function groupSessions(sessions: SwitcherSession[], sort: SwitcherSort): Group[] {
  const map = new Map<string, SwitcherSession[]>()
  for (const s of sessions) map.set(s.project, [...(map.get(s.project) ?? []), s])
  const inGroup = sort === 'recent'
    ? (a: SwitcherSession, b: SwitcherSession) => b.lastActiveMs - a.lastActiveMs || byName(a, b)
    : (a: SwitcherSession, b: SwitcherSession) => Number(b.isLive) - Number(a.isLive) || byName(a, b)
  const groups: Group[] = [...map.entries()].map(([project, list]) => ({
    project,
    sessions: [...list].sort(inGroup),
    live: list.filter(s => s.isLive).length,
    rssKb: list.reduce((n, s) => n + s.rssKb, 0),
    lastActiveMs: Math.max(0, ...list.map(s => s.lastActiveMs)),
  }))
  return groups.sort(sort === 'recent'
    ? (a, b) => b.lastActiveMs - a.lastActiveMs || a.project.localeCompare(b.project)
    : (a, b) => a.project.localeCompare(b.project))
}

export function ago(ms: number, now: number): string {
  if (ms <= 0) return ''
  const m = Math.max(0, Math.round((now - ms) / 60000))
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h`
  return `${Math.round(h / 24)}d`
}

export type Row = { type: 'group'; group: Group; isOpen: boolean } | { type: 'session'; session: SwitcherSession }

export function visibleRows(all: SwitcherSession[], opts: { query: string; show: SwitcherShow; expanded: readonly string[]; sort: SwitcherSort }): Row[] {
  const pool = opts.show === 'live' ? all.filter(s => s.isLive) : all
  const isSearching = opts.query.trim() !== ''
  const hits = matchSessions(pool, opts.query)
  const rows: Row[] = []
  for (const group of groupSessions(hits, opts.sort)) {
    const isOpen = isSearching || opts.expanded.includes(group.project)
    rows.push({ type: 'group', group, isOpen })
    if (isOpen) for (const session of group.sessions) rows.push({ type: 'session', session })
  }
  return rows
}

export function rowKey(row: Row): string {
  return row.type === 'group' ? `g:${row.group.project}` : `s:${row.session.sessionId}`
}

export type Plan = { targets: SwitcherSession[]; skipped: string[] }

export function planFor(action: SwitcherAction, sessions: SwitcherSession[], isGroup: boolean): Plan {
  const targets: SwitcherSession[] = []
  const skipped: string[] = []
  for (const s of sessions) {
    const why = refusal(action, s, isGroup)
    if (why) skipped.push(`${s.name}: ${why}`)
    else targets.push(s)
  }
  return { targets, skipped }
}

function refusal(action: SwitcherAction, s: SwitcherSession, isGroup: boolean): string | null {
  if (s.isSelf) return 'this session'
  if (action === 'resume') return null
  if (action === 'stop' && !s.isLive) return 'not running'
  if (action === 'delete' && s.kind === 'interactive' && !s.isLive) return 'not running'
  if (isGroup && s.kind === 'interactive') return 'interactive, stop it on its own row'
  if (isGroup && isBusy(s)) return 'working, stop it on its own row'
  if (isGroup && s.relay) return `${s.relay}, stop it on its own row`
  return null
}

export function warningsFor(action: SwitcherAction, targets: SwitcherSession[]): string[] {
  if (action === 'resume') return []
  const out: string[] = []
  for (const s of targets) {
    if (s.relay) out.push(`${s.name}: ${s.relay}; stopping it breaks the handoff`)
    if (s.tmux?.isAttached) out.push(`${s.name}: its tmux session ${s.tmux.name} is open in a terminal now`)
    if (s.kind === 'interactive' && s.tmux && !ownsTmux(s)) out.push(`${s.name}: runs inside tmux ${s.tmux.name}, which is not its own, so only Claude is ended and that tmux session stays`)
    if (isBusy(s)) out.push(`${s.name}: working now; its current turn is lost`)
  }
  return out
}

export function ownsTmux(s: SwitcherSession): boolean {
  return Boolean(s.tmux?.isSole && s.tmux.name === s.name.replace(/[.:]/g, '-'))
}

export function commandFor(action: Exclude<SwitcherAction, 'resume'>, s: SwitcherSession): string[] {
  if (s.kind === 'interactive' && ownsTmux(s)) return ['tmux', 'kill-session', '-t', `=${s.tmux?.name}`]
  if (s.kind === 'interactive') return ['kill', '-TERM', String(s.pid)]
  return ['claude', action === 'stop' ? 'stop' : 'rm', s.short]
}
