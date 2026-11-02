---
name: clickup-comments
description: Use when about to post or draft a comment on a ClickUp task/ticket — replying to a question, giving a status update, or reporting what shipped. Ensures the comment is written in first person as Dmitry, short and in plain English that stays concrete (names services, branches and releases, no code), polished with the humanizer skill, shown as a draft first, and posted only after Dmitry's explicit OK.
---

# ClickUp Comments

How to draft and post comments on ClickUp tickets.

## Voice

- Write in **first person as Dmitry** — as if Dmitry typed it himself.
- **Short and concrete. No filler.** Every sentence carries a fact, a result, a
  decision or a question. Cut any sentence that only frames, softens, explains
  the sentence before it, or retells the thread. Several results or items: a
  list, one short line each. The comment's purpose decides its shape (status
  report, answer, question, heads-up); there is no fixed template.
- **Plain language, no code.** No code blocks, no stack traces. Explain *what
  changed and what it means*, not *how it was implemented*. The reader is a
  PM/stakeholder, not an engineer.
- **Concrete, not abstract.** Name the things the reader can act on or ask
  about: services, systems, branches, releases, screens, fields as users see
  them ("the community service", "release 1.38", "the production branch").
  Leave out what only a developer reading the code needs: file paths, class
  and method names, enum values, run IDs. Test: could the reader pass this
  name to someone else and get an answer? If yes, keep it. A vague stand-in
  ("the same service", "a separate branch", "the relevant system") is worse
  than the name.
- **Always write in English**, regardless of the ticket's language.
- **Greet with "Hey <name>,"** — not "Hi", "Hello", or "Dear".
- **Neutral tone, never deferential.** Avoid eager/servile filler like
  "Happy to…", "Feel free to…", "Let me know if…". State things plainly.
- **Clear referents only.** Never mention a person or group the reader can't
  identify from the thread — no vague "they"/"them".
- **Assign actions only as Dmitry said.** Otherwise state next steps
  impersonally ("the key needs to be removed"), assigned to no one: not
  Dmitry, not the recipient, not anyone else.
- **Never promise a future deploy.** No "goes out with the next deployment",
  "will be live after the deploy", or any variant. By the time the comment is
  read the change is normally already running, so the sentence is both wrong
  and noise. Pushed, and the project deploys on push: state it as done — "it's
  live" — or, usually better, say nothing about deploying at all. Not pushed
  yet: do not mention deploying in any form. Deploy manual or gated: name what
  is required and who does it, never a vague future tense.

## Structure

- **Lead with the outcome.** Put the answer or result in the first sentence;
  details after.
- **Answer the question directly** when the comment is a reply — don't build
  up to it.
- **Stay on the task.** Report the result of the task. Do not retell the
  ticket or earlier comments. Add a question, decision or proposal only when
  the task needs it to be finished or to move forward; side findings and
  "nice to have" ideas go to the report or a separate ticket, not here.
- **Make asks explicit.** When the task does need an answer or a decision,
  state exactly what is needed and from whom.
- **End with the next step** when there is one — but never a deploy promise
  (see Voice).
- **No filler closers.** Stop when the point is made — don't tack on
  unsolicited offers or hedges at the end.

Example, a status report with a question:

❌ Wordy
> Hey Anna,
>
> I went with your suggestion and run the export every night now. The rest of
> the admin part is built as well: the customer form has the new required field
> Region, and a region that is switched off can't be picked anymore. About the
> regions: the spec only says "the regions we serve" and names five of them, so
> the list has 12 regions: those five plus 7 I added. Does the client want other
> regions in the list? If not, it stays as it is.

✅ Concrete
> Hey Anna,
>
> Done:
> - The export runs every night.
> - Customer form: new required field Region. Switched-off regions can't be picked.
>
> Regions: the list has 12, the five from the spec plus 7 I added. Does the client want others? Otherwise the list stays.

## Procedure (never skip a step)

1. **Identify the recipient.** Read the ticket thread with
   `mcp__clickup__clickup_get_task_comments` (and
   `mcp__clickup__clickup_get_threaded_comments` when a comment has replies).
   The recipient is whoever the comment is for — the person who asked the
   question, the last commenter in the thread, or the assignee. Address them
   by name in the comment. If the recipient is unclear, write with no
   name-address — a general comment aimed at the PM.
2. **Draft** the comment per the Voice rules above.
3. **Polish** the draft with the `humanizer` skill to strip AI-writing tells.
4. **Show the draft to Dmitry.** Do NOT post yet.
5. **Wait for explicit confirmation.** Any reply that isn't a clear "post it" /
   "ок" is treated as edits — revise and re-show.
6. **Post only after OK**, using `mcp__clickup__clickup_create_comment` with
   `notify_all: true`. Target the task via `entity_type: "task"` +
   `entity_id: <task id>` — the tool has no `task_id` parameter, and passing
   one fails with `entity_id is required for top-level comments`. Use the
   real ClickUp task id (e.g. `86ey4xzgy`), not the custom id (`FRAUN-118`);
   resolve it first with `mcp__clickup__clickup_get_task` if you only have
   the custom id. Use `reply_to_id` when replying inside an existing thread.
