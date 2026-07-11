#!/usr/bin/env python3
"""Validate the hackathon context kit after project customization."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_FILES = (
    "AGENTS.md", "CLAUDE.md", "HACKATHON.md", "TEAM_BOARD.md",
    "docs/hackathon/playbook.md", "docs/hackathon/contracts.md",
    "docs/hackathon/integration.md", "docs/hackathon/demo.md",
    "docs/lanes/README.md", "docs/lanes/TEMPLATE.md",
)
REQUIRED_TOOLS = (
    "tools/hack_start.sh", "tools/hack_ready.sh", "tools/hack_context.sh",
    "tools/hack_status.py", "tools/hack_join.py",
)
REQUIRED_LANE_HEADINGS = (
    "## Acceptance", "## Claim", "## Contracts And Dependencies", "## Current State",
    "## Next Step", "## Verification", "## Fallback / Cut", "## Handoff",
)
LINK_PATTERN = re.compile(r"(?<!!)\[[^]]+\]\(([^)]+)\)")


def validate_links(path: Path, errors: list[str]) -> None:
    for target in LINK_PATTERN.findall(path.read_text(encoding="utf-8")):
        if target.startswith(("http://", "https://", "#", "mailto:")):
            continue
        clean = target.split("#", 1)[0]
        if clean and not (path.parent / clean).resolve().exists():
            errors.append(f"{path.relative_to(ROOT)}: broken local link: {target}")


def validate_hooks(errors: list[str]) -> None:
    path = ROOT / ".claude/settings.json"
    try:
        settings = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        errors.append("missing .claude/settings.json")
        return
    except json.JSONDecodeError as exc:
        errors.append(f".claude/settings.json: invalid JSON ({exc})")
        return
    hooks = settings.get("hooks", {})
    for event in ("SessionStart", "PreCompact"):
        groups = hooks.get(event, [])
        commands = [
            hook.get("command", "") for group in groups for hook in group.get("hooks", [])
        ]
        if not any("hack_context.sh" in command for command in commands):
            errors.append(f".claude/settings.json: {event} must run tools/hack_context.sh")


def main() -> int:
    errors: list[str] = []
    for relative in REQUIRED_FILES:
        path = ROOT / relative
        if not path.is_file():
            errors.append(f"missing required document: {relative}")
        else:
            validate_links(path, errors)
    for relative in REQUIRED_TOOLS:
        if not (ROOT / relative).is_file():
            errors.append(f"missing required tool: {relative}")

    agents = ROOT / "AGENTS.md"
    if agents.is_file() and len(agents.read_text(encoding="utf-8").splitlines()) > 140:
        errors.append("AGENTS.md exceeds the 140-line always-loaded budget")

    lane_template = ROOT / "docs/lanes/TEMPLATE.md"
    if lane_template.is_file():
        text = lane_template.read_text(encoding="utf-8")
        for heading in REQUIRED_LANE_HEADINGS:
            if heading not in text:
                errors.append(f"docs/lanes/TEMPLATE.md: missing heading: {heading}")

    board = ROOT / "TEAM_BOARD.md"
    if board.is_file():
        text = board.read_text(encoding="utf-8")
        expected = "| Slug | Outcome / acceptance | Claim | Contract / dependency | Priority | State |"
        if expected not in text:
            errors.append("TEAM_BOARD.md: Available Work table has unexpected columns")

    validate_hooks(errors)
    for script in ("tools/hack_start.sh", "tools/hack_ready.sh", "tools/hack_context.sh"):
        path = ROOT / script
        if path.is_file():
            result = subprocess.run(["sh", "-n", str(path)], capture_output=True, text=True)
            if result.returncode:
                errors.append(f"{script}: shell syntax error: {result.stderr.strip()}")
    for script in ("tools/check_agent_docs.py", "tools/hack_status.py", "tools/hack_join.py"):
        path = ROOT / script
        if path.is_file():
            try:
                compile(path.read_text(encoding="utf-8"), str(path), "exec")
            except SyntaxError as exc:
                errors.append(f"{script}: Python syntax error: {exc}")

    if errors:
        print("Hackathon context validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Hackathon context validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
