import type { EngineInterface as Engine, Register, RenderInput } from 'claude-code'

import type { SwitcherAction, SwitcherScreen, SwitcherSession, SwitcherShow, SwitcherSort } from '../types'
import { commandFor, isBusy, isJobDirName, matchSessions, mergeSessions, parseAgents, parseJob, parsePanes, parseParents, parseRss, planFor, projectRoot, relaysFromListing, rowKey, tmuxOf, transcriptPath, trimSlash, visibleRows, warningsFor } from '../src/core'
import type { JobRow, RelayEntry, Row } from '../src/core'
import { LOOK } from '../src/look'
import { clip, confirmHeading, confirmNote, failureLine, hintLine, lastLine, listedLine, rangeLabel, rowParts, summaryLine, targetLine, verbOf } from '../src/text'

const PANE = 'cc-session-switcher'
const COMMAND = 'switch'
const MAX_HOTKEYS = 9
const CONFIRM_NO = 'cancel'
const SEARCH = 'q'

const sessionsRef = { plugin: 'cyberine-session-switcher', key: 'sessions' } as const
const loadingRef = { plugin: 'cyberine-session-switcher', key: 'isLoading' } as const
const errorRef = { plugin: 'cyberine-session-switcher', key: 'error' } as const
const queryRef = { plugin: 'cyberine-session-switcher', key: 'query' } as const
const expandedRef = { plugin: 'cyberine-session-switcher', key: 'expanded' } as const
const focusedRef = { plugin: 'cyberine-session-switcher', key: 'focused' } as const
const screenRef = { plugin: 'cyberine-session-switcher', key: 'screen' } as const
const noticeRef = { plugin: 'cyberine-session-switcher', key: 'notice' } as const
const pageRef = { plugin: 'cyberine-session-switcher', key: 'page' } as const
const showRef = { plugin: 'cyberine-session-switcher', key: 'show' } as const
const busyRef = { plugin: 'cyberine-session-switcher', key: 'isBusy' } as const
const sortRef = { plugin: 'cyberine-session-switcher', key: 'sort' } as const
const SORT_KEY = 'sort'
const LIST_OVERHEAD = 6
const PAGE_ROWS = 10
const RELAY_WINDOW_MS = 48 * 3600 * 1000

async function configDir($: Engine): Promise<string> {
  const dir = await $.env.get('CLAUDE_CONFIG_DIR')
  if (dir) return trimSlash(dir)
  return ((await $.env.get('HOME')) ?? '') + '/.claude'
}

async function readJobs($: Engine): Promise<JobRow[]> {
  const root = (await configDir($)) + '/jobs'
  const entries = await $.fs.list(root).catch(() => [])
  const rows = await Promise.all(
    entries
      .filter(e => e.kind === 'dir' && isJobDirName(e.name))
      .map(async e => {
        const text = await $.fs.read(root + '/' + e.name + '/state.json').catch(() => null)
        return typeof text === 'string' ? parseJob(e.name, text) : null
      }),
  )
  return rows.filter((r): r is JobRow => r !== null)
}

async function readTmux($: Engine, pids: number[]) {
  if (pids.length === 0) return new Map()
  const panes = await $.process
    .run(['tmux', 'list-panes', '-a', '-F', '#{session_name}\t#{session_windows}\t#{window_panes}\t#{pane_pid}\t#{session_attached}'], { timeoutMs: 5000 })
    .catch(() => null)
  if (!panes || panes.exitCode !== 0) return new Map()
  const ps = await $.process.run(['ps', '-Ao', 'pid=,ppid='], { timeoutMs: 5000 }).catch(() => null)
  if (!ps) return new Map()
  return tmuxOf(pids, parsePanes(panes.stdout), parseParents(ps.stdout))
}

async function readRelays($: Engine, cwds: Iterable<string>): Promise<Map<string, string>> {
  const roots = new Set([...cwds].filter(Boolean).map(projectRoot))
  const notes = new Map<string, string>()
  const now = Date.now()
  await Promise.all(
    [...roots].map(async root => {
      const entries = await $.fs.list(root + '/.local/relay').catch(() => [])
      const files: RelayEntry[] = entries.filter(e => e.kind === 'file').map(e => ({ name: e.name, mtimeMs: e.mtimeMs }))
      for (const [name, note] of relaysFromListing(files, now, RELAY_WINDOW_MS)) notes.set(name, note)
    }),
  )
  return notes
}

