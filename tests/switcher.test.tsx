import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import { commandFor, mergeSessions, parseAgents, parseJob, parsePanes, parseParents, planFor, projectOf, relaysFromListing, tmuxOf, visibleRows, warningsFor } from '../src/core'
import type { JobRow } from '../src/core'
import { confirmNote } from '../src/text'

const PANE = 'cc-session-switcher'
const SELF = 'cafe0000-0000-4000-8000-000000000000'

const AGENT_ROWS = [
  { pid: 13, cwd: '/w/web', kind: 'background', startedAt: 1, sessionId: SELF, name: 'web-app_181', status: 'busy' },
  { pid: 12, cwd: '/w/web', kind: 'interactive', startedAt: 1, sessionId: 'bbbbbbbb-2', name: 'web-app_177', status: 'idle' },
  { pid: 15, cwd: '/w/web', kind: 'background', startedAt: 1, sessionId: 'dddddddd-4', name: 'web-app_178', status: 'idle' },
  { pid: 16, cwd: '/w/web', kind: 'background', startedAt: 1, sessionId: 'eeeeeeee-5', name: 'web-app_179', status: 'busy' },
  { pid: 11, cwd: '/w/worker', kind: 'background', startedAt: 1, sessionId: 'aaaaaaaa-1', name: 'worker_3', status: 'busy' },
]
const AGENTS = JSON.stringify(AGENT_ROWS)

const JOBS: Record<string, object> = {
  cafe0000: { sessionId: SELF, name: 'web-app_181', state: 'working', cwd: '/w/web' },
  dddddddd: { sessionId: 'dddddddd-4', name: 'web-app_178', state: 'blocked', cwd: '/w/web' },
  eeeeeeee: { sessionId: 'eeeeeeee-5', name: 'web-app_179', state: 'working', cwd: '/w/web' },
  aaaaaaaa: { sessionId: 'aaaaaaaa-1', name: 'worker_3', state: 'working', cwd: '/w/worker' },
  ffffffff: { sessionId: 'ffffffff-6', name: 'web-app_170', state: 'done', cwd: '/w/web' },
}

type WorldOpts = { panes?: string; ps?: string; relay?: Record<string, string> }

const world = (on: On, mtimes: Record<string, number> = {}, opts: WorldOpts = {}) => {
  const ran: string[][] = []
  const resumed: string[] = []
  mock.env(on, { HOME: '/h' })
  on('session.id', () => ({ value: SELF }))
  on('session.cwd', () => ({ value: '/w/web' }))
  on('fs.list', ($, e) => {
    if (e.path === '/w/web/.local/relay' && opts.relay) {
      return { value: Object.keys(opts.relay).map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: Date.now(), isLink: false })) }
    }
    if (e.path !== '/h/.claude/jobs') return { deny: `ENOENT ${e.path}` }
    return { value: Object.keys(JOBS).map(name => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })) }
  })
  on('fs.read', ($, e) => {
    const relayFile = /^\/w\/dot\/\.local\/relay\/(.+)$/.exec(e.path)?.[1]
    if (relayFile !== undefined) {
      const text = opts.relay?.[relayFile]
      return text === undefined ? { deny: `ENOENT ${e.path}` } : { value: text }
    }
    const m = /^\/h\/\.claude\/jobs\/([0-9a-f]{8})\/state\.json$/.exec(e.path)
    const job = m ? JOBS[m[1] ?? ''] : undefined
    return job ? { value: JSON.stringify(job) } : { deny: `ENOENT ${e.path}` }
  })
  on('fs.stat', ($, e) => {
    const id = /\/([^/]+)\.jsonl$/.exec(e.path)?.[1] ?? ''
    const mtimeMs = mtimes[id]
    return mtimeMs === undefined ? { deny: `ENOENT ${e.path}` } : { value: { kind: 'file' as const, size: 1, mtimeMs, isLink: false } }
  })
  on('process.run', ($, e) => {
    ran.push([...e.argv])
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (e.argv[0] === 'claude' && e.argv[1] === 'agents') return ok(AGENTS)
    if (e.argv[0] === 'tmux') return ok(opts.panes ?? '')
    if (e.argv[0] === 'ps' && e.argv[1] === '-Ao') return ok(opts.ps ?? '')
    if (e.argv[0] === 'ps') return ok('   12  512000\n   15  204800\n   16 1048576\n   13  300000\n   11  100000\n')
    return ok('')
  })
  on('command.run', { command: 'resume' }, ($, e) => {
    resumed.push(e.args)
    return {}
  })
  const opened: unknown[] = []
  on('ui.open', ($, e) => { opened.push(e.rows); return { value: { isPlaced: true as const } } })
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.focus', () => ({}))
  return { ran, resumed, opened, actions: () => ran.filter(a => a[0] === 'kill' || (a[0] === 'tmux' && a[1] === 'kill-session') || (a[0] === 'claude' && a[1] !== 'agents')) }
}

