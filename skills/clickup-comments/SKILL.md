---
name: clickup-comments
description: Use when about to post or draft a comment on a ClickUp task/ticket — replying to a question, giving a status update, or reporting what shipped. Ensures the comment is written in first person as Dmitry, short and in plain English that stays concrete (names services, environments and releases, says where a result can be checked, no code), opens with an @mention of the person it addresses in a way that fits the thread ("Hey", "Btw" or straight in, never the same opening twice in a row), links every ticket it names, refers only to what the reader can see and reports item by item without restating what the ticket asked for, polished with the humanizer skill, shown as a draft first, and posted only after Dmitry's explicit OK.
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
  about: services, systems, environments, releases, screens, fields as users
  see them ("the community service", "release 1.38", "the LMS dev instance").
  Leave out what only a developer reading the code needs: file paths, class
  and method names, enum values, run IDs, branches and commits. Test: could
  the reader pass this name to someone else and get an answer? If yes, keep
  it. A vague stand-in ("the same service", "the relevant system") is worse
  than the name.
- **"Done" says where the reader can check it.** A PM checks a result in an
  environment, not in git. Say where the change can be seen: production,
  staging, a dev instance, and the page when that helps ("I've deployed it
  to the LMS dev instance"). A branch, commit or merge request goes in only
  when the reader works with it, e.g. a merge request they review. Check that
  the change is really there before writing it. Built but not deployed
  anywhere yet: say so instead of "done".
- **Refer only to what the reader knows and can open.** Every question, ID,
  document or text the comment points to must be one the reader has seen or
  can open: the ticket, the spec, a page, a thread they were in. Our internal
  notes, code and code comments, commit messages, another person's own
  question numbers and internal decision IDs are invisible to them. Leave
  such a reference out; if the point matters, say it in plain words.
- **Always write in English**, regardless of the ticket's language.
- **The opening fits the thread.** Look at Dmitry's last comment in this
  ticket (step 1) and pick one:
  - `Hey [@Anna](#user_mention#81344),` when it is the first comment to that
    person in this ticket today and Dmitry's previous comment in the ticket
    did not open with "Hey";
  - `Btw [@Anna](#user_mention#81344), …` for something extra nobody asked
    for: a side finding, a follow-up to Dmitry's own comment;
  - `[@Anna](#user_mention#81344)` straight into the content, for a direct
    answer to the question that person just asked, or a follow-up the same day.

  Never the same opening twice in a row in a ticket; "Hey" at most once a day
  per ticket. Never "Hi", "Hello" or "Dear".
- **@mention the person the comment is for, once, in the opening**, so ClickUp
  notifies them, with their numeric ClickUp user id. A plain "@Anna" stays
  text and notifies no one. Any other person the comment names is an @mention
  the first time too; later mentions of the same person are plain names. Take
  the id from the `user.id` of their comment in the thread, or look it up with
  `mcp__clickup__clickup_find_member_by_name`.
- **Every ticket you name is a link to it**, with the ticket ID as the text:
  `[PROJ-123](https://app.clickup.com/t/<workspace id>/PROJ-123)`. The URL is
  `https://app.clickup.com/t/<workspace id>/<custom id>`, or the `url` that
  `mcp__clickup__clickup_get_task` returns.
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
  and noise. Already deployed: say where it is deployed (rule above). Not
  deployed yet: say it is not visible anywhere yet, with no date. Deploy
  manual or gated: name what is required and who does it, never a vague
  future tense.

## Structure

- **Lead with the outcome.** Put the answer or result in the first sentence;
  details after.
- **Answer the question directly** when the comment is a reply — don't build
  up to it.
- **Stay on the task.** Report the result of the task. Do not retell the
  ticket or earlier comments. Add a question, decision or proposal only when
  the task needs it to be finished or to move forward; side findings and
  "nice to have" ideas go to the report or a separate ticket, not here.
- **Report item by item, without restating the items.** When the ticket or
  the reader's comment lists what is needed, answer with a list in the same
  order, one short line per item: "1. Done.", "2. Done.", "3. Not done: <why,
  or the blocker>. <the question that unblocks it>". Name an item by its
  number, or by a few words of it when the request is not numbered; do not
  copy its description back. Optional: when an item was described vaguely or
  at length, one concrete line on how it now works ("2. Done, the export runs
  every night at 2:00.") focuses the reader. Around the list: where it can be
  checked, what differs from the request, what the reader has to decide.
- **Say what changed in the spec, on its own line.** When the work changed
  the spec, e.g. the section statuses a project's workflow sets at the start
  or the end of a ticket, add one line after the list: which sections, and
  their new status, each section number a link to it in the spec viewer:
  "Spec: [5.1.2.2](<spec viewer URL>#5.1.2.2-training-category) and
  [5.1.2.6](<spec viewer URL>#5.1.2.6-event-image) are now In Development."
  Write it only once the change is pushed and visible there.
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
> [@Anna](#user_mention#81344) I've deployed it to staging:
> 1. Nightly export: done.
> 2. Field Region: done.
> 3. Region list: 12 regions, the five from the spec plus 7 I added. Does the client want others? Otherwise the list stays.
>
> Spec: [3.2](<spec viewer URL>#3.2-export) and [3.4](<spec viewer URL>#3.4-customer-form) are now Done.

One line per item of the ticket, in its order. Items 1 and 2 are done as
asked, so they say only "done"; item 3 differs from the spec and needs an
answer, so it says more. The spec line is ours, not an item of the ticket, so
it stands after the list.

## Procedure (never skip a step)

1. **Identify the recipient.** Read the ticket thread with
   `mcp__clickup__clickup_get_task_comments` (and
   `mcp__clickup__clickup_get_threaded_comments` when a comment has replies).
   The recipient is whoever the comment is for — the person who asked the
   question, the last commenter in the thread, or the assignee. Note their
   numeric user id for the @mention in the opening, and note the opening and
   date of Dmitry's last comment in the ticket (Voice). If the recipient
   is unclear, write with no @mention — a general comment aimed at the PM.
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
   the custom id. Use `reply_to_id` when replying inside an existing thread;
   if the space has threaded replies switched off ("Threaded comments
   ClickApp must be enabled"), post the same text as a top-level comment.
