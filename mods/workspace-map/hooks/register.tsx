import type { EngineInterface, Register } from 'claude-code'

import type { Config, ContainerInfo, FolderInfo, RepoInfo, Snapshot, UrlEntry } from '../types'
import {
  attribute,
  baseName,
  docLinks,
  opensInViewer,
  parseConfig,
  parseInspect,
  parseWorktrees,
  relativePath,
  resolvePath,
  summaryLabel,
} from './collect'
import type { DockerContainer } from './collect'

const PANE = 'workspace-map'
const TITLE = 'Workspace Map'
const CONFIG_FILE = '.claude/workspace-map.json'
const REFRESH_MS = 15_000

// State refs: `plugin` and `key` stay literals, as `claude plugin validate` reads them
const CONFIG = { plugin: 'workspace-map', key: 'config2' } as const
const SNAPSHOT = { plugin: 'workspace-map', key: 'snapshot2' } as const
const TAB = { plugin: 'workspace-map', key: 'tab1' } as const
const EXPANDED = { plugin: 'workspace-map', key: 'expanded1' } as const
const ACTIVE = { plugin: 'workspace-map', key: 'active1' } as const

type Loaded = { config: Config } | { error: string }

async function loadConfig($: EngineInterface): Promise<Loaded> {
  const root = await $.session.root()
  let text: string
  try {
    text = await $.fs.read(`${root}/${CONFIG_FILE}`)
  } catch {
    return { error: `No ${CONFIG_FILE} in this project.` }
  }
  try {
    return { config: parseConfig(text) }
  } catch (err) {
    return { error: `${CONFIG_FILE}: ${messageOf(err)}` }
  }
}

async function run(
  $: EngineInterface,
  argv: string[],
): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  try {
    const result = await $.process.run(argv)
    if (result.exitCode === 0) return { ok: true, stdout: result.stdout }
    return { ok: false, error: firstLine(result.stderr) || `exit ${result.exitCode}` }
  } catch (err) {
    return { ok: false, error: messageOf(err) }
  }
}

async function listContainers(
  $: EngineInterface,
): Promise<{ containers: DockerContainer[]; error?: string }> {
  const ids = await run($, ['docker', 'ps', '-a', '-q'])
  if (!ids.ok) return { containers: [], error: ids.error }
  const list = ids.stdout.split('\n').map(id => id.trim()).filter(Boolean)
  if (list.length === 0) return { containers: [] }
  const inspected = await run($, ['docker', 'inspect', ...list])
  if (!inspected.ok) return { containers: [], error: inspected.error }
  try {
    return { containers: parseInspect(inspected.stdout) }
  } catch (err) {
    return { containers: [], error: messageOf(err) }
  }
}

async function refresh($: EngineInterface): Promise<void> {
  const { value: cfg } = await $.state.get(CONFIG)
  if (!cfg) return
  const root = await $.session.root()

  const repoFolders: { name: string; error?: string; worktrees: { path: string; branch: string }[] }[] = []
  for (const repo of cfg.repos) {
    const listed = await run($, ['git', '-C', resolvePath(root, repo), 'worktree', 'list', '--porcelain'])
    repoFolders.push(
      listed.ok
        ? { name: repo, worktrees: parseWorktrees(listed.stdout) }
        : { name: repo, error: listed.error, worktrees: [] },
    )
  }

  const { containers, error: dockerError } = await listContainers($)
  const allFolders = repoFolders.flatMap(r => r.worktrees.map(w => w.path))
  const byFolder = attribute(containers, allFolders, cfg.containers, root)

  const repos: RepoInfo[] = repoFolders.map(r => ({
    name: r.name,
    label: baseName(resolvePath(root, r.name)),
    ...(r.error ? { error: r.error } : {}),
    folders: r.worktrees.map((w): FolderInfo => {
      const inFolder = byFolder.get(w.path) ?? []
      return {
        path: relativePath(root, w.path),
        branch: w.branch,
        urls: inFolder.flatMap(c => (cfg.urls[c.name] ? [cfg.urls[c.name] as UrlEntry] : [])),
        containers: inFolder.map((c): ContainerInfo => ({ name: c.name, isRunning: c.isRunning })),
      }
    }),
  }))

  const next: Snapshot = {
    repos,
    updatedAt: await $.clock.now(),
    ...(dockerError ? { dockerError } : {}),
  }
  await $.state.set(SNAPSHOT, next)
}

