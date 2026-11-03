import type { EngineInterface, Register } from 'claude-code'

import type { Config, ContainerInfo, FolderInfo, RepoInfo, Snapshot, UrlEntry } from '../types'
import {
  attribute,
  parseConfig,
  parseInspect,
  parseWorktrees,
  relativePath,
  resolvePath,
} from './collect'
import type { DockerContainer } from './collect'

const PANE = 'dev-cheatsheet'
const TITLE = 'Dev cheatsheet'
const CONFIG_FILE = '.claude/cheatsheet.json'
const REFRESH_MS = 15_000

// State refs: `plugin` and `key` stay literals, as `claude plugin validate` reads them
const CONFIG = { plugin: 'dev-cheatsheet', key: 'config1' } as const
const SNAPSHOT = { plugin: 'dev-cheatsheet', key: 'snapshot1' } as const
const TAB = { plugin: 'dev-cheatsheet', key: 'tab' } as const
const EXPANDED = { plugin: 'dev-cheatsheet', key: 'expanded1' } as const
const DOC = { plugin: 'dev-cheatsheet', key: 'doc2' } as const
const ACTIVE = { plugin: 'dev-cheatsheet', key: 'active1' } as const

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
      name: 'cheatsheet',
      description: 'Dev cheatsheet: folders, branches, URLs, containers, docs',
    })
    const started = await next(e)

    void (async () => {
      const error = await reload($)
      if (error) return
      await $.ui.open({ id: PANE, title: TITLE })
      // Always refresh: the band's summary needs fresh data while the pane is closed
      $.clock.every(REFRESH_MS, () => void refresh($))
    })()

    return started
  })

  on('command.run', { command: 'cheatsheet' }, async $ => {
    const error = await openPane($)

    return { text: error ?? 'Dev cheatsheet opened.' }
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
    if (e.props.hasSurvey || !cfg) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const { value: snap } = await $.state.get(SNAPSHOT)
    const { value: active } = await $.state.get(ACTIVE)
    const folders = snap?.repos.flatMap(r => r.folders) ?? []
    const worktrees = snap?.repos.reduce((n, r) => n + Math.max(0, r.folders.length - 1), 0) ?? 0
    const containers = folders.flatMap(f => f.containers)
    const running = containers.filter(c => c.isRunning).length
    const summary = snap
      ? `${worktrees} ${worktrees === 1 ? 'worktree' : 'worktrees'} · containers ${running} of ${containers.length} running`
      : 'Cheatsheet'

    // Left: where the agent last edited; right: the summary, which opens the pane
    const lastEdit = () => {
      if (!active) return null
      if (active === './') {
        return (
          <Text size="footnote" dimColor wrap="truncate-end">
            Last edit: project root
          </Text>
        )
      }
      const repo = snap?.repos.find(r => r.folders.some(f => f.path === active))
      const folder = repo?.folders.find(f => f.path === active)
      if (!repo || !folder) return null
      const isMain = repo.folders[0] === folder
      return (
        <Box flexDirection="row" gap={1} flexShrink={1}>
          <Text size="footnote" dimColor>
            Last edit:
          </Text>
          <Text size="footnote" weight="semibold" wrap="truncate-end">
            {folder.path}
          </Text>
          <Text size="footnote" color={isMain ? 'warning' : 'suggestion'} wrap="truncate-end">
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
            key="toggle-cheatsheet"
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
    const { value: doc } = await $.state.get(DOC)
    const { value: open = [] } = await $.state.get(EXPANDED)
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
        <Text weight="semibold">{folder.path}</Text>
        {branchPill(folder.branch, isMain)}
        {folder.urls.length === 0 ? (
          <Text size="footnote" dimColor>
            No URL in the config
          </Text>
        ) : (
          folder.urls.map((u, i) => (
            <Box key={`url:${i}`} flexDirection="row" gap={1}>
              <Link href={u.url} label={u.url} />
              {folder.urls.length > 1 && u.label ? (
                <Text size="footnote" dimColor>
                  {u.label}
                </Text>
              ) : null}
            </Box>
          ))
        )}
        {containerLines(folder)}
      </Box>
    )

    const repoBlock = (repo: RepoInfo) => {
      const heading = repo.name.replace(/\/+$/, '').split('/').pop()?.toUpperCase() ?? repo.name
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
          {snap.dockerError ? <Text color="error">{`docker: ${snap.dockerError}`}</Text> : null}
          <Text size="caption" dimColor>
            {`Updated ${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`}
          </Text>
        </Box>
      )
    }

    // The desktop draws a file: link as plain text, so a doc opens in a tab of this pane
    const docsTab = () => {
      if (!cfg || cfg.docs.length === 0) return <Text dimColor>No docs in the config.</Text>
      return (
        <Box flexDirection="column" gap="xs">
          {cfg.docs.map(d => (
            <Button
              key={`doc:${d.path}`}
              label={d.label}
              plain
              onPress={async () => {
                const text = await $.fs.read(resolvePath(root, d.path))
                await $.state.set(DOC, { label: d.label, path: d.path, text })
                await $.state.set(TAB, 'doc')
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
          <Button
            key="tab:docs"
            label="Docs"
            variant={currentTab === 'docs' ? 'primary' : 'secondary'}
            onPress={() => void $.state.set(TAB, 'docs')}
          />
          {doc ? (
            <Button
              key="tab:doc"
              label={doc.label}
              variant={currentTab === 'doc' ? 'primary' : 'secondary'}
              onPress={() => void $.state.set(TAB, 'doc')}
            />
          ) : null}
          <Box flexGrow={1} />
          <Button key="refresh" label="Refresh" onPress={() => void refresh($)} />
        </Box>
        {currentTab === 'doc' && doc ? (
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="row" alignItems="center" gap={1}>
              <Box flexGrow={1} flexShrink={1}>
                <Text size="footnote" dimColor wrap="truncate-start">
                  {doc.path}
                </Text>
              </Box>
              <Button
                key="close-doc"
                label="Close"
                onPress={async () => {
                  await $.state.set(DOC, null)
                  await $.state.set(TAB, 'docs')
                }}
              />
            </Box>
            <Markdown text={doc.text} />
          </Box>
        ) : currentTab === 'docs' || currentTab === 'doc' ? (
          docsTab()
        ) : (
          standTab()
        )}
      </Box>
    )
  })
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0] ?? ''
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
