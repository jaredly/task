# Pre-release implementation plan

## Goals

- Make task creation, prompt generation, and archiving predictable and safe before the public GitHub release.
- Replace the review-file archive workflow with one interactive selection and confirmation flow.
- Preserve the intentionally lightweight, Unix-first CLI and its standard/simple/bug prompt modes.
- Add enough automated coverage and CI to make filesystem-moving behavior releasable.

## Explicit non-goals

- Do not add direct Claude, Codex, or other coding-agent integration in this release. Continue printing prompts; skill/agent invocation remains future work.
- Do not prepare the package for npm publication. The supported release is the public GitHub repository, so the package can remain private.
- Do not replace the existing rule that an `implementation-log.md` marks a task as archive-eligible.
- Do not promise first-class Windows support. Avoid unnecessary platform coupling and document a best-effort Windows setup, but treat Unix as the supported target.

## Phase 1: Establish a testable CLI foundation

Refactor only enough to make command behavior testable without launching a real editor or moving real project directories.

1. Split argument parsing and command execution from the executable entry point.
   - Keep `task.ts` as the executable declared by `bin`.
   - Move pure helpers and command handlers into a small module if needed rather than building a general CLI framework.
   - Pass dependencies such as current time, editor launching, interactive prompts, stdout/stderr, and working directory into command handlers where tests need control.
   - Return exit codes from command handlers; reserve top-level `process.exitCode` handling for `task.ts`.
2. Define the supported command grammar in one place.
   - `task <name...>` creates a standard task.
   - `task simple <name...>` and `task bug <name...>` keep their reserved first-word meanings.
   - `task -p [target]` prints or interactively chooses an existing task prompt.
   - `task -a` starts the new interactive archive flow.
   - `task -h` and `task --help` print usage; `task --version` prints the package version.
   - Unknown options and missing task names fail before creating files.
3. Add a checked-in `tsconfig.json` and package scripts for `typecheck` and tests.
4. Use Node's built-in test runner to avoid adding a test-framework dependency. Build temporary `.tasks` fixtures per test and clean them up after each run.

### Phase 1 tests

- Argument parsing for every documented command, unknown flags, missing names, and reserved `simple`/`bug` modes.
- Repository discovery from the task root, descendants, and outside any `.tasks` tree.
- No-argument and invalid invocations do not mutate the filesystem.
- Type checking runs from the documented package script.

## Phase 2: Harden task creation and editor launching

1. Add one task-name normalization function.
   - Determine standard/simple/bug mode before normalizing the remaining name.
   - Join name arguments with `-`.
   - Convert whitespace, path separators, and shell punctuation to `-`.
   - Collapse repeated dashes, trim leading/trailing dashes, and reject an empty result.
   - Preserve alphanumeric characters and the project's accepted safe separators; document the exact resulting grammar.
2. Detect a same-minute/name collision before writing and return a concise actionable error instead of an `EEXIST` stack trace.
3. Use the same `editFile` path for standard, simple, and bug task creation.
   - Resolve the editor from `$VISUAL`, then `$EDITOR`, then `vi`.
   - Parse any configured editor flags into an executable plus arguments, but reject shell operators; spawn the executable with an argument array and `shell: false`.
   - A maintained argument parser may be used for quoted editor values. Do not evaluate the editor value as shell code.
   - Reject nonzero editor exits and signals with a concise error.
   - Leave a newly created task in place if editing fails, report its path, and document that recovery behavior so a user's brief is never deleted unexpectedly.
4. Generate prompt links with `pathToFileURL()` so spaces and special characters in repository paths are encoded correctly.
5. Remove unused imports and apply consistent formatting while touching these files.

### Phase 2 tests

- Standard, simple, and bug task creation, including the correct brief filename and prompt template.
- Relative subdirectory context written into a new brief.
- Normalization of separate words, quoted spaces, slashes, punctuation, repeated separators, and names that normalize to empty.
- Collision handling and editor launch failure without raw stack traces.
- Editor executable/flag parsing and filenames containing spaces; prove that shell metacharacters are passed as data and never executed.
- Correct encoded `file:` URLs.

## Phase 3: Improve prompt selection and reprinting

1. Keep explicit `task -p <target>` permissive and non-validating as requested.
   - Accept an absolute or relative Markdown path, a directory path, or a bare task directory name.
   - Do not require the target to exist; archived paths remain valid explicit targets.
   - Resolve path-like targets relative to the current directory. Resolve a bare task name under the nearest `.tasks` directory when available, with a clearly documented fallback outside a task repository.
   - Infer the workflow from the task directory basename and preserve an explicitly supplied Markdown filename.
2. Add interactive behavior for `task -p` with no target.
   - Require the nearest `.tasks` directory for this form.
   - List only direct, non-archived task directories.
   - Sort by the sortable directory prefix in reverse chronological order.
   - Allow one selection, then print its inferred prompt without opening or modifying files.
   - Return a clean message and successful no-op when there are no active tasks.
