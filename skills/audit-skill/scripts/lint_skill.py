#!/usr/bin/env python3
"""Deterministic checks of an Agent Skill against the documented hard limits.

Usage: python3 lint_skill.py <skill-dir>
Prints a JSON object {"skill": ..., "findings": [...]} to stdout. Exit code is
always 0 when the skill was read, so callers can parse the output; 2 means the
skill directory or its SKILL.md could not be read at all.

Rule IDs match references/checklist.md. Every limit below cites its source;
`self-update` mode re-checks these values against the live docs.
Standard library only, so it runs anywhere python3 exists.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

# --- Limits (sources: references/sources.json) ---------
# platform docs, "YAML frontmatter requirements": name max 64 chars
NAME_MAX = 64
# platform docs: name only lowercase letters, numbers, hyphens
NAME_PATTERN = re.compile(r"^[a-z0-9-]+$")
# platform docs: reserved words in name
RESERVED_WORDS = ("anthropic", "claude")
# Claude Code docs, "Resolve skills that share a name": a skill named ship, ship-local or
# steward is not loaded where the bundled /ship is available; "Choose where skills load":
# a folder named synced (any capitalization) is skipped. Neither applies inside a plugin.
RESERVED_NAMES = {
    "ship": "not loaded where the bundled /ship is available",
    "ship-local": "not loaded where the bundled /ship is available",
    "steward": "not loaded where the bundled /ship is available",
    "synced": "Claude Code skips a skill folder with this name (it holds skills synced from claude.ai)",
}
# Claude Code docs, "Choose where skills load": `synced` is reserved as a folder name only
FOLDER_ONLY_RESERVED = {"synced"}
# Claude Code docs, "Characters a skill name can't hold": control, zero-width and
# direction-changing (Cc, Cf), private-use (Co) and unassigned (Cn) characters; also
# `<`, `>` and any blank other than one plain space between words (checked in code)
REFUSED_NAME_CATEGORIES = {"Cc", "Cf", "Co", "Cn"}
REFUSED_NAME_CHARS = "<>"
# platform docs: description max 1,024 chars (hard API limit)
DESCRIPTION_MAX = 1024
# Claude Code docs: description + when_to_use truncated at 1,536 chars in the listing
LISTING_MAX = 1536
# platform docs, "Token budgets": SKILL.md body under 500 lines
BODY_MAX_LINES = 500
# platform docs: reference files longer than 100 lines need a table of contents
TOC_THRESHOLD_LINES = 100
# Claude Code docs: `compatibility` field max 500 chars
COMPATIBILITY_MAX = 500
# Claude Code docs, frontmatter reference: every documented field
KNOWN_FIELDS = {
    "name", "description", "when_to_use", "argument-hint", "arguments",
    "disable-model-invocation", "user-invocable", "allowed-tools",
    "disallowed-tools", "model", "effort", "context", "agent", "background",
    "hooks", "paths", "shell", "metadata", "license", "compatibility",
}
# Claude Code docs, frontmatter reference: booleans also accept yes/no/on/off/1/0, any case
TRUE_VALUES = {"true", "yes", "on", "1"}
FALSE_VALUES = {"false", "no", "off", "0"}
# Claude Code docs, frontmatter `paths`: patterns are relative to the working directory and
# match only files inside it, so a `../` pattern never matches
PATHS_OUTSIDE_CWD = re.compile(r"(?:^|[\s,'\"\[-])\.\./")
# Claude Code docs, "Angle brackets in a skill description": `<` and `>` in description and
# when_to_use display as &lt; and &gt;
ANGLE_BRACKET = re.compile(r"[<>]")

XML_TAG = re.compile(r"<\s*/?\s*[A-Za-z][\w:-]*(\s[^<>]*)?>")
FIRST_SECOND_PERSON = re.compile(
    r"\b(I can|I will|I'll|I help|you can|you'll|you should|lets you|helps you)\b",
    re.IGNORECASE,
)
TRIGGER_HINT = re.compile(r"\b(use when|use for|use this|when the user|triggers? on|whenever)\b", re.IGNORECASE)
TIME_SENSITIVE = re.compile(
    r"\b(before|after|until|since|as of|starting)\s+(January|February|March|April|May|June|July|"
    r"August|September|October|November|December|Q[1-4]|20\d\d)\b",
    re.IGNORECASE,
)
WINDOWS_PATH = re.compile(r"(?<![\\\w])[\w.-]+\\[\w.-]+\.\w{1,5}\b")
MD_LINK = re.compile(r"\]\(([^)\s#]+)(?:#[^)]*)?\)")
CODE_PATH = re.compile(r"`((?:\$\{CLAUDE_SKILL_DIR\}/)?(?:references|reference|scripts|examples|assets|templates)/[^`\s]+)`")
# A bundle path behind the skill-dir variable or a placeholder for it
# (`<abs>/references/find.md`, `<skill-dir>/scripts/x.py`), as orchestrator
# skills write them in subagent prompt templates, often inside fenced blocks.
ROOTED_PATH = re.compile(r"(?:\$\{CLAUDE_SKILL_DIR\}|<[A-Za-z][\w-]*>)/((?:references|reference|scripts|examples|assets|templates)/[^\s`'\"),;]+)")


def finding(rule, severity, file, line, message):
    return {"rule": rule, "severity": severity, "file": file, "line": line, "message": message}


def parse_frontmatter(text):
    """Return (fields, body, body_start_line, error). Handles scalars, quoted
    strings, and folded/literal blocks; nested maps are kept as raw text."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return {}, text, 1, "Frontmatter does not start on line 1 with '---'"
    try:
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    except StopIteration:
        return {}, text, 1, "Frontmatter has no closing '---'"
    fields, key = {}, None
    for raw in lines[1:end]:
        m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", raw)
        if m and not raw.startswith((" ", "\t")):
            key, value = m.group(1), m.group(2).strip()
            if value in (">", "|", ">-", "|-", ">+", "|+"):
                value = ""
            elif len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            fields[key] = value
        elif key is not None and raw.strip():
            fields[key] = (fields[key] + " " + raw.strip()).strip()
    return fields, "\n".join(lines[end + 1:]), end + 2, None


