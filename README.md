# Lodestar

A personal [Claude Code](https://code.claude.com) plugin bundling my custom
workflow, review, rules, ClickUp, and reporting skills under one namespace.

All skills are invoked as `/lodestar:<skill>`.

## Skills

| Skill | Invoke | Purpose |
|-------|--------|---------|
| workflow | `/lodestar:workflow` | Phased plan-then-build discipline for non-trivial changes |
| code-review | `/lodestar:code-review` | Code review: a fast one-pass review for small diffs, or a deep one (behavior, logic, security, UI, spec, plus automated checks) |
| review-mr | `/lodestar:review-mr` | Independent MR/PR (or branch) review: behavior-diff, spec parity, test-quality; posts inline comments after confirmation |
| init-rules | `/lodestar:init-rules` | Generate project coding-standard rules at `.claude/rules/` |
| audit-rules | `/lodestar:audit-rules` | Audit existing `.claude/rules/` for clarity and integrity |
| audit-skill | `/lodestar:audit-skill` | Audit a skill against Anthropic's skill-authoring best practices and fix approved findings; `self-update` re-syncs with the live docs |
| check-rules | `/lodestar:check-rules` | Check code against `.claude/rules/` and report violations |
| audit-solution | `/lodestar:audit-solution` | Vet plans/solutions for workarounds and fragile approaches |
| grilling | `/lodestar:grilling` | Stress-test a plan, decision or idea with relentless questions |
| error-handling-audit | `/lodestar:error-handling-audit` | Find silent failures and logging gaps (Python, Laravel, React) |
| design-fresh | `/lodestar:design-fresh` | Intentional, trend-aware UI with a creative reset on demand + cross-session design journal |
| design-variations | `/lodestar:design-variations` | Render N distinct design options as one click-to-comment HTML artifact |
| design-reference | `/lodestar:design-reference` | UI/UX reference: styles, palettes, font pairings, charts and stack-specific guidance |
| visual-tuner | `/lodestar:visual-tuner` | Interactive HTML tuner for CSS values that are hard to hit by eye; send back the exact values |
| bookmarks | `/lodestar:bookmarks` | Search, file, audit and reorganize Chrome bookmarks via a sidecar index |
| clickup-tasks | `/lodestar:clickup-tasks` | Draft and create ClickUp tasks to board convention |
| clickup-comments | `/lodestar:clickup-comments` | Draft and post ClickUp comments in plain English |
| pm-report | `/lodestar:pm-report` | Plain-language, non-technical session report for a PM |
| visual-report | `/lodestar:visual-report` | Polished HTML report from data or findings, as an Artifact link or a local file |
| explain | `/lodestar:explain` | Developer-facing walkthrough of a change, mechanism, bug, task, decision or concept, on one concrete example |
| session-handoff | `/lodestar:session-handoff` | End-of-session handoff in chat so a fresh agent can continue after `/clear` |

## Mods

The marketplace also carries a mod, a separate plugin installed on its own.

### workspace-map

A pane beside the chat with the project's working folders (each repo and its git
worktrees), the branch checked out in each, the URLs to open, the containers that
belong to each folder, and a list of docs: Markdown opens in the app's file viewer, any other
file in the app macOS assigns to it. A row above
the prompt shows a summary, toggles the pane, and names the folder of the agent's
last edit. `/workspace` opens the pane too; it never opens by itself.

It shows only in projects with a `.claude/workspace-map.json`; `{}` is enough for a
single repository at the project root:

```json
{
  "repos": ["backend", "frontend"],
  "promptBar": true,
  "urls": { "web-dev": { "label": "Frontend", "url": "https://localhost" } },
  "containers": { "branch-router": "worktrees/backend-T-1" },
  "docs": [
    { "label": "Local setup", "path": "docs/local-setup.md" },
    { "label": "Prototype", "path": "../specs/prototype/index.html" }
  ]
}
```

- `repos`: git repositories, relative to the project root; their worktrees are listed by `git worktree list`.
  Default: the project root.
- `promptBar`: the row above the prompt, on by default. `false` hides it; `/workspace` still opens the pane.
- `urls`: a URL per container name, shown on the folder the container belongs to.
- `containers`: assigns a container to a folder by hand. Otherwise a container goes by its
  `dev.folder` label (`docker run --label dev.folder=<folder>`), then by the folder its bind mounts
  or compose project sit in.
- `docs`: files listed on the Docs tab, relative to the project root or absolute. A `.md` file is a link
  that opens in the app's own file viewer, which shows only files inside the session's folders. Any
  other file (an HTML prototype, a PDF) is a `↗` button that hands it to macOS `open`, so it opens in
  its default app, an HTML page in the browser, from any folder. Without any docs, the tab is not shown.

```
/plugin install workspace-map@lodestar-marketplace
```

## Install

```
/plugin marketplace add https://github.com/cyberdmitriy/lodestar.git
/plugin install lodestar@lodestar-marketplace
```

This repo is both the plugin and its own marketplace (`.claude-plugin/plugin.json`
+ `.claude-plugin/marketplace.json`). Mods from the same marketplace are installed
separately, as shown under each mod.

## Layout

```
lodestar/
├── .claude-plugin/
│   ├── plugin.json         # plugin manifest
│   └── marketplace.json    # marketplace catalog: lodestar ("./") and each mod
├── skills/
│   └── <skill>/SKILL.md
└── mods/
    └── <mod>/              # a plugin of its own: .claude-plugin/, hooks/, types/
```

## License

MIT — see [LICENSE](LICENSE).