3. Use a maintained terminal prompt library compatible with Node 24 for selection. `@inquirer/prompts` currently provides the required select/checkbox/confirm primitives and supports the project's Node version; pin it through the lockfile.

### Phase 3 tests

- Explicit bare names, relative/absolute directories, custom Markdown filenames, nonexistent targets, and archived targets.
- Explicit `-p` use both inside and outside a `.tasks` tree.
- Interactive candidate filtering and reverse-chronological ordering.
- Selection cancellation and an empty active-task list.
- Prompt type inference for standard, simple, and bug directory names.

## Phase 4: Replace archiving with a single interactive flow

1. Replace `.ready-for-cleanup.txt`, `-f`, and `-c` with `task -a` as one operation.
   - Discover direct child directories containing `implementation-log.md`, excluding `000-archive`.
   - Read each log's modification time and display a stable human-readable age such as `18m`, `6h`, or `12d` next to the task name.
   - Sort oldest logs first so stale tasks are easy to identify.
   - Present a checkbox selection with no tasks selected by default.
   - After selection, show the selected count/names and require a separate confirmation before moving anything.
   - Cancellation or an empty selection exits successfully without filesystem changes.
2. Validate every selected entry before the confirmation/move step.
   - Accept only a direct child basename; reject separators, `.`/`..`, and any resolved path outside the expected roots.
   - Require each source task and its implementation log to still exist.
   - Reject destination conflicts before moving the first task.
3. Create `000-archive` only after confirmation.
4. Handle move failures explicitly.
   - Track completed moves and attempt to roll them back if a later move fails.
   - Report which moves completed, which rollback attempts succeeded or failed, and return nonzero on any partial failure.
5. Remove the legacy review-file implementation and update old flag handling to print a concise migration message rather than treating `-f` or `-c` as task names.

### Phase 4 tests

- Candidate detection, exclusion of the archive directory, and the existing implementation-log heuristic.
- Human-readable age boundaries and deterministic ordering using an injected clock.
- Checkbox selection, empty selection, cancellation, rejected confirmation, and confirmed moves.
- No archive directory creation before confirmation.
- Destination conflicts, malformed/traversal entries, disappearing sources, and editor/prompt failures.
- Multi-task move failure and best-effort rollback reporting.
- Legacy archive flags produce the migration message and do not mutate files.

## Phase 5: Public-release metadata, documentation, and CI

1. Align `package.json` with a public GitHub repository that is not published to npm.
   - Keep `private: true` and the `bin.task` entry.
   - Remove the nonexistent `main: index.js` entry.
   - Add a useful description, author, repository (`https://github.com/jaredly/task`), homepage, bugs URL, and relevant keywords.
   - Replace the unusual `devEngines.packageManager` declaration with the conventional pinned `packageManager` field and regenerate `pnpm-lock.yaml` as needed.
2. Add an ISC `LICENSE` file matching the package declaration.
3. Rewrite the README around the final behavior.
   - Document requirements, Unix installation, `$VISUAL`/`$EDITOR` precedence, and editor values with flags.
   - Add command reference/help examples, exact task-name normalization, `-p` interactive and explicit forms, archive selection/age/confirmation, cancellation behavior, and exit semantics.
   - Remove the obsolete review-file/force/cleanup instructions and the hard Zed requirement.
   - Add a short best-effort Windows setup section, clearly noting that Unix is the supported platform.
   - Document development commands for tests and type checking.
4. Add GitHub Actions for the supported Node version using pnpm, running install, type checking, and tests. At minimum test on Linux; add macOS if editor/process behavior needs a platform smoke test.
5. Keep agent/skill integration in `.tasks/future.md` or a clearly labeled roadmap rather than presenting it as current functionality.

## Final verification and release gate

1. Run `pnpm install` to verify the lockfile and package-manager declaration from a clean dependency state.
2. Run `pnpm typecheck` and the complete `pnpm test` suite.
3. Run end-to-end smoke checks in temporary repositories for:
   - standard/simple/bug task creation through a fake editor;
   - task creation from a nested directory;
   - explicit and interactive prompt printing;
   - archive selection with both cancellation and confirmation;
   - repository paths and task arguments containing spaces and punctuation.
4. Verify `task -h`, invalid-command errors, editor failures, collisions, and archive conflicts produce concise output with the intended exit statuses and no raw stack traces.
5. Verify the README commands against a fresh clone on the supported Unix environment.
6. Confirm the GitHub Actions workflow passes before tagging the release.

The release is ready when all high- and medium-priority findings from `research.md` are covered by implementation or explicit documentation, automated tests pass, archive moves require an interactive selection plus confirmation, and no user-controlled path is evaluated through a shell.