async function loadSessions($: Engine): Promise<SwitcherSession[]> {
  const ran = await $.process.run(['claude', 'agents', '--json'], { timeoutMs: 15000 })
  if (ran.exitCode !== 0) throw new Error('claude agents --json exited ' + ran.exitCode + ': ' + ran.stderr.trim().slice(0, 200))
  const agents = parseAgents(ran.stdout)
  const jobs = await readJobs($)
  const pids = agents.map(a => a.pid).filter(p => p > 0)
  let rss = new Map<number, number>()
  if (pids.length > 0) {
    const ps = await $.process.run(['ps', '-o', 'pid=,rss=', '-p', pids.join(',')], { timeoutMs: 5000 }).catch(() => null)
    if (ps) rss = parseRss(ps.stdout)
  }
  const config = await configDir($)
  const candidates = new Map<string, Set<string>>()
  for (const r of [...agents, ...jobs]) if (r.cwd) candidates.set(r.sessionId, (candidates.get(r.sessionId) ?? new Set()).add(r.cwd))
  const activity = new Map<string, number>()
  await Promise.all(
    [...candidates.entries()].flatMap(([id, cwds]) =>
      [...cwds].map(async cwd => {
        const st = await $.fs.stat(transcriptPath(config, cwd, id)).catch(() => null)
        if (st && st.mtimeMs > (activity.get(id) ?? 0)) activity.set(id, st.mtimeMs)
      }),
    ),
  )
  const [tmux, relay] = await Promise.all([readTmux($, pids), readRelays($, [...agents, ...jobs].map(r => r.cwd))])
  return mergeSessions(agents, jobs, await $.session.id(), rss, { activity, tmux, relay })
}

async function refresh($: Engine): Promise<SwitcherSession[]> {
  await $.state.set(loadingRef, true)
  try {
    const list = await loadSessions($)
    await $.state.set(sessionsRef, list)
    await $.state.set(errorRef, '')
    return list
  } catch (err) {
    await $.state.set(errorRef, err instanceof Error ? err.message : String(err))
    return (await $.state.get(sessionsRef)).value ?? []
  } finally {
    await $.state.set(loadingRef, false)
  }
}

async function sortOf($: Engine): Promise<SwitcherSort> {
  const held = (await $.state.get(sortRef)).value
  if (held) return held
  const stored = await $.store.get(SORT_KEY).catch(() => undefined)
  return stored === 'name' ? 'name' : 'recent'
}

async function go($: Engine, screen: SwitcherScreen): Promise<void> {
  await $.state.set(screenRef, screen)
}

async function openPane($: Engine): Promise<void> {
  await $.ui.open({ id: PANE, title: 'Sessions', focus: true, closeOnEscape: true, rows: PAGE_ROWS + LIST_OVERHEAD })
}

async function ask($: Engine, action: SwitcherAction, scope: string, sessions: SwitcherSession[], isGroup: boolean, back: string | null): Promise<void> {
  const plan = planFor(action, sessions, isGroup)
  await go($, { screen: 'confirm', action, scope, ids: plan.targets.map(s => s.sessionId), skipped: plan.skipped, back })
  await $.ui.focus({ requestId: PANE, key: CONFIRM_NO }).catch(() => undefined)
}

async function runCommand($: Engine, args: string): Promise<string> {
  await go($, { screen: 'list' })
  await $.state.set(noticeRef, '')
  await $.state.set(queryRef, '')
  await $.state.set(pageRef, 0)
  await openPane($)
  const sessions = await refresh($)
  const err = (await $.state.get(errorRef)).value ?? ''
  if (err) return err
  const query = args.trim()
  if (query === '') return listedLine(sessions.filter(s => !s.isSelf).length)
  const hits = matchSessions(sessions, query)
  await $.state.set(queryRef, query)
  if (hits.length === 1) {
    const [target] = hits as [SwitcherSession]
    await ask($, 'resume', target.name, [target], false, 's:' + target.sessionId)
    return 'Confirm resuming ' + target.name + ' in the pane.'
  }
  return hits.length === 0 ? 'No session matches "' + query + '".' : hits.length + ' sessions match "' + query + '".'
}

