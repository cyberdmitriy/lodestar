---
name: clickup-comments
description: Use when about to post or draft a comment on a ClickUp task/ticket — replying to a question, giving a status update, or reporting what shipped. Ensures the comment is written in first person as Dmitry, short and in plain non-technical English, polished with the humanizer skill, shown as a draft first, and posted only after Dmitry's explicit OK.
---

# ClickUp Comments

How to draft and post comments on ClickUp tickets.

## Voice

- Write in **first person as Dmitry** — as if Dmitry typed it himself.
- **Short.** A few sentences. No walls of text.
- **Plain language, no code.** No code blocks, no stack traces, no internal
  identifiers (run IDs, enum values, file paths, class names). Explain *what
  changed and what it means*, not *how it was implemented*. The reader is a
  PM/stakeholder, not an engineer.
- **Always write in English**, regardless of the ticket's language.
- **Greet with "Hey <name>,"** — not "Hi", "Hello", or "Dear".
- **Neutral tone, never deferential.** Avoid eager/servile filler like
  "Happy to…", "Feel free to…", "Let me know if…". State things plainly.
- **Clear referents only.** Never mention a person or group the reader can't
  identify from the thread — no vague "they"/"them".
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