// Reads the config again and refreshes; says why when there is nothing to show
async function reload($: EngineInterface): Promise<string | undefined> {
  const loaded = await loadConfig($)
  if ('error' in loaded) {
    await $.state.set(CONFIG, null)
    return loaded.error
  }
  await $.state.set(CONFIG, loaded.config)
  await refresh($)
  return undefined
}

// Remembers the folder of the agent's last edit: the longest panel folder
// holding the file, else the project root when the file is inside it
async function noteEdit($: EngineInterface, file: string): Promise<void> {
  const { value: snap } = await $.state.get(SNAPSHOT)
  if (!snap) return
  const root = await $.session.root()
  const abs = resolvePath(root, file)
  let best: string | undefined
  for (const folder of snap.repos.flatMap(r => r.folders)) {
    const folderAbs = resolvePath(root, folder.path)
    const isInside = abs === folderAbs || abs.startsWith(`${folderAbs}/`)
    if (isInside && (!best || folder.path.length > best.length)) best = folder.path
  }
  const active = best ?? (abs.startsWith(`${resolvePath(root, '.')}/`) ? './' : undefined)
  if (active) await $.state.set(ACTIVE, active)
}

// Reads the config again and opens the pane; says why when there is nothing to show
async function openPane($: EngineInterface): Promise<string | undefined> {
  const error = await reload($)
  if (error) return error
  await $.ui.open({ id: PANE, title: TITLE })
  return undefined
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'workspace',
      description: 'Workspace Map: folders, branches, URLs, containers, docs',
    })
    const started = await next(e)

    // Always refresh: the band's summary needs fresh data while the pane is
    // closed, and a config added later is picked up by the command. The pane
    // itself opens only on request: the command or the band's button
    $.clock.every(REFRESH_MS, () => void refresh($))
    void reload($)

    return started
  })

  on('command.run', { command: 'workspace' }, async $ => {
    const error = await openPane($)

    return { text: error ?? 'Workspace Map opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const file =
      e.tool === 'Edit' || e.tool === 'Write'
        ? e.file_path
        : e.tool === 'NotebookEdit'
          ? e.notebook_path
          : undefined
    if (file) await noteEdit($, file)

    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { value: cfg } = await $.state.get(CONFIG)
    if (e.props.hasSurvey || !cfg || !cfg.promptBar) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const { value: snap } = await $.state.get(SNAPSHOT)
    const { value: active } = await $.state.get(ACTIVE)
    const summary = (snap && summaryLabel(snap)) ?? TITLE

    // Left: where the agent last edited; right: the summary, which opens the pane.
    // Names are cut in the middle: a ticket number sits at the end of a folder or branch
    const lastEdit = () => {
      if (!active) return null
      const repo = snap?.repos.find(r => r.folders.some(f => f.path === active))
      const folder = repo?.folders.find(f => f.path === active)
      const mark = (
        <Box key="mark" flexShrink={0}>
          <Text size="footnote" dimColor>
            ✎
          </Text>
        </Box>
      )
      if (!repo || !folder) {
        return active === './' ? (
          <Box flexDirection="row" gap={1} flexShrink={1}>
            {mark}
            <Text size="footnote" dimColor wrap="truncate-end">
              project root
            </Text>
          </Box>
        ) : null
      }
      const isMain = repo.folders[0] === folder
      return (
        <Box flexDirection="row" gap={1} flexShrink={1}>
          {mark}
          <Text size="footnote" weight="semibold" wrap="truncate-middle">
            {barTitle(folder.path)}
          </Text>
          <Text size="footnote" color={isMain ? 'warning' : 'suggestion'} wrap="truncate-middle">
            {folder.branch}
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
        <Box flexShrink={1}>{lastEdit()}</Box>
        <Box flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
          <Button
            key="toggle-map"
            label={summary}
            plain
            onPress={async () => {
              // Ask the surface: it knows the pane is open, however it was opened
              const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
              if (isOpen) await $.ui.close({ id: PANE })
              else await openPane($)
            }}
          />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link, Markdown } = $.ui.resolve(e)
    const { value: cfg } = await $.state.get(CONFIG)
    const { value: snap } = await $.state.get(SNAPSHOT)
    const { value: currentTab = 'stand' } = await $.state.get(TAB)
    const { value: open = [] } = await $.state.get(EXPANDED)
    const hasContainers = !!snap?.repos.some(r => r.folders.some(f => f.containers.length > 0))
    const hasDocs = !!cfg && cfg.docs.length > 0
    // Main folder of a repo: orange, it shows what the base branch runs;
    // a worktree: blue, a task's branch
    const tone = (isMain: boolean) => (isMain ? 'warning' : 'suggestion')

    const dot = (c: ContainerInfo) => (
      <Text color={c.isRunning ? 'success' : 'inactive'}>{c.isRunning ? '●' : '○'}</Text>
    )

    const branchPill = (branch: string, isMain: boolean) => (
      <Box key="branch" alignSelf="flex-start" backgroundColor={tone(isMain)} paddingX={1}>
        <Text color="inverseText" weight="medium">
          {branch}
        </Text>
      </Box>
    )

    const containerLines = (folder: FolderInfo) => {
      const list = folder.containers
      // A project without containers gets no container lines at all
      if (!hasContainers) return []
      if (list.length === 0) {
        return [
          <Text key="c" size="footnote" dimColor>
            No containers
          </Text>,
        ]
      }
      if (list.length === 1) {
        const only = list[0] as ContainerInfo
        return [
          <Box key="c" flexDirection="row" gap={1}>
            {dot(only)}
            <Text size="footnote">{only.name}</Text>
          </Box>,
        ]
      }
      const running = list.filter(c => c.isRunning).length
      const color = running === list.length ? 'success' : running === 0 ? 'error' : 'warning'
      const isOpen = open.includes(folder.path)
      const lines = [
        <Box key="c" flexDirection="row" gap={1} alignItems="center">
          <Text color={color}>●</Text>
          <Text size="footnote">
            {`Containers: ${running} of ${list.length} running`}
          </Text>
          <Button
            key={`toggle:${folder.path}`}
            label={isOpen ? 'hide' : 'show'}
            plain
            dimColor
            onPress={async () => {
              const { value: paths = [] } = await $.state.get(EXPANDED)
              await $.state.set(
                EXPANDED,
                paths.includes(folder.path)
                  ? paths.filter(p => p !== folder.path)
                  : [...paths, folder.path],
              )
            }}
          />
        </Box>,
      ]
      if (isOpen) {
        lines.push(
          <Box key="list" flexDirection="column" paddingLeft={2}>
            {list.map(c => (
              <Box key={`c:${c.name}`} flexDirection="row" gap={1}>
                {dot(c)}
                <Text size="footnote" dimColor={!c.isRunning}>
                  {c.name}
                </Text>
              </Box>
            ))}
          </Box>,
        )
      }
      return lines
    }

    const folderCard = (folder: FolderInfo, isMain: boolean) => (
      <Box
        key={`folder:${folder.path}`}
        flexDirection="column"
        // Zero base width: cards of a row share the room equally, whatever their text
        width={0}
        flexGrow={1}
        flexShrink={1}
        minWidth={36}
        gap={1}
        paddingX={1}
        borderStyle="round"
        borderColor={isMain ? 'subtle' : tone(false)}
      >
        <Text weight="semibold">{folderTitle(folder.path)}</Text>
        {branchPill(folder.branch, isMain)}
        {folder.urls.map((u, i) => (
          <Box key={`url:${i}`} flexDirection="row" gap={1}>
            <Link href={u.url} label={u.url} />
            {folder.urls.length > 1 && u.label ? (
              <Text size="footnote" dimColor>
                {u.label}
              </Text>
            ) : null}
          </Box>
        ))}
        {containerLines(folder)}
      </Box>
    )

    const repoBlock = (repo: RepoInfo) => {
      const heading = repo.label.toUpperCase()
      return (
        <Box key={`repo:${repo.name}`} flexDirection="column" gap={1}>
          <Text size="heading" weight="bold">
            {heading}
          </Text>
          {repo.error ? <Text color="error">{`git: ${repo.error}`}</Text> : null}
          {/* Cards sit side by side while the pane is wide and wrap when it narrows */}
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {repo.folders.map((folder, i) => folderCard(folder, i === 0))}
          </Box>
        </Box>
      )
    }

    const standTab = () => {
      if (!snap) return <Text dimColor>Collecting…</Text>
      const time = new Date(snap.updatedAt)
      const pad = (n: number) => String(n).padStart(2, '0')
      return (
        <Box flexDirection="column" gap={2}>
          {snap.repos.map(repoBlock)}
          {/* Docker matters only to a project that names containers */}
          {snap.dockerError && cfg && (Object.keys(cfg.urls).length > 0 || Object.keys(cfg.containers).length > 0) ? (
            <Text size="footnote" color="warning">{`docker: ${snap.dockerError}`}</Text>
          ) : null}
          <Text size="caption" dimColor>
            {`Updated ${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`}
          </Text>
        </Box>
      )
    }

    // A Link element draws a file: URL as plain text on desktop, but a link in Markdown opens
    // the file in the app's own viewer. Other files are Buttons that hand the file to macOS
    const docsTab = () => {
      if (!cfg || !hasDocs) return null
      const inViewer = cfg.docs.filter(d => opensInViewer(d.path))
      const outside = cfg.docs.filter(d => !opensInViewer(d.path))
      return (
        <Box flexDirection="column" gap={1}>
          {inViewer.length > 0 ? <Markdown text={docLinks(root, inViewer)} /> : null}
          {outside.map(d => (
            <Button
              key={`open:${d.path}`}
              label={`${d.label} ↗`}
              plain
              onPress={async () => {
                const opened = await run($, ['open', resolvePath(root, d.path)])
                if (!opened.ok) $.ui.toast(`${d.label}: ${opened.error}`)
              }}
            />
          ))}
        </Box>
      )
    }

    const root = await $.session.root()

    if (!cfg) return <Text dimColor>{`No ${CONFIG_FILE} in this project.`}</Text>

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1}>
          <Button
            key="tab:stand"
            label="Workspace"
            variant={currentTab === 'stand' ? 'primary' : 'secondary'}
            onPress={() => void $.state.set(TAB, 'stand')}
          />
          {hasDocs ? (
            <Button
              key="tab:docs"
              label="Docs"
              variant={currentTab === 'docs' ? 'primary' : 'secondary'}
              onPress={() => void $.state.set(TAB, 'docs')}
            />
          ) : null}
          <Box flexGrow={1} />
          <Button key="refresh" label="Refresh" onPress={() => void refresh($)} />
        </Box>
        {hasDocs && currentTab === 'docs' ? docsTab() : standTab()}
      </Box>
    )
  })
}

// A repo named "." lists the project root as its main folder
function folderTitle(path: string): string {
  return path === './' ? 'project root' : path
}

// The row above the prompt names a folder by its last segment; the pane shows the path
function barTitle(path: string): string {
  return path === './' ? 'project root' : baseName(path)
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0] ?? ''
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