async function execute($: Engine, action: SwitcherAction, ids: string[], back: string | null): Promise<void> {
  const all = (await $.state.get(sessionsRef)).value ?? []
  const targets = all.filter(s => ids.includes(s.sessionId))
  if (action === 'resume') {
    const [target] = targets
    await $.ui.close({ id: PANE })
    if (!target) return
    $.ui.toast('Resuming ' + target.name)
    void $.command.run({ command: 'resume', args: target.sessionId }).catch((err: unknown) => {
      $.ui.toast('Resume failed: ' + (err instanceof Error ? err.message : String(err)))
    })
    return
  }
  await $.state.set(busyRef, true)
  const failed: string[] = []
  const notes: string[] = []
  for (const s of targets) {
    const ran = await $.process.run(commandFor(action, s), { timeoutMs: 30000 }).catch((err: unknown) => ({
      exitCode: -1,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
    }))
    const out = lastLine(ran.stdout + '\n' + ran.stderr)
    if (ran.exitCode !== 0) failed.push(failureLine(s.name, out, ran.exitCode))
    else if (action === 'delete' && out.toLowerCase().includes('worktree')) notes.push(s.name + ': ' + out)
  }
  await $.state.set(busyRef, false)
  const summary = summaryLine(action, targets.length - failed.length, targets.length, failed, notes)
  $.ui.toast(clip(summary, 160))
  await $.state.set(noticeRef, summary)
  await go($, { screen: 'list' })
  const after = await refresh($)
  const isKept = back !== null && after.some(s => back === 's:' + s.sessionId || back === 'g:' + s.project)
  await $.state.set(focusedRef, isKept ? back : null)
  await $.ui.focus({ requestId: PANE, key: isKept && back ? back : SEARCH }).catch(() => undefined)
}

type PaneEvent = RenderInput<'Pane', 'terminal' | 'desktop' | 'vscode'>

async function renderConfirm($: Engine, e: PaneEvent, screen: Extract<SwitcherScreen, { screen: 'confirm' }>) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const all = (await $.state.get(sessionsRef)).value ?? []
  const isBusyNow = (await $.state.get(busyRef)).value ?? false
  const targets = all.filter(s => screen.ids.includes(s.sessionId))
  const verb = verbOf(screen.action)
  const back = () => {
    void (async () => {
      if (screen.back) await $.state.set(focusedRef, screen.back)
      await go($, { screen: 'list' })
      if (screen.back) await $.ui.focus({ requestId: PANE, key: screen.back }).catch(() => undefined)
    })()
  }
  const yes = () => { void execute($, screen.action, screen.ids, screen.back) }
  const shown = targets.slice(0, 8)
  const ram = targets.reduce((n, s) => n + s.rssKb, 0)
  return (
    <Box flexDirection="column">
      <Text key="h" {...LOOK.heading} wrap="wrap">
        {confirmHeading(screen.action, screen.scope, targets)}
      </Text>
      {shown.map(s => (
        <Text key={'t:' + s.sessionId} {...LOOK.meta} wrap="truncate-end">{targetLine(s)}</Text>
      ))}
      {targets.length > shown.length ? <Text key="more" {...LOOK.meta}>{'  +' + (targets.length - shown.length) + ' more'}</Text> : null}
      {screen.skipped.length > 0 ? <Text key="skip-h" {...LOOK.warn}>{'Skipped ' + screen.skipped.length + ':'}</Text> : null}
      {screen.skipped.slice(0, 6).map((s, i) => <Text key={'k' + i} {...LOOK.meta} wrap="truncate-end">{'  ' + s}</Text>)}
      {warningsFor(screen.action, targets).slice(0, 6).map((w, i) => <Text key={'w' + i} {...LOOK.warn} wrap="truncate-end">{'! ' + w}</Text>)}
      {targets.length > 0 ? <Text key="note" {...LOOK.meta} wrap="wrap">{confirmNote(screen.action, ram, targets)}</Text> : null}
      <Box key="acts" flexDirection="row" columnGap={2} marginTop={1}>
        {isBusyNow ? <Text key="busy" {...LOOK.warn}>Working...</Text> : null}
        <Button plain key={CONFIRM_NO} autoFocus hotkey="n" role="dismiss" onPress={back}>No</Button>
        {targets.length > 0 && !isBusyNow ? <Button plain key="confirm" hotkey="y" onPress={yes}>{'Yes, ' + verb.toLowerCase()}</Button> : null}
      </Box>
    </Box>
  )
}

