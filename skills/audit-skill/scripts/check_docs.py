#!/usr/bin/env python3
"""Freshness check of the official docs the audit checklist is based on.

Usage:
  python3 check_docs.py            # compare live docs with the last synced snapshot
  python3 check_docs.py --diff     # also print a unified diff for each changed source
  python3 check_docs.py --accept   # store live docs as the new snapshot (after self-update)

Sources, hashes and sync dates live in ../references/sources.json; the last
synced copy of each page lives in ../snapshots/<id>.txt. Pages are fetched as
raw Markdown (the docs serve `<page>.md`), so hashes are stable across runs.
Output is JSON on stdout; exit code 0 = fresh, 1 = stale, 2 = a source could
not be fetched (the audit still runs on the local checklist).
"""
import datetime
import difflib
import hashlib
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
SOURCES = SKILL_DIR / "references" / "sources.json"
SNAPSHOTS = SKILL_DIR / "snapshots"
# Docs pages are ~100 KB; 20 s covers a slow connection without hanging the audit.
TIMEOUT_SECONDS = 20
# A diff longer than this is summarized; self-update then reads the full page instead.
DIFF_MAX_LINES = 400


def fetch(url):
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_SECONDS) as resp:
            return resp.read().decode("utf-8")
    except Exception:
        # python.org builds on macOS often lack CA certs; curl uses the system store.
        result = subprocess.run(["curl", "-sfL", "--max-time", str(TIMEOUT_SECONDS), url],
                                capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"curl exit {result.returncode}")
        return result.stdout


def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def main():
    args = set(sys.argv[1:])
    config = json.loads(SOURCES.read_text(encoding="utf-8"))
    report, status = [], 0
    for src in config["sources"]:
        entry = {"id": src["id"], "url": src["url"], "last_synced": src.get("last_synced")}
        try:
            live = fetch(src["url"])
        except Exception as exc:
            entry.update(state="unreachable", error=str(exc))
            status = max(status, 2)
            report.append(entry)
            continue
        live_hash = sha(live)
        entry["state"] = "fresh" if live_hash == src.get("sha256") else "stale"
        snapshot = SNAPSHOTS / f"{src['id']}.txt"
        if entry["state"] == "stale":
            status = max(status, 1)
            if "--diff" in args:
                old = snapshot.read_text(encoding="utf-8").splitlines() if snapshot.exists() else []
                diff = list(difflib.unified_diff(old, live.splitlines(), "snapshot", "live", lineterm="", n=2))
                entry["diff_lines"] = len(diff)
                entry["diff"] = "\n".join(diff[:DIFF_MAX_LINES])
                if len(diff) > DIFF_MAX_LINES:
                    entry["diff_truncated"] = True
        if "--accept" in args:
            SNAPSHOTS.mkdir(exist_ok=True)
            snapshot.write_text(live, encoding="utf-8")
            src["sha256"] = live_hash
            src["last_synced"] = datetime.date.today().isoformat()
            entry["state"] = "accepted"
        report.append(entry)
    if "--accept" in args:
        SOURCES.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
        status = 2 if any(e["state"] == "unreachable" for e in report) else 0
    print(json.dumps({"status": ["fresh", "stale", "unreachable"][status], "sources": report},
                     indent=2, ensure_ascii=False))
    sys.exit(status)


if __name__ == "__main__":
    main()
