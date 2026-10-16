---
name: pm-report
description: Use when the user says "report for PM", "PM report", "report for the PM", "summary for PM", "summarize for PM", "give me a PM summary", "plain English session report", "Bericht für PM", "PM-Bericht", or any near-equivalent — wants a non-technical session summary for the project manager. Produces a chat-only adaptive report covering what shipped, how to find it, how to verify, and outstanding items. Always reviews the whole session, not just the latest task. Never writes to a file.
disable-model-invocation: true
---

# PM Report

Produce a non-technical, PM-ready summary of everything done in the current session. The PM copies it from chat into Slack / email / ClickUp / a status comment.

This is a **stakeholder-facing artifact**, not a context handoff. Audience is a non-engineer who cares about outcomes, costs, deploy-readiness, and what they can verify themselves — not file paths, class names, or process narratives.

## When to invoke

User says: "report for PM", "PM report", "report for the PM", "summary for PM", "summarize for PM", "give me a PM summary", "plain English session report", "Bericht für PM", "PM-Bericht", or any near-equivalent intent. Description matching is semantic — equivalent intent in any language triggers the skill, not just the listed phrases.

## How to produce the report

1. **Review the FULL conversation**, not just the last few turns. Whole-session scope is mandatory — if the user wanted only the latest task, they'd say so.
2. **Apply the include / exclude rules below to every paragraph** before writing it. This is the length control — there is no word cap.
3. **Pick one adaptive shape** based on what was done. Use the selection rules.
4. **Match the conversation's language.** German session → German report. English → English. Don't hardcode.
5. **Produce the output in chat.** Do not write a file. Do not update memory. Chat-only by design.

## What goes IN — PM cares

- **The problem in business framing** — 1–2 sentences. "Our X was wrong" / "Users couldn't Y" / "We were spending $N on Z." Never "the assembler returned 0" — always the user-visible consequence.
- **What's different now from the PM / user's POV** — new capability, fixed behavior, removed risk. Concrete outcomes, not implementation. "Admin can now toggle X" — not "Added ConfigKeyEnum::X".
- **Cost / time / risk implications** — anything affecting budget, deploy timing, or downstream decisions.
- **Outstanding items the PM needs to act on or wait for** — confirmations needed, deploys to schedule, follow-ups created.
- **Trust signals — selectively.** "All 824 tests pass including the 5 new ones we added" is a signal (number + context). "Lint clean" is not (assumed). Cite test counts only when they bolster credibility.
- **Before/after scenarios** when behavior or output changed in a way that matters. *Old: every Gemini run logged the same generic label, you couldn't tell Max from Preview. Now: each cost record carries the real agent name.* Skip when contrast is trivial or implied.
- **How to find new surfaces.** For any new page, modal, admin setting, or config — give the exact navigation path. *Admin → Conversations → click conversation → Researches → ⋮ → Spendings.* If the PM can't find it, they can't try it.
- **How to verify / reproduce.** A short repro path the PM can follow. *Start a new research with variant = Preview, open the Spendings modal — four sub-rows should appear.* Skip when the change is invisible to the PM (pure refactor, internal hygiene).

## What stays OUT — PM doesn't care

- File paths, class names, function signatures, migration filenames, table column names.
- Internal refactors and code-style fixes (Pint passes, PHPStan clean — internal hygiene).
- Audit-and-fix loops. Present the **final state**. Never "we found bugs in our own code then fixed them" — exception below in "The save rule".
- Tool calls, internal back-and-forth, design alternatives that were considered and dropped.
- Process narration ("first I did X, then Y, then Z").
- Trade-offs the PM has no decision power over.

Leaving code details out does not mean going vague. Keep the names the PM can act on or pass on: services, systems, branches, releases, screens, settings. "Goes into the community service" beats "goes into the same service as the events"; "waits for release 1.38" beats "waits for the next release". Test: could the PM forward the name to someone and get an answer? If yes, keep it.

## Conditional rules (judge case-by-case)

- **Before/after, navigation, repro** — apply only when they materially help the PM verify or use the change. A pure bugfix to an internal queue retry doesn't get nav paths or before/after — there's nothing the PM would see.
- **Multi-task synthesis** — if the session covers unrelated tasks, group per task (Shape D). If they're related (impl + bugfix + docs for one feature), synthesize into a single shape.

## Adaptive section shapes — pick one

Section names are starting points. Rename if it helps clarity. Plain English only — no "Implementation Notes", "Acceptance Criteria", etc.

### Shape A — New feature / capability shipped (default for most work)

```
The problem        — 1-2 sentences, business framing
What works now     — outcome bullets, grouped by area if needed
                     (use sub-headings only if 3+ distinct features)
How to see / try   — navigation path + repro steps (if applicable)
Quality bar        — trust signals only (selectively)
Outstanding items  — what's not done yet, what PM needs to act on
```

### Shape B — Bug fix

```
The bug            — what was wrong, what user saw / what we billed wrong / etc.
The fix            — one sentence on what changed
How to confirm     — verify steps the PM can run
Risk               — what we did to make sure we didn't break anything else
                     (only if there's a real risk worth flagging)
```

### Shape C — Investigation / no code shipped

```
The question       — what we set out to find
What we found      — concrete findings, with evidence
Recommendation     — what to do next
```

### Shape D — Multi-task session (multiple unrelated chunks)

```
This session covered N items. Each below stands alone.

### Item 1 — <one-line title>
<one of Shapes A/B/C, compressed>

### Item 2 — <one-line title>
<one of Shapes A/B/C, compressed>
```

### Selection rules

- Everything ties to one "what we shipped" outcome → **Shape A**.
- Everything is a single defect → **Shape B**.
- No code was changed (we just researched / decided / planned) → **Shape C**.
- 2+ unrelated chunks → **Shape D**, with each chunk in its own sub-shape.

## Hard rules

1. **Chat-only output.** Never write the report to a file. Never update memory.
2. **Match the conversation's language.** German session → German report. English → English. Don't hardcode.
3. **Whole session, not "the last task".** Review the full conversation from the start.
4. **No emojis, no hype, no "great job".** Plain professional tone — same discipline as `session-handoff`.
5. **Never invent state.** If a section has no real content, **omit the section entirely**. Don't pad. Don't write "Outstanding items: None" — just skip the section.
6. **Always do the include / exclude pass before writing.** Mentally check every paragraph against the rules above before emitting it.
7. **Heading format.** Top heading is `# <One-line outcome title>` — no fixed prefix like "PM Report:". Title describes the outcome (*"Gemini Deep Research cost tracking now matches Google's bill"*), not the task number. PM thinks in outcomes.

## Anti-patterns — do not do these

- Summarizing the last 3 turns and calling it a session report.
- Including audit-and-fix loops as "transparency". PM doesn't want to read about bugs introduced and removed in the same session — show the final state.
- Mentioning specific file paths, class names, function signatures unless the PM needs to navigate them.
- Listing every test that passed. "All tests pass" is enough. Cite numbers only when they add credibility ("all 824 tests including the 5 we added").
- Writing a process narrative.
- Adding section names that don't apply ("Outstanding items: None" — just omit the section).
- Hedging ("hopefully this addresses...", "should now work"). Either there's evidence or there isn't. State it.

## The "save" rule (when internal process IS worth surfacing)

If a self-audit caught a production-blocking defect before ship, surface it in **one sentence** — it's a positive signal (we have safeguards), not an admission of sloppiness.

Example: *"The original spend-cap code would have silently failed in production — caught in review before deploy."*

Limit to 1 sentence. Don't elaborate. Don't itemize audit findings. Don't apply for trivial / cosmetic catches.