async function renderList($: Engine, e: PaneEvent) {
  const { Box, Text, Button, Input } = $.ui.resolve(e)
  const all = (await $.state.get(sessionsRef)).value ?? []
  const isLoading = (await $.state.get(loadingRef)).value ?? false
  const error = (await $.state.get(errorRef)).value ?? ''
  const query = (await $.state.get(queryRef)).value ?? ''
  const expanded = (await $.state.get(expandedRef)).value ?? []
  const focused = (await $.state.get(focusedRef)).value ?? null
  const notice = (await $.state.get(noticeRef)).value ?? ''
  const show: SwitcherShow = (await $.state.get(showRef)).value ?? 'all'
  const page = (await $.state.get(pageRef)).value ?? 0
  const sort = await sortOf($)
  const now = Date.now()

  const rows = visibleRows(all, { query, show, expanded, sort })
  const cols = Math.max(30, e.props.bodyColumns || e.viewport?.columns || 80)
  const bodyRows = e.props.scroll?.bodyRows || e.viewport?.rows || 24
  const isDocked = e.props.placement === 'dock'
  const isCompact = isDocked && bodyRows - LIST_OVERHEAD < 8
  const budget = isDocked ? Math.max(3, Math.min(PAGE_ROWS, bodyRows - (isCompact ? 3 : LIST_OVERHEAD) - (error ? 1 : 0))) : PAGE_ROWS
  const maxStart = Math.max(0, rows.length - 1)
  const start = Math.max(0, Math.min(page, maxStart))
  const shown = rows.slice(start, start + budget)
  const focusedRow = rows.find(r => rowKey(r) === focused) ?? null

  const setQuery = (v: string) => {
    void $.state.set(queryRef, v)
    void $.state.set(pageRef, 0)
    void $.state.set(noticeRef, '')
  }
  const toggle = (project: string) => {
    const isOpening = !expanded.includes(project)
    void $.state.set(expandedRef, isOpening ? [...expanded, project] : expanded.filter(p => p !== project))
    const at = rows.findIndex(r => r.type === 'group' && r.group.project === project)
    if (isOpening && at >= 0) void $.state.set(pageRef, at)
  }
  const primary = (row: Row) => () => {
    if (row.type === 'group') toggle(row.group.project)
    else void ask($, 'resume', row.session.name, [row.session], false, rowKey(row))
  }
  const submitSearch = () => {
    const first = rows.find(r => r.type === 'session')
    if (first && first.type === 'session') void ask($, 'resume', first.session.name, [first.session], false, rowKey(first))
  }
  const act = (action: SwitcherAction) => () => {
    if (!focusedRow) return
    if (focusedRow.type === 'group') void ask($, action, focusedRow.group.project, focusedRow.group.sessions, true, rowKey(focusedRow))
    else void ask($, action, focusedRow.session.name, [focusedRow.session], false, rowKey(focusedRow))
  }
  const allOpen = rows.filter(r => r.type === 'group').every(r => r.type === 'group' && r.isOpen)
  const toggleAll = () => {
    const projects = rows.filter((r): r is Extract<Row, { type: 'group' }> => r.type === 'group').map(r => r.group.project)
    void $.state.set(expandedRef, allOpen ? [] : projects)
  }
  const turn = (delta: number) => () => { void $.state.set(pageRef, Math.max(0, Math.min(maxStart, start + delta * budget))) }
  const reload = () => { void (async () => { await $.state.set(noticeRef, ''); await refresh($) })() }
  const nextSort = () => {
    void (async () => {
      const next: SwitcherSort = sort === 'recent' ? 'name' : 'recent'
      await $.state.set(sortRef, next)
      await $.state.set(pageRef, 0)
      await $.store.set(SORT_KEY, next).catch(() => undefined)
    })()
  }
  const nextShow = () => { void $.state.set(showRef, show === 'all' ? 'live' : 'all'); void $.state.set(pageRef, 0) }

  const sessionCount = all.filter(s => !s.isSelf).length
  const liveCount = all.filter(s => s.isLive && !s.isSelf).length
  const liveRam = all.filter(s => s.isLive).reduce((n, s) => n + s.rssKb, 0)
  const isGroupFocus = focusedRow?.type === 'group'
  const busyHere = focusedRow?.type === 'session' && isBusy(focusedRow.session)

  return (
    <Box flexDirection="column" paddingRight={1}>
      <Input key={SEARCH} label="Search " autoFocus placeholder="session name, number or id" value={query} submitLabel="resume top hit" onInput={setQuery} onSubmit={submitSearch} />
      {error ? <Text key="err" {...LOOK.error} wrap="wrap">{error}</Text> : null}
      <Box key="rows" flexDirection="column" paddingLeft={1}>
        {isLoading && all.length === 0 ? <Text key="loading" {...LOOK.meta}>Reading sessions...</Text> : null}
        {!isLoading && rows.length === 0 ? <Text key="none" {...LOOK.meta}>{query ? 'No session matches "' + query + '".' : 'No sessions.'}</Text> : null}
        {shown.map((row, i) => {
          const key = rowKey(row)
          const { label, tail } = rowParts(row, cols - 4, now)
          const tailStyle = row.type === 'group' ? LOOK.accent : row.session.isLive ? LOOK.live : LOOK.meta
          return (
            <Box key={'row-' + key} flexDirection="row" columnGap={2}>
              <Box key={'l-' + key} flexGrow={1}>
                {i < MAX_HOTKEYS
                  ? <Button key={key} plain hotkey={String(i + 1)} onPress={primary(row)}>{label}</Button>
                  : <Button key={key} plain onPress={primary(row)}>{'   ' + label}</Button>}
              </Box>
              <Text key={'t-' + key} {...tailStyle} wrap="truncate-end">{tail}</Text>
            </Box>
          )
        })}
        {Array.from({ length: Math.max(0, budget - shown.length - (rows.length === 0 ? 1 : 0)) }, (_, i) => <Text key={'pad' + i}> </Text>)}
      </Box>
      {isCompact ? null : <Text key="rule" {...LOOK.rule}>{'─'.repeat(Math.max(8, cols - 2))}</Text>}
      {isCompact ? null : <Box key="tools" flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Button plain key="reload" onPress={reload}>[ Refresh ]</Button>
        <Button plain key="sort" onPress={nextSort}>{'[ Sort: ' + sort + ' ]'}</Button>
        <Button plain key="show" onPress={nextShow}>{'[ Show: ' + show + ' ]'}</Button>
        {query ? null : <Button plain key="expand" onPress={toggleAll}>{allOpen ? '[ Collapse all ]' : '[ Expand all ]'}</Button>}
      </Box>}
      <Box key="acts" flexDirection="row" columnGap={isCompact ? 1 : 2}>
        {focusedRow || isCompact ? null : <Text key="acts-none" {...LOOK.meta}>Tab to a row for r: Resume  s: Stop  x: Delete</Text>}
        {focusedRow?.type === 'session' && !focusedRow.session.isSelf ? <Button plain key="act-resume" hotkey="r" onPress={act('resume')}>Resume</Button> : null}
        {focusedRow ? <Button plain key="act-stop" hotkey="s" onPress={act('stop')}>{isGroupFocus ? 'Stop group' : 'Stop'}</Button> : null}
        {focusedRow ? <Button plain key="act-del" hotkey="x" onPress={act('delete')}>{isGroupFocus ? 'Delete group' : 'Delete'}</Button> : null}
        {isCompact ? <Button plain key="reload" hotkey="f" onPress={reload}>Refresh</Button> : null}
        {isCompact ? <Button plain key="sort" hotkey="o" onPress={nextSort}>{sort}</Button> : null}
        {isCompact ? <Button plain key="show" hotkey="l" onPress={nextShow}>{show}</Button> : null}
        {isCompact && !query ? <Button plain key="expand" hotkey="e" onPress={toggleAll}>{allOpen ? 'Collapse' : 'Expand'}</Button> : null}
        <Box key="acts-gap" flexGrow={1} />
        {start > 0 ? <Button plain key="prev" hotkey="p" onPress={turn(-1)}>Prev</Button> : null}
        <Text key="pg" {...LOOK.meta}>{rangeLabel(start, budget, rows.length)}</Text>
        {start + budget < rows.length ? <Button plain key="next" hotkey="n" onPress={turn(1)}>Next</Button> : null}
      </Box>
      {busyHere ? <Text key="busy-note" {...LOOK.warn} wrap="truncate-end">This session is working; stopping it interrupts that work.</Text> : null}
      {isCompact ? null : (
        <Text key="hint" {...LOOK.hint} wrap="truncate-end">
        {hintLine(sessionCount, liveCount, liveRam, isLoading, notice)}
      </Text>
      )}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Sessions by project: resume one here, stop or delete sessions and groups. /switch [name | number | id]',
    })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => ({ text: await runCommand($, e.args) }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)
      return <Text>The session switcher needs a keyboard surface; open it in the terminal or desktop app.</Text>
    }
    const screen = (await $.state.get(screenRef)).value ?? { screen: 'list' }
    return screen.screen === 'confirm' ? renderConfirm($, e, screen) : renderList($, e)
  })

  on('ui.focus', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const key = e.element ?? ''
    const screen = (await $.state.get(screenRef)).value
    if (screen?.screen === 'confirm' && key === '') return next({ ...e, element: CONFIRM_NO })
    if ((key.startsWith('g:') || key.startsWith('s:')) && (!screen || screen.screen === 'list')) await $.state.set(focusedRef, key)
    return next(e)
  })
}