INLINE_CODE = re.compile(r"`[^`\n]*`")
QUOTED = re.compile(r"\"[^\"\n]*\"")
WILDCARD = re.compile(r"[<*{]")


def strip_fences(text):
    """Blank out fenced code blocks, keeping line numbers."""
    out, in_code = [], False
    for line in text.split("\n"):
        if line.lstrip().startswith("```"):
            in_code = not in_code
            out.append("")
        else:
            out.append("" if in_code else line)
    return "\n".join(out)


def local_refs(text):
    """Local file references: markdown links outside code, and backticked
    paths under the usual bundle directories (these may sit in code)."""
    refs = set()
    prose = INLINE_CODE.sub("", strip_fences(text))
    for m in MD_LINK.finditer(prose):
        target = m.group(1)
        if not re.match(r"^[a-z]+:", target):
            refs.add(target)
    for m in CODE_PATH.finditer(text):
        refs.add(m.group(1).replace("${CLAUDE_SKILL_DIR}/", ""))
    for m in ROOTED_PATH.finditer(text):
        refs.add(m.group(1).rstrip(".:"))
    return refs


def resolve_ref(ref, from_dir, skill_dir):
    """Return (paths, exists). Relative to the referring file first, then to the
    skill root. A templated ref (`references/<lang>.md`, `base/*.md`) covers
    every file in the directory before its first wildcard."""
    wildcard = WILDCARD.search(ref)
    if wildcard:
        head = ref[:wildcard.start()]
        prefix = head.rsplit("/", 1)[0] if "/" in head else ""
        for base in (from_dir, skill_dir):
            d = (base / prefix).resolve()
            if prefix and d.is_dir():
                return {p.resolve() for p in d.rglob("*") if p.is_file()}, True
        return set(), False
    for base in (from_dir, skill_dir):
        target = (base / ref).resolve()
        if target.exists():
            if target.is_dir():
                return {p.resolve() for p in target.rglob("*") if p.is_file()}, True
            return {target}, True
    return set(), False


