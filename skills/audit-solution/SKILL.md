---
name: audit-solution
description: Audit plans, solutions, and code for robustness and quality. Catches workarounds, quickfixes, fragile approaches, and suboptimal decisions that should use better patterns. Use when reviewing a plan before implementation, reviewing code after implementation, or when uncertain whether a chosen approach is the right one. Triggers on '/lodestar:audit-solution' or when the user asks to check if a solution is robust, reliable, or correct.
argument-hint: "[file-or-path]"
---

# Audit Solution

Evaluate whether a plan, solution, or implementation is **robust, reliable, and architecturally sound** — or whether it is a workaround, quickfix, or suboptimal choice that leaves root causes unresolved.

This skill does NOT check convention compliance (that is `/lodestar:check-rules`). This skill checks whether the **right approach was chosen**.

## Run the audit from outside the work

**The audit MUST be performed by a subagent that did not do the work.** You almost
certainly wrote the thing you are about to audit; you will rate your own trade-offs
as reasonable, because they seemed reasonable when you made them. This skill runs in
the main conversation only to gather scope and constraints; the audit itself goes to
a fresh subagent that never saw the reasoning.

The goal is auditor independence: the auditor must not inherit the conversation and
must not defend decisions already made. Everything below serves that goal. You are
the orchestrator: you gather scope and constraints (and may ask the user), dispatch
the auditor via the Agent tool, and relay its report. You do not audit.

Reference files live in this skill's base directory: `${CLAUDE_SKILL_DIR}/references/`
(the same path is shown as "Base directory for this skill" when the skill loads). Pass
the auditor absolute paths.

## 1. Scope Detection

Determine what to audit based on context:

1. **Arguments provided** — If invoked as `/lodestar:audit-solution <file-or-path>`, audit that specific file or path.
2. **Plan audit** — If the conversation contains a written plan or the user points to a planning document, audit the plan before code is written.
3. **Code audit** — If code changes exist in the session (check `git diff` for staged/unstaged changes), audit the implementation.
4. **Both** — If both a plan and code changes exist, audit both and cross-reference (does the code actually implement the plan's approach?).
5. **No context** — If none of the above, ask the user what to audit.

## 2. Gather Context

You do this part; it becomes the briefing for the auditor.

1. Understand the problem being solved — read the plan, task description, or relevant documentation the user points to.
2. For plan audits: read the full plan text.
3. For code audits: run `git diff` (staged + unstaged) to see all changes. For larger changes, also read the full files to understand surrounding context.
4. If the project has coding rules or conventions (e.g., CLAUDE.md, `.claude/rules/`, ADRs, style guides), read the ones relevant to the domain being audited.
5. Identify which language(s), framework(s), and layer(s) are involved.
6. Write down the constraints and rejected alternatives — the auditor cannot see the conversation where they were decided, and without them it will audit against a goal it invented.
7. Pick the report language. An explicit request wins: a language named in the arguments or in the invoking message ("report in Russian", "сделай отчет на русском"). Otherwise use the language the user wrote in before invoking the skill. Ignore the language of code, files and tool output. With no user messages to go by, use English.

## 3. Dispatch the auditor

Dispatch a fresh subagent via the Agent tool with a self-contained briefing. The
briefing must stand alone, because the auditor has none of the conversation:

1. **What to audit** — absolute paths, and `git diff` output or the plan text inline.
2. **The problem being solved**, and the constraints that shaped it — anything the
   user stated as a requirement, each rejected alternative, and any invariant that
   must hold. Without this the auditor invents its own idea of the goal and reports
   on that instead.
3. **The audit lens** — tell the auditor to read and follow
   `${CLAUDE_SKILL_DIR}/references/audit-lens.md` in full (questions, anti-patterns,
   report format).
4. **"You did not write this and have no stake in defending it. Be adversarial."**
5. **"Verify by running, not by reading"** — with whatever safe way exists to exercise
   the code (a scratch copy, a test fixture, an env var that disables a guard). A
   finding that was reproduced outranks a finding that was reasoned.
6. **Safety limits** — what must not be touched: no writes to real user data, no
   commits, no pushes, no network calls with side effects. Name the scratch directory
   it may use.
7. **The report format** from audit-lens.md (verdict + severity per finding) and the
   overall verdict.
8. **The report language** from step 2.7. All prose is written in it; verdict and
   severity labels (`FRAGILE`, `CRITICAL`, `NEEDS RETHINK`, …), code, paths and
   quotes stay as they are.

Ask for an explicit statement of which findings were verified by execution and which
are reasoning only. Treat the second kind as a hypothesis, not a defect.

### Briefing rules

- **Facts only, no arguments.** Quote the user's requirements verbatim. Label each
  rejected alternative by who rejected it: the user or the main agent. Never write
  why the main agent chose its own approach — no justifications, no hints.
- **The auditor reads the lens itself** from `references/audit-lens.md`. Do not
  paraphrase, summarize, or soften it in the briefing.

## 4. Relay the result

Show the user the auditor's report in full, without filtering, and say plainly which
findings were reproduced. Write your own lines in the report language too. If you disagree with a finding, add your objection as a
separate line below the report — never drop a finding or lower its severity. The user
decides. Where a finding is about something you wrote, say so rather than describing
it impersonally.

## On a second round

When the user asks to audit again after fixes, use **a new auditor** and give it
neither the first round's report nor its arguments. A reviewer that has already
passed over the code twice stops looking at what it has cleared, and its verdict
converges toward "fine"; a new auditor told about the old list just re-derives it.
Re-running the previous auditor is right for exactly one purpose: verifying its own
findings are closed, using its own reproduction recipes. If both matter, do both.

Fixes are a normal place for new defects. Every round after the first must audit the
fixes as fresh surface, not only re-check the original findings.

## Important Rules

- **The audit does not come from whoever wrote the code.** If you find yourself reviewing your own work directly instead of dispatching an auditor, stop and dispatch one. "It's a small change" is exactly when self-review reads clean.
