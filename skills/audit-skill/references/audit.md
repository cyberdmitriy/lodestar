# Audit procedure (runs in a subagent)

You audit one Agent Skill against the checklist. You change no files. You receive the skill directory, the linter output, and the checklist path.

## Steps

1. Read the checklist completely.
2. Read the target `SKILL.md` and every file it bundles: references, examples, templates. For scripts, read enough to judge rules X1 to X4, X7 and X8. Skip binary assets.
3. Take the linter findings as given. Do not re-check what the linter covers; confirm or dismiss only its heuristic hits (D2, D3, C1, N3, P3, P5), which can be false positives. For example, a quoted bad example inside the skill is not a violation. A rule that does not apply to this skill (for example D3 on a skill with `disable-model-invocation: true`, or P3 on a file that is always read in full) is dismissed, not downgraded.
4. Go through every **judge** and **both** rule. Record a finding only where you can point to a file and line and quote the text. No speculative findings.
5. Check the sibling skills in the same `skills/` directory for N4 (naming pattern) and for broken cross-references to them.
6. Self-check every finding (see below). Drop the ones that fail.
7. Write the report.

## Self-check

A rule is a means, not the goal. A finding stays only when fixing it makes the skill better in practice. For each finding, answer three questions:

1. **Does the rule's reason apply here?** Each rule exists for a reason: a description is matched against user intent, a TOC helps a partial read, a long SKILL.md costs main-context tokens. Check who reads the text, when, and how much. If the reason does not hold for this skill (a manual-only skill, a file always read in full, a reference only a subagent reads), drop the finding.
2. **What concretely improves?** Name the change in behavior: Claude triggers on the right requests, follows a step it would have missed, avoids a wrong result, saves context in every run, the user gets fewer prompts. "Complies with rule X" is not an answer. If you cannot name one, drop the finding.
3. **What can the fix break?** Check whether it removes guidance that steers Claude's attention or priorities, adds a read or a permission prompt to every run, breaks invocations or cross-references, or undoes a documented deliberate choice. If the risk is equal to or larger than the gain, drop the finding or change the fix so it keeps what works.

List the dropped findings in the report with one line each, so the user can see what was considered.

## Judging well

- Weigh each finding by its real effect on how Claude discovers and follows the skill. A long but dense skill is fine; a short skill with a vague description is not.
- C2 (conciseness): quote the exact sentences that explain what Claude already knows. Do not flag domain-specific context, project conventions, or "why" explanations that change behavior.
- R1 (degrees of freedom): say which direction is wrong, too rigid or too loose, and why the task's fragility calls for the other.
- Do not demand the gerund form, a table of contents, or scripts where the skill does not need them.
- The skill's authors may have documented a deliberate deviation (for example "intentionally has no `context: fork` because…"). Respect it and do not report it.

## Report format

```
## Skill audit: <name>

**Path:** <dir> | **Body:** <n> lines | **Description:** <n> chars
**Verdict:** <one sentence: overall state and the single most important fix>

| # | Rule | Severity | Location | Problem | Benefit | Fix |
|---|------|----------|----------|---------|---------|-----|
| 1 | D3 | important | SKILL.md:3 | <what is wrong, quoting the text> | <answer to self-check question 2> | <the concrete change: new wording or a move to a file> |

### Strengths
- <2-4 bullets: what already follows best practice, so fixes do not undo it>

### Dropped in self-check
- <rule, location: why fixing it would not help or would hurt>

### Recommendations (not defects)
- <T-rules and any optional improvements>
```

Number findings sequentially and order them by severity (critical, then important, then minor). For each Fix, give the actual replacement text when it is under ~5 lines; for larger restructures, name the target file and what moves there. With no findings, say so and keep the Strengths section. Omit "Dropped in self-check" when nothing was dropped.
