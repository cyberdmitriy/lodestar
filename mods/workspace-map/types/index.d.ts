// A link the project's config lists for the Docs tab
export type DocLink = { label: string; path: string }

// A URL the config names for one container
export type UrlEntry = { url: string; label?: string }

// .claude/workspace-map.json of the project, normalized
export type Config = {
  // git repositories relative to the project root; the root itself when the config names none
  repos: string[]
  // the row above the prompt; off, the pane opens by the command alone
  promptBar: boolean
  urls: Record<string, UrlEntry>
  containers: Record<string, string>
  docs: DocLink[]
}

export type ContainerInfo = { name: string; isRunning: boolean }

export type FolderInfo = {
  // relative to the project root, with a trailing slash
  path: string
  branch: string
  urls: UrlEntry[]
  containers: ContainerInfo[]
}

export type RepoInfo = {
  name: string
  // heading: the repository folder's own name
  label: string
  folders: FolderInfo[]
  error?: string
}

export type Snapshot = {
  repos: RepoInfo[]
  dockerError?: string
  updatedAt: number
}

export type Tab = 'stand' | 'docs'

// The number in a key changes with that value's fields: a value an earlier
// version stored outlives a reload, and a new key leaves it unread.
declare module 'claude-code' {
  interface PluginState {
    'workspace-map': {
      config2: Config | null
      snapshot2: Snapshot | null
      tab1: Tab
      expanded1: string[]
      // folder of the agent's last edit, as the panel names it; './' for the project root
      active1: string | null
    }
  }
}
