#!/usr/bin/env python3
"""Aggregate hackathon lanes from local worktrees and committed hack/* refs."""
from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
META = re.compile(r"^- ([^:]+):\s*(.*)$")


def git(*args: str, cwd: Path = ROOT, check: bool = True) -> str:
    result = subprocess.run(
        ["git", *args], cwd=cwd, text=True, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, check=False,
    )
    if check and result.returncode:
        raise RuntimeError(f"git {' '.join(args)} failed")
    return result.stdout


@dataclass
class Lane:
    branch: str
    owner: str
    state: str
    acceptance: str
    claims: tuple[str, ...]
    location: str


def section_lines(text: str, heading: str) -> list[str]:
    lines = text.splitlines()
    target = f"## {heading}"
    try:
        start = lines.index(target) + 1
    except ValueError:
        return []
    output: list[str] = []
    for line in lines[start:]:
        if line.startswith("## "):
            break
        if line.strip():
            output.append(line.strip())
    return output


def parse_lane(text: str, location: str) -> Lane | None:
    fields: dict[str, str] = {}
    for line in text.splitlines()[:20]:
        match = META.match(line)
        if match:
            fields[match.group(1).lower()] = match.group(2)
    branch = fields.get("branch", "")
    if not branch or branch.startswith("<"):
        return None
    acceptance_lines = section_lines(text, "Acceptance")
    acceptance = acceptance_lines[0] if acceptance_lines else "(acceptance missing)"
    claims = tuple(
        line[2:].strip(" `") for line in section_lines(text, "Claim")
        if line.startswith("- ")
    )
    return Lane(
        branch=branch,
        owner=fields.get("owner", "?"),
        state=fields.get("state", "?"),
        acceptance=acceptance,
        claims=claims,
        location=location,
    )


def worktrees() -> list[tuple[Path, str]]:
    entries: list[tuple[Path, str]] = []
    path: Path | None = None
    branch = "DETACHED"
    for line in git("worktree", "list", "--porcelain").splitlines() + [""]:
        if line.startswith("worktree "):
            path = Path(line.removeprefix("worktree "))
            branch = "DETACHED"
        elif line.startswith("branch "):
            branch = line.removeprefix("branch refs/heads/")
        elif not line and path is not None:
            entries.append((path, branch))
            path = None
    return entries


def lane_from_tree(path: Path, branch: str) -> Lane | None:
    lane_dir = path / "docs" / "lanes"
    if not lane_dir.is_dir():
        return None
    fallback: Lane | None = None
    for record in sorted(lane_dir.glob("*.md"), reverse=True):
        if record.name in {"README.md", "TEMPLATE.md"}:
            continue
        lane = parse_lane(record.read_text(encoding="utf-8"), str(path))
        if lane and lane.branch == branch:
            return lane
        fallback = fallback or lane
    return fallback if branch.startswith("hack/") and branch != "hack/integration" else None


def canonical_branch(ref: str) -> str:
    marker = "/hack/"
    if marker in ref:
        return "hack/" + ref.split(marker, 1)[1]
    return ref


def lane_from_ref(ref: str, branch: str) -> Lane | None:
    paths = git("ls-tree", "-r", "--name-only", ref, "--", "docs/lanes", check=False)
    fallback: Lane | None = None
    for record in reversed(paths.splitlines()):
        if record.endswith(("/README.md", "/TEMPLATE.md")):
            continue
        text = git("show", f"{ref}:{record}", check=False)
        lane = parse_lane(text, ref)
        if lane and lane.branch == branch:
            return lane
        fallback = fallback or lane
    return fallback


def collect() -> list[Lane]:
    lanes: list[Lane] = []
    seen: set[str] = set()
    for path, branch in worktrees():
        if branch == "hack/integration":
            continue
        lane = lane_from_tree(path, branch)
        if lane:
            lanes.append(lane)
            seen.add(lane.branch)

    refs = git(
        "for-each-ref", "--format=%(refname:short)",
        "refs/heads/hack", "refs/remotes", check=False,
    )
    for ref in refs.splitlines():
        branch = canonical_branch(ref)
        if branch == "hack/integration" or not branch.startswith("hack/") or branch in seen:
            continue
        lane = lane_from_ref(ref, branch)
        if lane:
            lanes.append(lane)
            seen.add(branch)
    return sorted(lanes, key=lambda lane: (lane.state != "BLOCKED", lane.state, lane.branch))


def main() -> int:
    try:
        lanes = collect()
    except (RuntimeError, OSError) as exc:
        print(f"hack status unavailable: {exc}")
        return 1

    if not lanes:
        print("No feature lanes found. Choose documented work with: python3 tools/hack_join.py")
        return 0

    for lane in lanes:
        print(f"[{lane.state}] {lane.branch} — {lane.owner} @ {lane.location}")
        print(f"  acceptance: {lane.acceptance}")
        print(f"  claims: {', '.join(lane.claims) if lane.claims else '(missing)'}")

    owners: dict[str, list[str]] = {}
    for lane in lanes:
        if lane.state in {"INTEGRATED", "CUT"}:
            continue
        for claim in lane.claims:
            owners.setdefault(claim, []).append(lane.branch)
    collisions = {claim: branches for claim, branches in owners.items() if len(branches) > 1}
    if collisions:
        print("\nPOTENTIAL EXACT CLAIM COLLISIONS:")
        for claim, branches in collisions.items():
            print(f"  {claim}: {', '.join(branches)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
