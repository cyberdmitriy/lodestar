# Lodestar

A personal [Claude Code](https://code.claude.com) plugin bundling my custom
workflow, review, rules, ClickUp, and reporting skills under one namespace.

All skills are invoked as `/lodestar:<skill>`.

## Skills

| Skill | Invoke | Purpose |
|-------|--------|---------|
| workflow | `/lodestar:workflow` | Phased plan-then-build discipline for non-trivial changes |
| code-review | `/lodestar:code-review` | Deep code review: behavior, logic, security, UI, spec, plus automated checks |
| review-mr | `/lodestar:review-mr` | Independent MR/PR (or branch) review: behavior-diff, spec parity, test-quality; posts inline comments after confirmation |
| init-rules | `/lodestar:init-rules` | Generate project coding-standard rules at `.claude/rules/` |
| audit-rules | `/lodestar:audit-rules` | Audit existing `.claude/rules/` for clarity and integrity |
| audit-skill | `/lodestar:audit-skill` | Audit a skill against Anthropic's skill-authoring best practices and fix approved findings; `self-update` re-syncs with the live docs |
| check-rules | `/lodestar:check-rules` | Check code against `.claude/rules/` and report violations |
| audit-solution | `/lodestar:audit-solution` | Vet plans/solutions for workarounds and fragile approaches |
| error-handling-audit | `/lodestar:error-handling-audit` | Find silent failures and logging gaps (Python, Laravel, React) |
| design-fresh | `/lodestar:design-fresh` | Intentional, trend-aware UI with a creative reset on demand + cross-session design journal |
| design-variations | `/lodestar:design-variations` | Render N distinct design options as one click-to-comment HTML artifact |
| bookmarks | `/lodestar:bookmarks` | Search, file, audit and reorganize Chrome bookmarks via a sidecar index |
| clickup-tasks | `/lodestar:clickup-tasks` | Draft and create ClickUp tasks to board convention |
| clickup-comments | `/lodestar:clickup-comments` | Draft and post ClickUp comments in plain English |
| pm-report | `/lodestar:pm-report` | Plain-language, non-technical session report for a PM |
| explain | `/lodestar:explain` | Developer-facing walkthrough of a change, mechanism, bug, task, decision or concept, on one concrete example |
| session-handoff | `/lodestar:session-handoff` | End-of-session handoff in chat so a fresh agent can continue after `/clear` |

## Install

### On this machine

The plugin auto-loads from `~/.claude/skills/lodestar/` — no setup needed.

### On another machine

```
/plugin marketplace add https://github.com/cyberdmitriy/lodestar.git
/plugin install lodestar@lodestar-marketplace
```

This repo is both the plugin and its own marketplace (`.claude-plugin/plugin.json`
+ `.claude-plugin/marketplace.json`).

## Layout

```
lodestar/
├── .claude-plugin/
│   ├── plugin.json         # plugin manifest
│   └── marketplace.json    # marketplace catalog (source: "./")
└── skills/
    └── <skill>/SKILL.md
```

## License

MIT — see [LICENSE](LICENSE).
