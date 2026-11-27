# Maintaining code-review

Guidance for whoever edits this skill. `SKILL.md` does not load this file; the skill never needs it at run time.

This skill is designed around a clear separation of concerns. Understand it before editing.

## File layout

- `SKILL.md` — the orchestrator. Runs in the main conversation, because only there can it ask the user (AskUserQuestion is not available to subagents or `context: fork`). It resolves the scope, picks the depth, starts the review subagent, relays the report, asks which issues to fix, starts the fix subagent, and after a fast review offers `/lodestar:security-audit`. It never reads or analyzes the code itself.
- `references/review-fast.md` — the fast review: one agent, one pass over a small diff. Runs in a subagent.
- `references/review.md` — the deep review (Phases 1–3). Runs in a subagent: isolated from the session's reasoning, and only its report comes back to the main context.
- `references/fix.md` — applying approved fixes. Runs in a second subagent.

Review checklists go in `references/review.md` and `references/review-fast.md`, not in `SKILL.md`.

## Two depths

- **fast** (`references/review-fast.md`) is fast because it is one agent with one pass: it starts no subagents, calls no sibling skills, reads the diff with `git diff -W` and goes one hop to callers and callees. Adding a phase, an agent or a sibling call to it turns it back into the deep review — put that in `references/review.md` instead.
- **deep** (`references/review.md`) is the full review, for large diffs and before a merge request.
- The orchestrator picks the depth in `SKILL.md` Step 6 from metadata only: `git diff --numstat` against the thresholds (15 files not counting tests and Markdown, 500 added lines) and risk signals in file paths. It never reads the diff — that would pull the code into the main conversation, where the session's reasoning colors the judgment.
- Generated-file detection lives in `SKILL.md` Step 5 and serves both depths: the orchestrator passes the list, and neither review reads those files in full.
- Both reports use the same **Recommended fixes** table (`#`, `Do`, `Reason`: the one table allowed, narrow enough for the chat pane), the same issue blocks (`#### <n> · <severity> · <file:line>`, then `Issue:`, `Fix:`, `Confidence: · Source:`) for Critical and Important, one line per Minor issue and the same **Decisions needed** list. `references/fix.md` reads either report, and `SKILL.md` Step 9 builds the Fix question from the table. Reports are read in a narrow chat pane: plain markdown, no other tables, no code blocks around report text, the verdict and counts on the first two lines, run metadata on the last. Change the format in both files or in neither.
- Report language: the orchestrator settles it in Step 1 and passes `Report language:` to every subagent. Labels, headings, table column names, severity names, `Do` values and source tags stay in English, because the orchestrator and the fix step find them by name; everything else follows the language.
- Issues in code the diff does not change stay out of the fix options: deep lists them as `O1`, `O2`… under **Outside the diff**, fast only counts them. The user can still pick one by typing its number.
- What the user decides about a fix (an option, a note like "backlog only") reaches the fix subagent only through the `User decisions` block in Step 10. Never leave it to the conversation: the subagent does not see it.
- The deep review calls `/lodestar:security-audit --report-only` in Phase 2 Step 5. Security categories, stack checklists and exclusions live in that skill; the Security section of `references/review.md` and "Security and access" in `references/review-fast.md` stay short in-pass checks. Make security checking deeper in `security-audit`, not here.
- The fast review never calls `security-audit` itself. Its report has a **Security coverage** section (what the pass checked, the Security issues, the security-sensitive changes, a recommendation), and `SKILL.md` Step 11 reads it after the fix step to offer the audit. The section's three recommendations and Step 11's situations must match: change them together.
- Several repositories: `SKILL.md` Step 2 finds them and asks which to review, then runs Steps 2 to 7 per repository. Every subagent prompt (review, fix) carries `Repository:`, the review files run git as `git -C <repository>`, and sibling calls get `--repo <repository>` (security-audit) or absolute paths. A new prompt template needs the same field.
- Questions carry facts: Step 4 says in one sentence what the recommended scope holds that the user may not expect (other tasks' commits, where the task's work sits), from git metadata only. Keep that rule when you add options.
- The fast checklist is a short subset of the deep one. When you change a correctness or security check in `references/review.md`, check whether `references/review-fast.md` has the same item and update it too.

## What belongs in `references/review.md` (deep analysis requiring reasoning)

- Behavioral completeness — mapping callers, states, verifying preservation
- Logic analysis — edge cases, race conditions, failure modes, data integrity
- Security analysis — injection, auth bypass, sensitive data exposure
- UI impact tracing — data flow from backend to frontend, contract breakage
- Spec alignment — requirement coverage, scope creep
- Testing assessment — coverage gaps, meaningful assertions

## What belongs in `.claude/rules/` (convention/pattern checking)

- Architecture patterns (thin controllers, Actions vs Services, repositories)
- Naming conventions (files, classes, enums, routes)
- Code style (formatting, imports, guard clauses)
- Framework conventions (Form Requests, DTOs, eager loading, migrations)
- Performance patterns (pagination, bulk ops, indexes, caching)
- API contracts (casing, resource classes)

**If you're about to add a checklist item that can be verified by pattern matching — STOP.
Add it to an existing rule in `.claude/rules/` or create a new rule file.
`/lodestar:check-rules` (Phase 2 Step 3) will pick it up automatically.**

The deep review invokes `/lodestar:check-rules` in Phase 2, and the fast review reads `.claude/rules/` itself, so any convention added to rules is automatically
included in every code review. Adding it to `references/review.md` or `references/review-fast.md` too creates duplication and maintenance burden.

### Decision test

Ask: "Can this be checked by reading the code structure alone, without understanding the business context?"
- **Yes** → rule in `.claude/rules/`
- **No** → section in `references/review.md`

