# Implementation log

## Phase 1: Testable CLI foundation

- Added `cli.ts` with a `runCli` command boundary and injectable editor, prompt, clock, output, and working-directory services.
- Reduced `task.ts` to the executable adapter for Node, Inquirer, and the real editor.
- Added `tsconfig.json`, a `typecheck` script, and an initial Node test suite covering repository discovery, argument validation, task modes, nested context, editor failure, and collisions.
- Added `@inquirer/prompts` for the planned interactive flows and `shell-quote` for parsing editor values without executing them through a shell.
- Issue encountered: `shell-quote` deliberately returns a union that includes operator/comment tokens. Type checking rejected the first broad validation. The parser now narrows every token explicitly and rejects anything except nonempty string arguments.

Verification: initial CLI tests pass. Static checking will be rerun after the parser narrowing and at every later phase.

## Phase 2: Task creation and editor hardening

- Added a single name-normalization path after standard/simple/bug mode detection. Whitespace, slashes, and punctuation become collapsed dashes; empty normalized names and timestamp/name collisions fail before mutation.
- Replaced Zed-specific shell commands with `$VISUAL`, `$EDITOR`, then `vi`, using parsed argument arrays and `shell: false`.
- Editor nonzero exits and signals now fail cleanly. A task created before an editor failure is intentionally retained and its path is reported.
- Prompt links now use `pathToFileURL()` for valid links from repository paths containing spaces.
- Added tests for unsafe punctuation, encoded paths, quoted editor flags, literal filename arguments, rejected shell operators, and nonzero editor exits.

Verification: `pnpm typecheck` and all 10 tests pass.

## Phase 3: Prompt selection and reprinting

- Kept `task -p <target>` intentionally permissive: bare task names resolve under the nearest `.tasks` directory when available, path-like targets resolve from the working directory, archived paths work, and targets need not exist.
- Added `task -p` without a target as an interactive selection of active direct-child task directories in reverse chronological order.
- Empty task lists and prompt cancellation are successful no-ops; selection without a nearby `.tasks` directory fails concisely.
- Bug fixed during test design: a bare Markdown filename such as `brief.md` initially followed bare-task resolution. Markdown filenames now always resolve as paths relative to the working directory.
- Added tests for nonexistent, relative, absolute-style, archived, custom-Markdown, outside-repository, sorted interactive, empty, and cancelled selection behavior.

Verification: `pnpm typecheck` and all 15 tests pass.

## Phase 4: Interactive archiving

- Replaced `.ready-for-cleanup.txt`, `-f`, and `-c` with a single `task -a` checkbox flow followed by an explicit confirmation.
- Candidates remain based on `implementation-log.md`, are sorted by oldest log first, and display the log's human-readable age. Nothing is selected by default through Inquirer's checkbox behavior.
- Empty selection, cancellation, and rejected confirmation make no filesystem changes; `000-archive` is created only after confirmation.
- Added direct-child/traversal validation, eligibility rechecks, duplicate-selection rejection, and destination conflict preflight before confirmation.
- Archive moves now track completed work and attempt reverse-order rollback if a later rename fails, with explicit reporting for rollback failures.
- Legacy `-a -f`/`-a -c` usage returns a migration message rather than becoming a task name.
- Made rename injectable solely at the command service boundary so partial-failure rollback can be tested deterministically.

Verification: `pnpm typecheck` and all 23 tests pass, including a simulated failure on the second move followed by successful rollback.

## Phase 5: Public repository release preparation

- Updated package metadata for the public `github.com/jaredly/task` repository while keeping `private: true` to prevent npm publication.
- Removed the nonexistent `main` entry, added repository/support metadata, and replaced `devEngines.packageManager` with the conventional `packageManager` field.
- Added the ISC `LICENSE` file.
- Rewrote the README for the final commands, editor precedence, normalization grammar, prompt selection, interactive archive behavior, exit statuses, Unix support, best-effort Windows setup, and development workflow.
- Added GitHub Actions CI for Node 24.12, pnpm installation, type checking, and tests.
- Issue caught by executable smoke testing: replacing `task.ts` cleared its executable bit, causing `permission denied`. Restored mode `755` and reran the CLI directly.
- Final code review also found that repository discovery accepted a regular file named `.tasks`; it now requires a directory and has a regression test.

## Final verification

- `pnpm install --frozen-lockfile` succeeds with the updated package metadata and lockfile.
- `pnpm typecheck` succeeds.
- `pnpm test` passes all 24 tests.
- Direct `./task.ts -h`, `./task.ts --version`, and explicit prompt printing succeed.
- Created a simple task end to end from a nested temporary repository whose path contained spaces; the name was normalized, context was written, and the prompt URL was encoded.
- Exercised interactive `task -p` in a PTY and confirmed it offered only the active task.
- Exercised interactive `task -a` in a PTY: confirmed one selected move while preserving the unselected task, then separately rejected confirmation and verified the remaining task stayed active.
- `git diff --check` and a repository-wide trailing-whitespace check pass.

No release-blocking issues remain from the review. Direct agent/skill integration remains future work as agreed.
