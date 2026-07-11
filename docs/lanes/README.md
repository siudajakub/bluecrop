# Feature Lanes

One branch-local record per concurrent feature lane. It preserves the context needed for another
person or agent to review, integrate, cut, or resume the lane without a meeting.

Join with `python3 tools/hack_join.py`. It reads `HACKATHON.md` and `TEAM_BOARD.md`, offers
available work, creates the branch/worktree, and prefills the selected lane. Captains can use
`sh tools/hack_start.sh <feature>` for unplanned work. A record owns only its lane; shared
priorities live in `TEAM_BOARD.md` and shared interfaces live in `docs/hackathon/contracts.md`.

## Rules

- One owner and one record per feature branch.
- Claim concrete paths/modules and avoid overlap. Coordinate shared generated files explicitly.
- State is one of `PLANNED`, `ACTIVE`, `BLOCKED`, `READY`, `INTEGRATED`, or `CUT`.
- Keep `Current State`, `Next Step`, `Verification`, and `Fallback / Cut` factual and current.
- Commit the record early so remote teammates see it; local uncommitted records are still visible
  to `python3 tools/hack_status.py` when worktrees share the same machine.
- Keep integrated records as a short event history. After the hackathon, archive or delete them.

Run `python3 tools/hack_status.py` after fetching to aggregate local worktrees plus committed
`hack/*` branches. It is read-only and does not replace the PR or issue tracker.
