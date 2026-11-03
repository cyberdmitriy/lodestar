// Pure parsing and matching, kept apart from the hooks so tests can run it
import type { Config, DocLink, Snapshot, UrlEntry } from '../types'

export type Worktree = { path: string; branch: string }

export type DockerContainer = {
  name: string
  isRunning: boolean
  // host paths the container is tied to: bind mount sources, compose folder
  paths: string[]
  // value of the `dev.folder` label, if the container was started with one
  folderLabel?: string
}

// Docker Desktop reports some bind mounts under this prefix
const HOST_MNT = '/host_mnt'
const FOLDER_LABEL = 'dev.folder'
const COMPOSE_DIR_LABEL = 'com.docker.compose.project.working_dir'

export function resolvePath(root: string, path: string): string {
  const joined = path.startsWith('/') ? path : `${root}/${path}`
  const parts: string[] = []
  for (const part of joined.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}

export function relativePath(root: string, abs: string): string {
  const base = resolvePath(root, '.')
  if (abs === base) return './'
  return abs.startsWith(`${base}/`) ? `${abs.slice(base.length + 1)}/` : `${abs}/`
}

export function parseConfig(text: string): Config {
  const parsed = JSON.parse(text) as unknown
  if (!isRecord(parsed)) throw new Error('the config must be a JSON object')
  const raw = parsed
  const repos = raw.repos === undefined ? ['.'] : raw.repos
  if (!Array.isArray(repos) || repos.some(r => typeof r !== 'string')) {
    throw new Error('"repos" must be a list of folder paths')
  }
  if (raw.promptBar !== undefined && typeof raw.promptBar !== 'boolean') {
    throw new Error('"promptBar" must be true or false')
  }
  const urls: Record<string, UrlEntry> = {}
  for (const [name, value] of Object.entries(asRecord(raw.urls))) {
    if (typeof value === 'string') urls[name] = { url: value }
    else if (isRecord(value) && typeof value.url === 'string') {
      urls[name] = {
        url: value.url,
        ...(typeof value.label === 'string' ? { label: value.label } : {}),
      }
    }
  }
  const containers: Record<string, string> = {}
  for (const [name, value] of Object.entries(asRecord(raw.containers))) {
    if (typeof value === 'string') containers[name] = value
  }
  const docs: DocLink[] = []
  for (const value of Array.isArray(raw.docs) ? raw.docs : []) {
    if (isRecord(value) && typeof value.path === 'string') {
      docs.push({
        label: typeof value.label === 'string' ? value.label : value.path,
        path: value.path,
      })
    }
  }
  return {
    repos: repos.length > 0 ? (repos as string[]) : ['.'],
    promptBar: raw.promptBar !== false,
    urls,
    containers,
    docs,
  }
}

// What the row above the prompt says: worktrees and containers, each only
// when there are any; nothing when the project has neither
export function summaryLabel(snapshot: Snapshot): string | undefined {
  const worktrees = snapshot.repos.reduce((n, r) => n + Math.max(0, r.folders.length - 1), 0)
  const containers = snapshot.repos.flatMap(r => r.folders.flatMap(f => f.containers))
  const running = containers.filter(c => c.isRunning).length
  const parts: string[] = []
  if (worktrees > 0) parts.push(`${worktrees} ${worktrees === 1 ? 'worktree' : 'worktrees'}`)
  if (containers.length > 0) parts.push(`containers ${running} of ${containers.length} running`)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

// The pane's Markdown draws HTML comments as text, so they are cut before drawing. Fenced code
// stays as written; a line left empty by a comment goes, with the blank line it would double
export function stripComments(markdown: string): string {
  const out: string[] = []
  let fence: string | undefined
  let inComment = false
  let dropped = false
  for (const line of markdown.split('\n')) {
    if (!inComment) {
      const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
      if (fence) {
        if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = undefined
        out.push(line)
        continue
      }
      if (marker) {
        fence = marker
        out.push(line)
        continue
      }
    }
    let kept = ''
    let rest = line
    let touched = inComment
    for (;;) {
      if (inComment) {
        const end = rest.indexOf('-->')
        if (end < 0) break
        rest = rest.slice(end + 3)
        inComment = false
      } else {
        const start = rest.indexOf('<!--')
        if (start < 0) {
          kept += rest
          break
        }
        kept += rest.slice(0, start)
        rest = rest.slice(start + 4)
        inComment = true
        touched = true
      }
    }
    const isBlank = kept.trim() === ''
    if (touched && isBlank) {
      dropped = true
      continue
    }
    if (dropped && isBlank && out.at(-1)?.trim() === '') continue
    if (!isBlank) dropped = false
    out.push(kept)
  }
  return out.join('\n')
}

export function baseName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

export function parseWorktrees(stdout: string): Worktree[] {
  const worktrees: Worktree[] = []
  for (const block of stdout.split(/\n\s*\n/)) {
    let path = ''
    let branch = ''
    let head = ''
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length)
      else if (line.startsWith('branch ')) branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length)
      else if (line === 'detached') branch = ''
      else if (line === 'bare') path = ''
    }
    if (!path) continue
    worktrees.push({ path, branch: branch || `detached ${head.slice(0, 8)}` })
  }
  return worktrees
}

