#!/usr/bin/env python3
"""Let a contributor choose documented work and create a prefilled feature lane."""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


@dataclass(frozen=True)
class Work:
    slug: str
    outcome: str
    claim: str
    dependency: str
    priority: str


def run(*args: str, cwd: Path, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        list(args), cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        check=False,
    )
    if check and result.returncode:
        message = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(message or f"command failed: {' '.join(args)}")
    return result


def project_root() -> Path:
    installed_root = Path(__file__).resolve().parents[1]
    result = run("git", "rev-parse", "--show-toplevel", cwd=installed_root, check=False)
    if result.returncode:
        raise RuntimeError("run this command inside the installed hackathon project")
    return Path(result.stdout.strip())


def clean_cell(value: str) -> str:
    value = value.strip()
    if value.startswith("`") and value.endswith("`") and value.count("`") == 2:
        return value[1:-1].strip()
    return value


def available_work(board: Path) -> list[Work]:
    if not board.is_file():
        raise RuntimeError("missing TEAM_BOARD.md")
    lines = board.read_text(encoding="utf-8").splitlines()
    try:
        start = lines.index("## Available Work") + 1
    except ValueError as exc:
        raise RuntimeError("TEAM_BOARD.md is missing the 'Available Work' section") from exc

    table: list[list[str]] = []
    for line in lines[start:]:
        if line.startswith("## "):
            break
        if not line.startswith("|"):
            continue
        cells = [clean_cell(cell) for cell in line.strip().strip("|").split("|")]
        if cells and not all(set(cell) <= {"-", ":"} for cell in cells):
            table.append(cells)
    if not table:
        return []

    headers = [header.lower() for header in table[0]]
    required = {
        "slug", "outcome / acceptance", "claim", "contract / dependency", "priority", "state"
    }
    if not required.issubset(headers):
        raise RuntimeError("TEAM_BOARD.md Available Work table has unexpected columns")
    index = {header: headers.index(header) for header in required}

    choices: list[Work] = []
    for row in table[1:]:
        if len(row) < len(headers):
            continue
        slug = row[index["slug"]]
        state = row[index["state"]].upper()
        required_values = (
            slug, row[index["outcome / acceptance"]], row[index["claim"]],
            row[index["contract / dependency"]], row[index["priority"]],
        )
        if (state != "AVAILABLE" or not SLUG.fullmatch(slug)
                or any("<" in value or ">" in value for value in required_values)):
            continue
        choices.append(Work(
            slug=slug,
            outcome=row[index["outcome / acceptance"]],
            claim=row[index["claim"]],
            dependency=row[index["contract / dependency"]],
            priority=row[index["priority"]],
        ))
    return choices


def claimed_slugs(root: Path) -> set[str]:
    result = run(
        "git", "for-each-ref", "--format=%(refname:short)",
        "refs/heads/hack", "refs/remotes", cwd=root, check=False,
    )
    claimed: set[str] = set()
    for ref in result.stdout.splitlines():
        if "/hack/" in ref:
            ref = "hack/" + ref.split("/hack/", 1)[1]
        parts = ref.split("/")
        if len(parts) == 3 and parts[0] == "hack" and parts[1] != "integration":
            claimed.add(parts[2])
    return claimed


def project_summary(path: Path) -> list[str]:
    if not path.is_file():
        return []
    wanted = ("Problem", "User", "Promise", "Judging bias")
    found: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        for label in wanted:
            prefix = f"- {label}:"
            if line.startswith(prefix):
                value = line.removeprefix(prefix).strip()
                if value and not value.startswith("<"):
                    found.append(f"{label}: {value}")
    return found


def default_owner(root: Path) -> str:
    result = run("git", "config", "user.name", cwd=root, check=False)
    raw = result.stdout.strip() or "owner"
    owner = re.sub(r"[^a-z0-9]+", "-", raw.lower()).strip("-")
    return owner or "owner"


def choose(choices: list[Work], selected: str | None) -> Work:
    if selected:
        for work in choices:
            if work.slug == selected:
                return work
        raise RuntimeError(f"lane is unavailable or already claimed: {selected}")

    if not sys.stdin.isatty():
        raise RuntimeError("interactive input is unavailable; pass --lane <slug>")
    while True:
        answer = input("\nChoose a lane number (or q to quit): ").strip().lower()
        if answer in {"q", "quit", "exit"}:
            raise KeyboardInterrupt
        if answer.isdigit() and 1 <= int(answer) <= len(choices):
            return choices[int(answer) - 1]
        print(f"Enter a number from 1 to {len(choices)}.")