const PANE_PROPS = {
  title: 'Sessions',
  isFocused: true,
  bodyColumns: 80,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
}
const VIEWPORT = { columns: 100, rows: 40 }

const run = (args: string) => ({
  command: 'switch',
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: true, columns: 120 },
})

const mountPane = ($: Parameters<TestBody>[0], bodyRows = 30, placement: 'dock' | 'inline' = 'dock') =>
  $.ui.mount({ plugin: 'cyberine-session-switcher', surface: 'terminal', component: 'Pane', requestId: PANE, props: { ...PANE_PROPS, placement, scroll: { offset: 0, bodyRows } }, viewport: VIEWPORT })

const buttonKeys = async (ui: Awaited<ReturnType<typeof mountPane>>) => (await ui.findAll({ type: 'Button' })).map(b => b.key ?? '')

const focusOn = (element: string) => ({ component: 'Pane' as const, requestId: PANE, element, origin: { kind: 'person' as const } })

const sample = () => {
  const jobs = Object.entries(JOBS).map(([short, j]) => parseJob(short, JSON.stringify(j))).filter((j): j is JobRow => j !== null)
  return mergeSessions(parseAgents(AGENTS), jobs, SELF, new Map([[12, 512000]]))
}

describe('core', () => {
  test('a session name groups by its prefix, a nameless one by its repo root', async () => {
    expect(projectOf('web-app_181', '/w/x')).toBe('web-app')
    expect(projectOf('', '/w/repo/.claude/worktrees/feat-a')).toBe('repo')
  })

  test('a job with no running process is listed as background and not live', async () => {
    const s = sample()
    const done = s.find(x => x.name === 'web-app_170')
    expect(done?.isLive).toBe(false)
    expect(done?.kind).toBe('background')
    expect(s.find(x => x.name === 'web-app_177')?.kind).toBe('interactive')
    expect(s.find(x => x.name === 'web-app_181')?.isSelf).toBe(true)
  })

  test('groups start collapsed and a search opens the groups it hits', async () => {
    const s = sample()
    const closed = visibleRows(s, { query: '', show: 'all', expanded: [], sort: 'recent' })
    expect(closed.map(r => r.type)).toEqual(['group', 'group'])
    expect(closed[0]?.type === 'group' && closed[0].group.project).toBe('web-app')
    const searched = visibleRows(s, { query: '177', show: 'all', expanded: [], sort: 'recent' })
    expect(searched.filter(r => r.type === 'session').map(r => r.type === 'session' && r.session.name)).toEqual(['web-app_177'])
  })

  test('a group stop skips this session, interactive and working ones', async () => {
    const s = sample().filter(x => x.project === 'web-app')
    const plan = planFor('stop', s, true)
    expect(plan.targets.map(x => x.name)).toEqual(['web-app_178'])
    expect(plan.skipped.join(' | ')).toMatch(/web-app_181: this session/)
    expect(plan.skipped.join(' | ')).toMatch(/web-app_177: interactive/)
    expect(plan.skipped.join(' | ')).toMatch(/web-app_179: working/)
    expect(plan.skipped.join(' | ')).toMatch(/web-app_170: not running/)
  })
})

