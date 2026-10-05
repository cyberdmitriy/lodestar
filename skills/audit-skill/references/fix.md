# Fix procedure

You apply only the approved findings from the audit report. Nothing else.

## Rules

- Edit only files inside the target skill directory. Exception: renaming a skill (N2) also requires updating every cross-reference to it in the same collection; grep the collection root for the old name and fix each hit.
- When a fix moves content to a reference file, move it verbatim and leave a one-line pointer in SKILL.md that says when to read the file. Do not paraphrase while moving.
- When a fix shortens text (C2, D6), cut sentences; do not rewrite the meaning of the ones you keep.
- Description rewrites (D2, D3, D5): third person, what it does first, then "Use when…" with the trigger terms from the old description. Never drop an existing trigger term unless the finding says it is wrong.
- Keep the skill's own style: heading levels, list style, language, terminology.
- Do not bump versions, commit, or push.

## Loop

1. Apply the approved fixes one finding at a time.
2. Rerun the linter: `python3 <skill-dir>/scripts/lint_skill.py <target>` (the orchestrator gives you the absolute script path).
3. If a lint finding is new, or an approved lint finding is still present, fix it and rerun. Stop after three rounds and report what remains.
4. Reread each edited file once from top to bottom to check for broken links, dangling references and contradictions you introduced.

## Report

```
## Fixes applied: <name>

| # | Rule | Status | Change |
|---|------|--------|--------|
| 1 | D3 | fixed | description rewritten (shown below) |
| 4 | P1 | partial | moved "API reference" to references/api.md; body is now 430 lines |

Linter: <n> findings before, <n> after (<list of remaining rule IDs, if any>)
Files changed: <list>
```

After the table, show the old and new description whenever it changed.
