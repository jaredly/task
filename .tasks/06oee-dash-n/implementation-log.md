## Implementation log

- Added `task -n <name...>` to reserve a standard task directory and print the absolute `task.md` path without creating the brief, opening an editor, or emitting a prompt.
- Preserved the existing task-name normalization, timestamp prefix, collision handling, and missing `.tasks` error behavior.
- Added CLI tests for successful reservation, no-file/no-editor behavior, missing names, and missing `.tasks` directories.

## Verification

- `pnpm test`
- `pnpm typecheck`
- `git diff --check`

## Issues and workarounds

- None.
