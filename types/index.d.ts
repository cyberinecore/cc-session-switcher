export type SwitcherKind = 'interactive' | 'background'

export type SwitcherTmux = { name: string; isSole: boolean; isAttached: boolean }

export type SwitcherSession = {
  sessionId: string
  short: string
  name: string
  project: string
  cwd: string
  kind: SwitcherKind
  status: string | null
  jobState: string | null
  pid: number
  isLive: boolean
  isSelf: boolean
  rssKb: number
  lastActiveMs: number
  tmux: SwitcherTmux | null
  relay: string | null
}

export type SwitcherAction = 'resume' | 'stop' | 'delete'

export type SwitcherScreen =
  | { screen: 'list' }
  | { screen: 'confirm'; action: SwitcherAction; scope: string; ids: string[]; skipped: string[]; back: string | null }

export type SwitcherShow = 'all' | 'live'

export type SwitcherSort = 'recent' | 'name'

declare module 'claude-code' {
  interface PluginState {
    'cyberine-session-switcher': {
      sessions: SwitcherSession[]
      isLoading: boolean
      error: string
      query: string
      expanded: string[]
      focused: string | null
      screen: SwitcherScreen
      notice: string
      page: number
      show: SwitcherShow
      sort: SwitcherSort
      isBusy: boolean
    }
  }
}
