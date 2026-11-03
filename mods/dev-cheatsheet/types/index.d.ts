// A link the project's config lists for the Documents tab
export type DocLink = { label: string; path: string }

// A URL the config names for one container
export type UrlEntry = { url: string; label?: string }

// .claude/cheatsheet.json of the project, normalized
export type Config = {
  repos: string[]
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

export type RepoInfo = { name: string; folders: FolderInfo[]; error?: string }

export type Snapshot = {
  repos: RepoInfo[]
  dockerError?: string
  updatedAt: number
}

export type OpenDoc = { label: string; path: string; text: string }

export type Tab = 'stand' | 'docs' | 'doc'

// The number in a key changes with that value's fields: a value an earlier
// version stored outlives a reload, and a new key leaves it unread.
declare module 'claude-code' {
  interface PluginState {
    'dev-cheatsheet': {
      config1: Config | null
      snapshot1: Snapshot | null
      tab: Tab
      expanded1: string[]
      doc2: OpenDoc | null
      // folder of the agent's last edit, as the panel names it; './' for the project root
      active1: string | null
    }
  }
}