describe('tmux and relay', () => {
  const panes = parsePanes('web-app_177\t1\t1\t500\t1\nws\t2\t3\t600\t0\n')
  const parents = parseParents('  12   500\n  500  1\n  15  77\n  77  600\n')

  test('a session is matched to the tmux pane it runs under, through its parents', async () => {
    const map = tmuxOf([12, 15, 99], panes, parents)
    expect(map.get(12)).toEqual({ name: 'web-app_177', isSole: true, isAttached: true })
    expect(map.get(15)).toEqual({ name: 'ws', isSole: false, isAttached: false })
    expect(map.has(99)).toBe(false)
  })

  test('stop kills a sole tmux session but only signals Claude in a shared one', async () => {
    const base = sample().find(s => s.name === 'web-app_177')!
    expect(commandFor('stop', { ...base, tmux: { name: 'web-app_177', isSole: true, isAttached: false } })).toEqual(['tmux', 'kill-session', '-t', '=web-app_177'])
    expect(commandFor('stop', { ...base, tmux: { name: 'ws', isSole: false, isAttached: false } })).toEqual(['kill', '-TERM', '12'])
    expect(commandFor('stop', { ...base, tmux: { name: 'main', isSole: true, isAttached: false } })).toEqual(['kill', '-TERM', '12'])
  })

  test('a relay counts as in flight from file names alone, until its briefed file exists', async () => {
    const now = 10_000_000
    const listing = [
      { name: 'baton-web-app_178.md', mtimeMs: now },
      { name: 'baton-web-app_171.md', mtimeMs: now },
      { name: 'baton-web-app_171.briefed.json', mtimeMs: now },
      { name: 'baton-web-app_90.md', mtimeMs: 0 },
      { name: 'baton-web-app_178.answers.md', mtimeMs: now },
    ]
    const relays = relaysFromListing(listing, now, 3600 * 1000)
    expect([...relays.keys()]).toEqual(['web-app_178'])
    const s = sample().map(x => (x.name === 'web-app_178' ? { ...x, relay: relays.get('web-app_178') ?? null } : x)).filter(x => x.project === 'web-app')
    expect(planFor('stop', s, true).targets).toEqual([])
    expect(warningsFor('stop', s.filter(x => x.name === 'web-app_178')).join(' ')).toMatch(/breaks the handoff/)
  })
  test('a job that ran /clear is one row under the conversation it continues', async () => {
    const job = parseJob('99999999', JSON.stringify({ sessionId: '99999999-old', resumeSessionId: '77777777-new', name: 'api_4', state: 'working', cwd: '/w/api', updatedAt: 5 }))
    expect(job?.sessionId).toBe('77777777-new')
    expect(job?.short).toBe('99999999')
    const agents = parseAgents(JSON.stringify([{ pid: 40, cwd: '/w/api', kind: 'background', startedAt: 1, sessionId: '77777777-new', name: 'api_4', status: 'idle' }]))
    const merged = mergeSessions(agents, job ? [job] : [], SELF, new Map())
    expect(merged.map(x => [x.name, x.sessionId, x.short, x.isLive, x.jobState])).toEqual([['api_4', '77777777-new', '99999999', true, 'working']])
    expect(commandFor('stop', merged[0]!)).toEqual(['claude', 'stop', '99999999'])
  })

  test('the resume note says a live background session is attached to, a live terminal one doubled', async () => {
    const s = sample()
    const bg = s.filter(x => x.name === 'web-app_178')
    const tty = s.filter(x => x.name === 'web-app_177')
    const done = s.filter(x => x.name === 'web-app_170')
    expect(confirmNote('resume', 0, bg)).toMatch(/attaches to it, and the session you are in moves to the background/)
    expect(confirmNote('resume', 0, tty)).toMatch(/both processes would then write/)
    expect(confirmNote('resume', 0, done)).toBe('It replaces this conversation here.')
  })

  test('the stop note promises /switch only for background sessions', async () => {
    const s = sample()
    const bg = s.filter(x => x.name === 'web-app_178')
    const tty = s.filter(x => x.name === 'web-app_177')
    expect(confirmNote('stop', 0, bg)).toMatch(/claude attach <id> or \/switch/)
    expect(confirmNote('stop', 0, bg)).not.toMatch(/leaves this list/)
    expect(confirmNote('stop', 0, tty)).toMatch(/leaves this list and comes back with claude --resume/)
    expect(confirmNote('stop', 0, tty)).not.toMatch(/\/switch/)
  })
})