def replace_section(text: str, heading: str, content: list[str]) -> str:
    pattern = re.compile(
        rf"(^## {re.escape(heading)}\n)(.*?)(?=^## |\Z)", re.MULTILINE | re.DOTALL
    )
    body = "\n" + "\n".join(content).rstrip() + "\n\n"
    updated, count = pattern.subn(lambda match: match.group(1) + body, text, count=1)
    if count != 1:
        raise RuntimeError(f"lane template is missing section: {heading}")
    return updated


def prefill_lane(worktree: Path, branch: str, work: Work) -> Path:
    records = sorted((worktree / "docs" / "lanes").glob("*.md"), reverse=True)
    record = next(
        (path for path in records if path.name not in {"README.md", "TEMPLATE.md"}
         and f"- Branch: {branch}" in path.read_text(encoding="utf-8")),
        None,
    )
    if record is None:
        raise RuntimeError(f"could not find the lane record for {branch}")

    text = record.read_text(encoding="utf-8")
    claims = [part.strip().strip("`") for part in work.claim.split(";") if part.strip()]
    text = replace_section(text, "Acceptance", [work.outcome])
    text = replace_section(text, "Claim", [f"- `{claim}`" for claim in claims])
    text = replace_section(text, "Contracts And Dependencies", [
        "- Produces: confirm against `docs/hackathon/contracts.md`",
        f"- Consumes: {work.dependency}",
        "- Shared-file coordination: confirm before implementation",
    ])
    text = replace_section(text, "Current State", [
        f"Selected from TEAM_BOARD.md as {work.priority}; implementation has not started."
    ])
    text = replace_section(text, "Next Step", [
        "Read the relevant project files and contracts, then define the fallback before coding."
    ])
    record.write_text(text, encoding="utf-8")
    return record


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Choose available work from TEAM_BOARD.md and create an isolated feature lane."
    )
    parser.add_argument("--owner", help="branch owner slug; defaults to git user.name")
    parser.add_argument("--base", default="hack/integration", help="shared integration branch")
    parser.add_argument("--lane", help="select a slug without the interactive prompt")
    parser.add_argument("--list", action="store_true", help="list choices without creating a lane")
    args = parser.parse_args()

    try:
        root = project_root()
        owner = args.owner or default_owner(root)
        owner = re.sub(r"[^a-z0-9]+", "-", owner.lower()).strip("-")
        if not owner:
            raise RuntimeError("owner must contain a letter or number")

        work = available_work(root / "TEAM_BOARD.md")
        taken = claimed_slugs(root)
        choices = [item for item in work if item.slug not in taken]

        print("Project context")
        summary = project_summary(root / "HACKATHON.md")
        if summary:
            for line in summary:
                print(f"  {line}")
        else:
            print("  Read HACKATHON.md for the mission and golden path.")

        print("\nAvailable work")
        if not choices:
            print("  No unclaimed AVAILABLE lanes. Ask the integration captain to update TEAM_BOARD.md.")
            return 1
        for number, item in enumerate(choices, start=1):
            print(f"  {number}. [{item.priority}] {item.slug}")
            print(f"     Outcome: {item.outcome}")
            print(f"     Claim: {item.claim}")
            print(f"     Depends on: {item.dependency}")
        if args.list:
            return 0

        selected = choose(choices, args.lane)
        command = [
            "sh", "tools/hack_start.sh", selected.slug,
            "--owner", owner, "--base", args.base,
        ]
        created = run(*command, cwd=root)
        print("\n" + created.stdout.strip())
        match = re.search(r"^\s*worktree:\s*(.+)$", created.stdout, re.MULTILINE)
        if not match:
            raise RuntimeError("lane was created, but its worktree path could not be read")
        worktree = Path(match.group(1).strip())
        branch = f"hack/{owner}/{selected.slug}"
        record = prefill_lane(worktree, branch, selected)

        print("\nSelection recorded")
        print(f"  lane:     {selected.slug}")
        print(f"  branch:   {branch}")
        print(f"  worktree: {worktree}")
        print(f"  record:   {record.relative_to(worktree)}")
        print("\nNext:")
        print(f"  cd '{worktree}'")
        print("  Review the claim and contracts, fill Fallback / Cut, then commit and push the lane record.")
        return 0
    except KeyboardInterrupt:
        print("\nNo lane selected.")
        return 130
    except RuntimeError as exc:
        print(f"hack join failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
