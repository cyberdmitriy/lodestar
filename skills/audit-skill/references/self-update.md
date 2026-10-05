# Self-update procedure

Brings `checklist.md` and the limits in `scripts/lint_skill.py` in line with the current official docs. Runs in the main conversation, because the user approves every change.

## 0. Make sure you edit the source, not a cache

If the skill's base directory is inside a plugin cache (its path contains `/plugins/cache/`), edits there are overwritten on the next plugin update. Ask the user for the path to the source repository of this skill and work there. Run the scripts from that source copy too.

## 1. Find what changed

Run `python3 <skill-dir>/scripts/check_docs.py --diff`.

- `fresh` → tell the user the checklist matches the docs as of each source's `last_synced` date, and stop.
- `unreachable` for a source → report the URL and error. Ask whether the page moved; if the user gives a new URL, update it in `references/sources.json` and rerun.
- `stale` → continue with each stale source. If `last_synced` is empty (first sync), the diff is truncated, or `snapshots/<id>.txt` is missing (snapshots are local and git-ignored, so a fresh clone has none), read the full live page with `curl -sL <url>` instead of relying on the diff.

## 2. Extract rule changes

From the diff, or from the full page compared against the checklist, list only the changes that affect auditing:

- new, removed or changed limits (characters, lines, depth)
- new or removed frontmatter fields, or changed field semantics
- new recommendations or anti-patterns, and recommendations that were dropped
- renamed concepts, new invocation or lifecycle behavior

Ignore wording, layout, link and example changes that leave the rule itself unchanged.

## 3. Propose

Show the user one table:

| Change in docs | Checklist edit | Linter edit |
|---|---|---|
| `description` limit now 2,048 | D1: 1,024 → 2,048 | `DESCRIPTION_MAX = 2048` |
| new field `foo` | F1: add `foo` | add to `KNOWN_FIELDS` |
| new anti-pattern "…" | new rule C6, severity minor, judge | — |

Quote the docs sentence behind each row. Then ask with AskUserQuestion (header `Update`): `Apply all (Recommended)` / `Choose rows` / `Cancel`. On `Choose rows`, ask for the row numbers.

## 4. Apply

1. Edit `references/checklist.md`. Keep the rule IDs of unchanged rules stable; give new rules the next free number in their section; mark a removed rule `(retired)` rather than reusing its ID.
2. Edit the constants and `KNOWN_FIELDS` in `scripts/lint_skill.py`, keeping the source comment on each one current. For a new lint-checkable rule, add the check alongside the existing ones.
3. Smoke-test the linter on this skill itself: `python3 <skill-dir>/scripts/lint_skill.py <skill-dir>`. It must run, output valid JSON, and report no critical findings.
4. Accept the new docs state: `python3 <skill-dir>/scripts/check_docs.py --accept`. Accept only after steps 1 to 3 succeed. If the user cancelled in step 3, do not accept, so the next audit warns again.

## 5. Report

List what changed in the checklist and the linter, and the new `last_synced` dates. If the skill lives in a versioned plugin, remind the user to bump the plugin version and commit. Do not commit yourself.