describe('/switch pane', () => {
  test('lists projects collapsed, with sessions hidden until a group opens', async ($, on) => {
    world(on)
    const out = await $.command.run(run(''))
    expect(out.text).toMatch(/session\(s\) listed/)
    const ui = await mountPane($)
    const keys = (await ui.findAll({ type: 'Button' })).map(b => b.key ?? '')
    expect(keys.filter(k => k.startsWith('g:'))).toEqual(['g:web-app', 'g:worker'])
    expect(keys.some(k => k.startsWith('s:'))).toBe(false)
    await ui.press({ key: 'g:web-app' })
    const opened = (await ui.findAll({ type: 'Button' })).map(b => b.key ?? '')
    expect(opened).toContain('s:bbbbbbbb-2')
    expect(opened).not.toContain('s:aaaaaaaa-1')
    await ui.unmount()
  })

  test('recent sort puts the project used last first; Sort: name flips to A-Z', async ($, on) => {
    world(on, { 'aaaaaaaa-1': 2_000_000, 'bbbbbbbb-2': 1_000_000 })
    await $.command.run(run(''))
    const ui = await mountPane($)
    expect((await buttonKeys(ui)).filter(k => k.startsWith('g:'))).toEqual(['g:worker', 'g:web-app'])
    await ui.press({ key: 'sort' })
    expect((await buttonKeys(ui)).filter(k => k.startsWith('g:'))).toEqual(['g:web-app', 'g:worker'])
    await ui.unmount()
  })

  test('rows page to the pane height so the tools row stays on screen', async ($, on) => {
    world(on)
    await $.command.run(run(''))
    const ui = await mountPane($, 9)
    await ui.press({ key: 'g:web-app' })
    const first = (await buttonKeys(ui)).filter(k => k.startsWith('g:') || k.startsWith('s:'))
    expect(first).toHaveLength(6)
    expect(await buttonKeys(ui)).toContain('reload')
    await ui.press({ key: 'next' })
    const second = (await buttonKeys(ui)).filter(k => k.startsWith('g:') || k.startsWith('s:'))
    expect(second.length).toBeGreaterThan(0)
    expect(second.some(k => first.includes(k))).toBe(false)
    await ui.unmount()
  })

  test('opening a group scrolls it to the top so its sessions show right under it', async ($, on) => {
    world(on, { 'aaaaaaaa-1': 2_000_000, 'bbbbbbbb-2': 1_000_000 })
    await $.command.run(run(''))
    const ui = await mountPane($, 9)
    await ui.press({ key: 'g:web-app' })
    const shown = (await buttonKeys(ui)).filter(k => k.startsWith('g:') || k.startsWith('s:'))
    expect(shown[0]).toBe('g:web-app')
    expect(shown.slice(1).every(k => k.startsWith('s:'))).toBe(true)
    expect(shown.length).toBe(6)
    expect((await ui.findAll({ type: 'Text' })).some(x => x.text.includes('Esc close'))).toBe(false)
    expect(await buttonKeys(ui)).toEqual(expect.arrayContaining(['reload', 'sort', 'show']))
    await ui.unmount()
  })

  test('toggling a group keeps the list the same height', async ($, on) => {
    world(on)
    await $.command.run(run(''))
    const ui = await mountPane($, 20)
    const height = async () => {
      const rowsDrawn = (await buttonKeys(ui)).filter(k => k.startsWith('g:') || k.startsWith('s:')).length
      const pads = (await ui.findAll({ type: 'Text' })).filter(x => x.text === ' ').length
      return rowsDrawn + pads
    }
    const before = await height()
    await ui.press({ key: 'g:web-app' })
    expect(await height()).toBe(before)
    await ui.press({ key: 'g:web-app' })
    expect(await height()).toBe(before)
    await ui.unmount()
  })

  test('an inline pane draws a full page even when its first body was short', async ($, on) => {
    world(on)
    await $.command.run(run(''))
    const ui = await mountPane($, 4, 'inline')
    await ui.press({ key: 'g:web-app' })
    const slots = (await buttonKeys(ui)).filter(k => k.startsWith('g:') || k.startsWith('s:')).length
      + (await ui.findAll({ type: 'Text' })).filter(x => x.text === ' ').length
    expect(slots).toBe(10)
    expect(await buttonKeys(ui)).toContain('reload')
    await ui.unmount()
  })

  test('a page holds at most 10 rows however tall the pane is', async ($, on) => {
    world(on)
    await $.command.run(run(''))
    const ui = await mountPane($, 60)
    await ui.press({ key: 'expand' })
    const shown = (await buttonKeys(ui)).filter(k => k.startsWith('g:') || k.startsWith('s:'))
    expect(shown.length).toBeLessThanOrEqual(10)
    await ui.unmount()
  })

  test('the pane asks for a page-sized inline height', async ($, on) => {
    const w = world(on)
    await $.command.run(run(''))
    expect(w.opened).toEqual([16])
  })

  test('/switch 177 confirms first, then resumes that session id', async ($, on) => {
    const w = world(on)
    const out = await $.command.run(run('177'))
    expect(out.text).toBe('Confirm resuming web-app_177 in the pane.')
    const ui = await mountPane($)
    expect(w.resumed).toEqual([])
    await ui.press({ key: 'confirm' })
    expect(w.resumed).toEqual(['bbbbbbbb-2'])
    await ui.unmount()
  })

  test('No on the /switch confirm returns to the row with its actions', async ($, on) => {
    world(on)
    await $.command.run(run('177'))
    const ui = await mountPane($)
    await ui.press({ key: 'cancel' })
    expect(await buttonKeys(ui)).toEqual(expect.arrayContaining(['act-resume', 'act-stop', 'act-del']))
    await ui.unmount()
  })

  test('after a stop the row keeps its actions', async ($, on) => {
    world(on)
    await $.command.run(run('177'))
    const ui = await mountPane($)
    await ui.press({ key: 'cancel' })
    await ui.press({ key: 'act-stop' })
    await ui.press({ key: 'confirm' })
    expect(await buttonKeys(ui)).toContain('act-stop')
    await ui.unmount()
  })

  test('stop group runs claude stop only for the idle background session', async ($, on) => {
    const w = world(on)
    await $.command.run(run(''))
    const ui = await mountPane($)
    await $.ui.focus(focusOn('g:web-app'))
    await ui.press({ key: 'act-stop' })
    expect((await ui.find({ type: 'Text', text: /^Stop/ }))?.text).toBe('Stop web-app_178?')
    await ui.press({ key: 'confirm' })
    expect(w.actions()).toEqual([['claude', 'stop', 'dddddddd']])
    await ui.unmount()
  })

  test('delete on an exited session runs claude rm with its short id; No runs nothing', async ($, on) => {
    const w = world(on)
    await $.command.run(run('web-app_170'))
    const ui = await mountPane($)
    await ui.press({ key: 'cancel' })
    await $.ui.focus(focusOn('s:ffffffff-6'))
    await ui.press({ key: 'act-del' })
    await ui.press({ key: 'cancel' })
    expect(w.actions()).toEqual([])
    await ui.press({ key: 'act-del' })
    await ui.press({ key: 'confirm' })
    expect(w.actions()).toEqual([['claude', 'rm', 'ffffffff']])
    await ui.unmount()
  })

  test('stopping an attached sole-tmux session warns, then kills that tmux session', async ($, on) => {
    const w = world(on, {}, { panes: 'web-app_177\t1\t1\t500\t1\n', ps: '  12   500\n  500  1\n' })
    await $.command.run(run('177'))
    const ui = await mountPane($)
    await ui.press({ key: 'cancel' })
    await $.ui.focus(focusOn('s:bbbbbbbb-2'))
    await ui.press({ key: 'act-stop' })
    expect((await ui.findAll({ type: 'Text' })).some(x => /open in a terminal now/.test(x.text))).toBe(true)
    await ui.press({ key: 'confirm' })
    expect(w.actions()).toEqual([['tmux', 'kill-session', '-t', '=web-app_177']])
    await ui.unmount()
  })

  test('a relay in flight shows on the row and skips the group stop', async ($, on) => {
    const w = world(on, {}, { relay: { 'baton-web-app_178.md': '' } })
    await $.command.run(run(''))
    const ui = await mountPane($)
    await ui.press({ key: 'g:web-app' })
    expect((await ui.findAll({ type: 'Text' })).some(x => x.text.startsWith('relay bg'))).toBe(true)
    await $.ui.focus(focusOn('g:web-app'))
    await ui.press({ key: 'act-stop' })
    expect((await ui.find({ type: 'Text', text: /^Nothing to stop/ }))).toBeDefined()
    expect(await buttonKeys(ui)).not.toContain('confirm')
    expect(w.actions()).toEqual([])
    await ui.unmount()
  })

  test('delete on an interactive session in its own tmux kills that tmux session', async ($, on) => {
    const w = world(on, {}, { panes: 'web-app_177\t1\t1\t500\t0\n', ps: '  12   500\n  500  1\n' })
    await $.command.run(run('177'))
    const ui = await mountPane($)
    await ui.press({ key: 'cancel' })
    await $.ui.focus(focusOn('s:bbbbbbbb-2'))
    await ui.press({ key: 'act-del' })
    await ui.press({ key: 'confirm' })
    expect(w.actions()).toEqual([['tmux', 'kill-session', '-t', '=web-app_177']])
    await ui.unmount()
  })

  test('stopping an interactive session sends SIGTERM to its pid', async ($, on) => {
    const w = world(on)
    await $.command.run(run('177'))
    const ui = await mountPane($)
    await ui.press({ key: 'cancel' })
    await $.ui.focus(focusOn('s:bbbbbbbb-2'))
    await ui.press({ key: 'act-stop' })
    await ui.press({ key: 'confirm' })
    expect(w.actions()).toEqual([['kill', '-TERM', '12']])
    await ui.unmount()
  })
})