def in_plugin(skill_dir):
    """True when an ancestor folder holds `.claude-plugin/`, i.e. the skill ships in a plugin."""
    return any((p / ".claude-plugin").is_dir() for p in skill_dir.parents)


def refused_name_chars(text):
    """Describe the characters Claude Code refuses in a skill or command name."""
    bad = []
    for ch in text:
        cat = unicodedata.category(ch)
        if ch in REFUSED_NAME_CHARS:
            bad.append(f"'{ch}'")
        elif cat in REFUSED_NAME_CATEGORIES or (cat.startswith("Z") and ch != " "):
            bad.append(f"U+{ord(ch):04X}")
    if "  " in text or text != text.strip(" "):
        bad.append("a space that is not one space between words")
    return bad


def lint(skill_dir):
    skill_dir = skill_dir.resolve()
    skill_md = skill_dir / "SKILL.md"
    text = skill_md.read_text(encoding="utf-8")
    out = []
    fields, body, body_start, fm_error = parse_frontmatter(text)
    if fm_error:
        out.append(finding("S1", "critical", "SKILL.md", 1, fm_error + " — the whole file loads as content and auto-invocation breaks."))

    # --- name ---
    name = fields.get("name", "")
    if not name:
        out.append(finding("N1", "minor", "SKILL.md", 1, f"No `name`; the directory name `{skill_dir.name}` is used. Set it explicitly for portability (required by the API)."))
    else:
        if len(name) > NAME_MAX:
            out.append(finding("N1", "critical", "SKILL.md", 1, f"`name` is {len(name)} chars, max {NAME_MAX}."))
        if not NAME_PATTERN.match(name):
            out.append(finding("N1", "critical", "SKILL.md", 1, f"`name` '{name}' must use only lowercase letters, numbers and hyphens."))
        for word in RESERVED_WORDS:
            if word in name.lower():
                out.append(finding("N1", "critical", "SKILL.md", 1, f"`name` contains reserved word '{word}'."))
        if XML_TAG.search(name):
            out.append(finding("N1", "critical", "SKILL.md", 1, "`name` contains an XML tag."))
        if name != skill_dir.name:
            out.append(finding("N2", "important", "SKILL.md", 1, f"`name` '{name}' differs from directory '{skill_dir.name}'; the command name and the folder disagree."))
    if name.lower() in ("helper", "utils", "tools", "documents", "data", "files"):
        out.append(finding("N3", "important", "SKILL.md", 1, f"`name` '{name}' is vague or generic."))

    # --- directory name and reserved names ---
    plugin = in_plugin(skill_dir)
    bad_chars = refused_name_chars(skill_dir.name)
    if bad_chars:
        if plugin:
            out.append(finding("N1", "minor", "SKILL.md", 1, f"Directory name '{skill_dir.name}' holds characters Claude Code refuses ({', '.join(bad_chars)}); in a plugin they become hyphens in the command name."))
        else:
            out.append(finding("N1", "critical", "SKILL.md", 1, f"Directory name '{skill_dir.name}' holds characters Claude Code refuses ({', '.join(bad_chars)}); the skill does not load."))
    if not plugin:
        dir_key = skill_dir.name.lower()
        if dir_key in RESERVED_NAMES:
            out.append(finding("N1", "critical", "SKILL.md", 1, f"Directory name '{skill_dir.name}' is reserved: {RESERVED_NAMES[dir_key]}."))
        name_key = name.lower()
        if name_key in RESERVED_NAMES and name_key not in FOLDER_ONLY_RESERVED and name_key != dir_key:
            out.append(finding("N1", "critical", "SKILL.md", 1, f"`name` '{name}' is reserved: {RESERVED_NAMES[name_key]}."))

    # --- description ---
    desc = fields.get("description", "")
    when = fields.get("when_to_use", "")
    manual_only = fields.get("disable-model-invocation", "").lower() in TRUE_VALUES
    if not desc:
        out.append(finding("D1", "critical", "SKILL.md", 1, "`description` is empty or missing — required by the API and claude.ai upload; Claude Code falls back to the first body line, which rarely names triggers."))
    else:
        if len(desc) > DESCRIPTION_MAX:
            out.append(finding("D1", "critical", "SKILL.md", 1, f"`description` is {len(desc)} chars, max {DESCRIPTION_MAX}."))
        if XML_TAG.search(desc):
            out.append(finding("D1", "critical", "SKILL.md", 1, "`description` contains an XML tag."))
        person = FIRST_SECOND_PERSON.search(desc)
        if person and not manual_only:
            out.append(finding("D2", "important", "SKILL.md", 1, f"`description` is not third person: '{person.group(0)}'."))
        if not manual_only and not TRIGGER_HINT.search(desc + " " + when):
            out.append(finding("D3", "important", "SKILL.md", 1, "`description` says what the skill does but no explicit 'when to use' trigger was found."))
    if len(desc) + len(when) > LISTING_MAX:
        out.append(finding("D4", "important", "SKILL.md", 1, f"`description` + `when_to_use` = {len(desc) + len(when)} chars; Claude Code truncates at {LISTING_MAX}."))
    for field, value in (("description", desc), ("when_to_use", when)):
        if ANGLE_BRACKET.search(value) and not (field == "description" and XML_TAG.search(value)):
            out.append(finding("D7", "minor", "SKILL.md", 1, f"`{field}` contains `<` or `>`; Claude Code shows them as &lt; and &gt;. Write placeholders as [name] or move them to `argument-hint`."))

    # --- other frontmatter ---
    for key in fields:
        if key not in KNOWN_FIELDS:
            out.append(finding("F1", "minor", "SKILL.md", 1, f"Unknown frontmatter field `{key}` (typo or unsupported)."))
    if fields.get("context") and fields["context"] != "fork":
        out.append(finding("F1", "important", "SKILL.md", 1, f"`context: {fields['context']}` — the only accepted value is `fork`."))
    if fields.get("agent") and fields.get("context") != "fork":
        out.append(finding("F2", "minor", "SKILL.md", 1, "`agent` has no effect without `context: fork`."))
    if fields.get("background") and fields.get("context") != "fork":
        out.append(finding("F2", "minor", "SKILL.md", 1, "`background` has no effect without `context: fork`."))
    user_invocable_off = fields.get("user-invocable", "").lower() in FALSE_VALUES
    model = fields.get("model", "")
    if model and model.lower() != "inherit" and fields.get("context") != "fork":
        if user_invocable_off:
            out.append(finding("F2", "minor", "SKILL.md", 1, f"`model: {model}` never applies: only Claude invokes this skill, and without `context: fork` the session keeps its model."))
        elif not manual_only:
            out.append(finding("F2", "minor", "SKILL.md", 1, f"`model: {model}` applies only when the user types /name; when Claude invokes the skill, the session keeps its model."))
    if fields.get("context") == "fork" and "AskUserQuestion" in body:
        out.append(finding("F3", "critical", "SKILL.md", 1, "`context: fork` but the body uses AskUserQuestion — subagents cannot ask the user."))
    if manual_only and user_invocable_off:
        out.append(finding("F4", "critical", "SKILL.md", 1, "Both `disable-model-invocation: true` and `user-invocable: false` — nobody can invoke the skill."))
    if PATHS_OUTSIDE_CWD.search(fields.get("paths", "")):
        out.append(finding("F6", "important", "SKILL.md", 1, "`paths` has a `../` pattern; patterns are relative to the working directory and match only files inside it, so it never activates the skill."))
    if len(fields.get("compatibility", "")) > COMPATIBILITY_MAX:
        out.append(finding("F1", "minor", "SKILL.md", 1, f"`compatibility` exceeds {COMPATIBILITY_MAX} chars."))

    # --- body ---
    body_lines = body.split("\n")
    if len(body_lines) > BODY_MAX_LINES:
        out.append(finding("P1", "important", "SKILL.md", body_start, f"Body is {len(body_lines)} lines, recommended under {BODY_MAX_LINES}. Move detail to reference files."))

    # --- per-file content checks + references ---
    md_files = sorted(p for p in skill_dir.rglob("*.md") if p.is_file())
    referenced_from_skill = set()
    for ref in local_refs(body):
        targets, exists = resolve_ref(ref, skill_dir, skill_dir)
        referenced_from_skill |= targets
        if not exists:
            out.append(finding("P4", "critical", "SKILL.md", None, f"Referenced file does not exist: {ref}"))
    for md in md_files:
        rel = md.relative_to(skill_dir).as_posix()
        content = md.read_text(encoding="utf-8", errors="replace")
        lines = content.split("\n")
        in_code = False
        for i, line in enumerate(lines, 1):
            if line.lstrip().startswith("```"):
                in_code = not in_code
            win = WINDOWS_PATH.search(line)
            if win and not in_code:
                out.append(finding("A1", "minor", rel, i, f"Windows-style path: {win.group(0)}"))
            dated = TIME_SENSITIVE.search(QUOTED.sub("", INLINE_CODE.sub("", line)))
            if dated:
                out.append(finding("C1", "minor", rel, i, f"Possibly time-sensitive wording: '{dated.group(0)}'"))
        if md.name == "SKILL.md":
            continue
        head = "\n".join(lines[:40]).lower()
        if len(lines) > TOC_THRESHOLD_LINES and not re.search(r"^#+\s*(contents|table of contents|toc)\b", head, re.MULTILINE):
            out.append(finding("P3", "minor", rel, 1, f"{len(lines)} lines with no table of contents at the top (needed above {TOC_THRESHOLD_LINES})."))
        if md.resolve() in referenced_from_skill:
            nested = [r for r in local_refs(content)
                      if r.endswith(".md") and not WILDCARD.search(r)
                      and (lambda t: t[1] and not (t[0] & referenced_from_skill) and md.resolve() not in t[0])(resolve_ref(r, md.parent, skill_dir))]
            for r in nested:
                out.append(finding("P2", "important", rel, None, f"Links to {r}, which SKILL.md does not link directly — references must be one level deep."))
        elif md.parent != skill_dir or md.name.upper() not in ("README.MD", "CHANGELOG.MD"):
            out.append(finding("P5", "minor", rel, None, "Not referenced from SKILL.md — Claude will never find it, or it is dead weight."))

    # Only skill scripts: top level or scripts/. Code under assets/ or an app folder is not run by Claude.
    candidates = list(skill_dir.glob("*")) + list((skill_dir / "scripts").rglob("*"))
    for script in sorted(p for p in candidates if p.suffix in (".py", ".sh", ".js", ".ts") and p.is_file()):
        rel = script.relative_to(skill_dir).as_posix()
        if script.name not in text and rel not in text:
            out.append(finding("X5", "minor", rel, None, "Script is never mentioned in SKILL.md — say whether to run it or read it."))

    return {"skill": str(skill_dir), "name": name, "description_chars": len(desc),
            "body_lines": len(body_lines), "findings": out}


def main():
    if len(sys.argv) != 2:
        print("usage: lint_skill.py <skill-dir>", file=sys.stderr)
        sys.exit(2)
    skill_dir = Path(sys.argv[1]).expanduser()
    if skill_dir.name == "SKILL.md":
        skill_dir = skill_dir.parent
    if not (skill_dir / "SKILL.md").is_file():
        print(json.dumps({"error": f"No SKILL.md in {skill_dir}"}))
        sys.exit(2)
    print(json.dumps(lint(skill_dir), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
