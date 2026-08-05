# Implementation Log

- Removed CLI task-kind inference and the `bug.md` special case; all created and resolved task directories now use `task.md`.
- Made `simple` and `bug` ordinary task-name arguments. `task -p --no-skill --simple` and `--bug` now select the alternate legacy prompt transcripts explicitly.
- Simplified the agent workflow to research, plan, implement, and commit; direct `$task-simple` and `$task-bugfix` skills remain available and now reference `task.md`.
- Updated documentation and coverage for the unified brief and explicit no-skill variants.

Verification:

- `pnpm typecheck`
- `pnpm test`
