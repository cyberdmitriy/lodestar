---
name: audit-skill
description: Audits an Agent Skill (SKILL.md plus its bundled files) against Anthropic's official skill-authoring best practices and Claude Code skill docs, then fixes the approved findings. Checks frontmatter limits, description triggers, progressive disclosure, conciseness, workflows, degrees of freedom and scripts. Use when the user asks to audit, review, lint, check or improve a skill, or asks whether a skill follows best practices. `self-update` mode re-syncs the checklist with the live docs.
argument-hint: "[<skill-path> | <skill-name> | self-update]"
disable-model-invocation: true
---

# Audit skill

You run in the main conversation, because the user approves the fixes. The audit and the fixes run in subagents, so the review is independent and the file reads stay out of this context.

Base directory of this skill: `${CLAUDE_SKILL_DIR}`. Give subagents absolute paths.

- Rules: [references/checklist.md](references/checklist.md)
- Audit procedure (subagent): [references/audit.md](references/audit.md)
- Fix procedure (subagent): [references/fix.md](references/fix.md)
- Docs re-sync (this conversation): [references/self-update.md](references/self-update.md)
- `scripts/lint_skill.py <skill-dir>`: run it; prints JSON lint findings
- `scripts/check_docs.py`: run it; compares the live docs with the last synced snapshot. Sources and sync state are in [references/sources.json](references/sources.json); snapshots are in `snapshots/`.

**Arguments:** `$ARGUMENTS`

## Mode

- `self-update` → read [references/self-update.md](references/self-update.md) and follow it. Stop after it.
- anything else, or empty → audit, below.

## Audit

### 1. Resolve the target

- An existing path → that skill directory, or the directory of the given `SKILL.md`.
- A name → look for `<name>/SKILL.md` under `./skills/`, `./.claude/skills/`, `~/.claude/skills/` and `~/.claude/plugins/cache/` (plugin namespace prefixes like `plugin:` are stripped). One match → use it. Several → ask with AskUserQuestion which one.
- Empty → if the current directory holds a single skill, or the conversation just created or edited one, propose it; otherwise ask for the path.

If the target is inside `/plugins/cache/`, warn that fixes there are lost on the next plugin update, and ask for the source repository path. Audit the cache copy only if the user wants a report without fixes.

### 2. Check the docs are current

Run `python3 ${CLAUDE_SKILL_DIR}/scripts/check_docs.py` (no `--diff`; keeps this step cheap).

- `fresh` → continue silently.
- `stale` → tell the user, in one line, that the official docs changed since `<last_synced>` and the checklist may be outdated. Ask with AskUserQuestion (header `Docs`): `Audit now, update later (Recommended)` / `Run self-update first`. On the second option, follow [references/self-update.md](references/self-update.md), then come back to step 3.
- `unreachable` → say so in one line and continue with the local checklist.

### 3. Lint

Run `python3 ${CLAUDE_SKILL_DIR}/scripts/lint_skill.py <target>` and keep the JSON output.

### 4. Audit in a subagent

Start one `general-purpose` subagent in the foreground (`run_in_background: false`) with exactly this prompt:

```
Read <abs>/references/audit.md and follow it exactly.

Target skill: <abs target dir>
Checklist: <abs>/references/checklist.md
Linter output:
<the JSON from step 3>
```

Add nothing from this conversation: no reasons the skill was written this way, no hints. The subagent judges the skill as a first-time reader, as Claude does when it loads it.

### 5. Relay the report

Print the subagent's report to the user in full: every row, as written. With no critical, important or minor findings, stop here.

### 6. Ask what to fix

Ask with AskUserQuestion, header `Fix`:

| Option | Description |
|---|---|
| `Critical + Important (Recommended)` | Fix every critical and important finding |
| `Everything` | Also fix the minor findings |
| `Report only` | Change nothing |

End the question with: *"Or type finding numbers in Other, e.g. `1, 3, 5`."* With no critical or important findings, drop the first option and recommend `Report only`. Recommendations (T-rules) are never fixed automatically.

### 7. Fix in a subagent

Start one `general-purpose` subagent in the foreground:

```
Read <abs>/references/fix.md and follow it exactly.

Target skill: <abs target dir>
Linter: python3 <abs>/scripts/lint_skill.py
Approved findings: <numbers>

Audit report:
<the full report from step 4>
```

Print its result to the user in full. If the target lives in a git repository, show `git diff --stat` for the target directory. Do not commit or bump versions; offer to if the repository versions its skills (for example a plugin's `plugin.json`).
