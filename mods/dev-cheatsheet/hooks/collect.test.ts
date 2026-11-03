import { expect, test } from 'claude-code/testing'

import { attribute, parseConfig, parseInspect, parseWorktrees, relativePath } from './collect'

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

test('folders are shown relative to the project', async () => {
  expect(relativePath(ROOT, '/work/proj/worktrees/backend-T-1')).toBe('worktrees/backend-T-1/')
  expect(relativePath(ROOT, '/elsewhere/x')).toBe('/elsewhere/x/')
})