// `docker inspect` output: a JSON array of containers
export function parseInspect(stdout: string): DockerContainer[] {
  const list = JSON.parse(stdout) as unknown
  if (!Array.isArray(list)) return []
  return list.filter(isRecord).map(item => {
    const state = asRecord(item.State)
    const labels = asRecord(asRecord(item.Config).Labels)
    const paths: string[] = []
    for (const mount of Array.isArray(item.Mounts) ? item.Mounts : []) {
      if (isRecord(mount) && mount.Type === 'bind' && typeof mount.Source === 'string') {
        paths.push(stripHostMnt(mount.Source))
      }
    }
    const composeDir = labels[COMPOSE_DIR_LABEL]
    if (typeof composeDir === 'string') paths.push(stripHostMnt(composeDir))
    const folderLabel = labels[FOLDER_LABEL]
    return {
      name: String(item.Name ?? '').replace(/^\//, ''),
      isRunning: state.Running === true,
      paths,
      ...(typeof folderLabel === 'string' ? { folderLabel } : {}),
    }
  })
}

// Assigns each container to one of `folders` (absolute paths): the
// `dev.folder` label first, then the config's `containers`, then the folder
// that is the longest prefix of one of the container's paths. Containers
// that match none are left out.
export function attribute(
  containers: DockerContainer[],
  folders: string[],
  overrides: Record<string, string>,
  root: string,
): Map<string, DockerContainer[]> {
  const byFolder = new Map<string, DockerContainer[]>(folders.map(f => [f, []]))
  for (const container of containers) {
    const folder = folderOf(container, folders, overrides, root)
    if (folder) byFolder.get(folder)?.push(container)
  }
  for (const list of byFolder.values()) list.sort((a, b) => a.name.localeCompare(b.name))
  return byFolder
}

function folderOf(
  container: DockerContainer,
  folders: string[],
  overrides: Record<string, string>,
  root: string,
): string | undefined {
  for (const named of [container.folderLabel, overrides[container.name]]) {
    if (named === undefined) continue
    const abs = resolvePath(root, named)
    if (folders.includes(abs)) return abs
  }
  let best: string | undefined
  for (const path of container.paths) {
    for (const folder of folders) {
      const isInside = path === folder || path.startsWith(`${folder}/`)
      if (isInside && (!best || folder.length > best.length)) best = folder
    }
  }
  return best
}

function stripHostMnt(path: string): string {
  return path.startsWith(`${HOST_MNT}/`) ? path.slice(HOST_MNT.length) : path
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}
