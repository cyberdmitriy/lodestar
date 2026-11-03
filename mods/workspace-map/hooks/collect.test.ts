import { expect, test } from 'claude-code/testing'

import {
  attribute,
  docLinks,
  parseConfig,
  parseInspect,
  parseWorktrees,
  relativePath,
  summaryLabel,
} from './collect'

const ROOT = '/work/proj'

const WORKTREES = `worktree /work/proj/backend
HEAD bde50e88116674dc8794148bcdee1210bffc934d
branch refs/heads/production

worktree /work/proj/worktrees/backend-T-1
HEAD 91c6368d25e88ceda6fb1b6dea04da09d7beb359
branch refs/heads/feature/T-1-thing

`

const container = (name: string, mounts: string[], labels: Record<string, string> = {}, isRunning = true) => ({
  Name: `/${name}`,
  State: { Running: isRunning },
  Config: { Labels: labels },
  Mounts: mounts.map(Source => ({ Type: 'bind', Source })),
})

const INSPECT = JSON.stringify([
  container('stack-core-1', ['/work/proj/backend/core'], {
    'com.docker.compose.project.working_dir': '/work/proj/backend',
  }),
  container('stack-redis-1', [], { 'com.docker.compose.project.working_dir': '/work/proj/backend' }),
  container('stack-mysql-1', ['/host_mnt/work/proj/backend/import']),
  container('t1-router', ['/work/proj/backend/docker/router/router.yaml', '/work/proj/worktrees/sg.yaml']),
  container('t1-community', ['/work/proj/worktrees/backend-T-1/community'], {}, false),
  container('t1-labelled', ['/elsewhere'], { 'dev.folder': 'worktrees/backend-T-1' }),
  container('other-app-1', ['/work/other']),
])

test('worktrees come with their branches, main folder first', async () => {
  expect(parseWorktrees(WORKTREES)).toEqual([
    { path: '/work/proj/backend', branch: 'production' },
    { path: '/work/proj/worktrees/backend-T-1', branch: 'feature/T-1-thing' },
  ])
  expect(parseWorktrees('worktree /a\nHEAD 0123456789abcdef\ndetached\n')).toEqual([
    { path: '/a', branch: 'detached 01234567' },
  ])
})

test('containers land in their folders, foreign ones are left out', async () => {
  const folders = ['/work/proj/backend', '/work/proj/worktrees/backend-T-1']
  const byFolder = attribute(parseInspect(INSPECT), folders, { 't1-router': 'worktrees/backend-T-1' }, ROOT)
  const names = (folder: string) => (byFolder.get(folder) ?? []).map(c => c.name)

  expect(names('/work/proj/backend')).toEqual(['stack-core-1', 'stack-mysql-1', 'stack-redis-1'])
  expect(names('/work/proj/worktrees/backend-T-1')).toEqual(['t1-community', 't1-labelled', 't1-router'])
  expect(byFolder.get('/work/proj/worktrees/backend-T-1')?.[0]?.isRunning).toBe(false)
})

test('without an override a container goes by its mounts', async () => {
  const byFolder = attribute(parseInspect(INSPECT), ['/work/proj/backend'], {}, ROOT)
  expect((byFolder.get('/work/proj/backend') ?? []).map(c => c.name)).toContain('t1-router')
})

test('config: url shorthand, labels, defaults', async () => {
  const cfg = parseConfig(
    JSON.stringify({
      repos: ['backend'],
      urls: { a: 'https://localhost', b: { url: 'http://localhost:8000', label: 'GraphQL' } },
      docs: [{ path: 'docs/README.md' }],
    }),
  )
  expect(cfg.urls).toEqual({ a: { url: 'https://localhost' }, b: { url: 'http://localhost:8000', label: 'GraphQL' } })
  expect(cfg.containers).toEqual({})
  expect(cfg.docs).toEqual([{ label: 'docs/README.md', path: 'docs/README.md' }])
  expect(() => parseConfig('{"repos": "backend"}')).toThrow()
})

test('a fresh project: an empty config means the root repo, prompt bar on', async () => {
  const cfg = parseConfig('{}')
  expect(cfg).toEqual({ repos: ['.'], promptBar: true, urls: {}, containers: {}, docs: [] })
  expect(parseConfig('{"repos": [], "promptBar": false}')).toMatchObject({ repos: ['.'], promptBar: false })
  expect(() => parseConfig('{"promptBar": "no"}')).toThrow()
  expect(() => parseConfig('[]')).toThrow()
  expect(relativePath(ROOT, ROOT)).toBe('./')
})

test('the summary names only what the project has', async () => {
  const folder = (containers: { name: string; isRunning: boolean }[]) => ({
    path: 'x/',
    branch: 'main',
    urls: [],
    containers,
  })
  const snap = (folders: ReturnType<typeof folder>[]) => ({
    updatedAt: 0,
    repos: [{ name: '.', label: 'proj', folders }],
  })

  expect(summaryLabel(snap([folder([])]))).toBeUndefined()
  expect(summaryLabel(snap([folder([]), folder([])]))).toBe('1 worktree')
  expect(summaryLabel(snap([folder([{ name: 'a', isRunning: true }, { name: 'b', isRunning: false }])]))).toBe(
    'containers 1 of 2 running',
  )
  expect(summaryLabel(snap([folder([{ name: 'a', isRunning: true }]), folder([]), folder([])]))).toBe(
    '2 worktrees · containers 1 of 1 running',
  )
  expect(summaryLabel({ updatedAt: 0, repos: [] })).toBeUndefined()
})

test('folders are shown relative to the project', async () => {
  expect(relativePath(ROOT, '/work/proj/worktrees/backend-T-1')).toBe('worktrees/backend-T-1/')
  expect(relativePath(ROOT, '/elsewhere/x')).toBe('/elsewhere/x/')
})

test('docs become file links the app viewer opens', async () => {
  expect(
    docLinks(ROOT, [
      { label: 'Local setup', path: 'docs/local-setup.md' },
      { label: 'Notes [old]', path: 'docs/my notes (v2).md' },
    ]),
  ).toBe(
    [
      '- [Local setup](file:///work/proj/docs/local-setup.md)',
      '- [Notes \\[old\\]](file:///work/proj/docs/my%20notes%20%28v2%29.md)',
    ].join('\n'),
  )
})
