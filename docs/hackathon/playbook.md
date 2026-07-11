# Hackathon Playbook

The operating rhythm for several people and agents shipping one demo in parallel.

## Kickoff: Align Before Fan-Out

Spend the first short timebox producing four things: the five-step golden path, the technical
core that must be real, the first integration deadline, and lane boundaries. Create
`hack/integration` from the clean starting commit. The captain fills `HACKATHON.md` and
`TEAM_BOARD.md`; owners agree on the interfaces in `contracts.md`.

Split work by independently demonstrable vertical lanes, not by vague layers such as "frontend"
and "backend". A good lane can be reviewed, disabled, and integrated on its own. When layer-based
ownership is unavoidable, freeze request/response examples and fixtures before both sides begin.

## Working Loop

1. Run `python3 tools/hack_join.py` and select an available lane defined in `TEAM_BOARD.md`.
2. Review the prefilled claim, acceptance, and dependencies; then add the fallback.
3. Commit a thin end-to-end skeleton early; push a draft PR so distributed teammates see it.
4. Integrate at contracts, not guesses. Use a deterministic fixture until a dependency lands.
5. Re-sync with integration before declaring READY and resolve conflicts in the feature lane.
6. Run checks, update the lane record, and enter the merge train.

Run `python3 tools/hack_status.py` at handoffs and standups. On one machine it sees uncommitted
lane records across worktrees; after `git fetch --all --prune` it also sees committed remote lanes.

## Communication Cadence

- Post only deltas: `DONE / NEXT / BLOCKED / CONTRACT CHANGE`.
- Interrupt consumers immediately for contract changes; do not wait for the next standup.
- Treat a 15-minute technical block as a coordination event. Pair, mock, or cut.
- At each freeze, the captain announces the exact integration commit and permitted change types.

## Scope Discipline

Protect the golden path. Nice-to-have work must be removable by dropping a commit, route, or
flag. Prefer one polished differentiator with evidence over several disconnected capabilities.
After feature freeze, accept only reliability, clarity, observability, and demo-flow fixes.

## End Of Event

Tag the demo commit, record the exact launch/reset commands, capture a local video or screenshots,
and preserve deterministic demo data. Do not perform risky dependency or infrastructure upgrades
after the demo freeze.
