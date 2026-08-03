# Pre-release review

## Recommendation

Do not release the current version unchanged. The core workflow is small and understandable, and the TypeScript source passes a direct static check, but the archive confirmation flow does not honor the documented review, shell-based editor launching makes ordinary path/name characters unsafe, and there is no automated coverage for filesystem-moving behavior. Address the high-priority findings below before release; the remaining items can be decided based on whether this is a private personal tool or a distributable package.

## High-priority findings

### 1. `task -a -f` discards the previously reviewed archive selection

- `README.md:93-105` describes a two-command workflow: run `task -a`, edit `.ready-for-cleanup.txt`, then run `task -a -f` to apply those reviewed moves.
- Every `-a` invocation rewrites the review file from the full candidate list before opening it (`task.ts:85-90`). Consequently, the `-f` invocation loses exclusions made during the first review.
- Reproduction: with two eligible tasks, remove the second during `task -a`, then run `task -a -f` with a no-op editor. Both tasks are archived.
- This undermines the safety mechanism around the command that moves user data. The implementation and documentation need one coherent model. A likely design is: `task -a` creates/edits the selection and previews it; `task -a -f` consumes the existing reviewed file without regenerating or reopening it. An alternative is a single invocation with an explicit confirmation after editing.

### 2. Shell command construction breaks valid paths and permits command injection

- Task creation interpolates the task file into `execSync(\`zed ${dir}/task.md\`)` and the bug equivalent (`task.ts:133,137`). A repository path or task name containing spaces or shell metacharacters will be split or interpreted by the shell. A quoted task argument containing `;`, for example, becomes part of an executed shell command.
- `editFile` similarly combines `$VISUAL`/`$EDITOR` and the filename into one string and uses `shell: true` (`editFile.ts:7-12`). Archive review therefore has the same path quoting problem.
- Launch executables with argument arrays and no shell. Supporting editor environment values that include flags requires deliberate parsing or a documented convention; it should not be achieved by passing untrusted filenames through a shell.
- File links in prompts are also assembled manually (`task.ts:35-42`), so paths containing spaces or URL-significant characters are not encoded. `pathToFileURL()` would make these valid.

### 3. Archive entries are not constrained to direct children of `.tasks`

- Each edited line is passed directly to `join(tasks, name)` and `join(archive, name)` (`task.ts:100-107`). Absolute-looking input and `..` segments can resolve outside the intended source/destination directories.
- The initial file is generated internally, but it is explicitly user-editable, so malformed edits should fail safely. Require a single directory basename, reject separators, `.` and `..`, and verify the resolved source and destination remain under their expected roots.
- Archive moves are also performed sequentially (`task.ts:113-117`). A filesystem error after one successful move leaves a partial operation. At minimum, report partial completion clearly; preferably make the behavior recoverable and cover it with tests.

### 4. The release has no executable test suite

- `package.json:9-11` defines `test` as an intentional failure, while `README.md:134` confirms there is no automated suite.
- This CLI creates and moves directories, infers modes from names, searches parent directories, invokes editors, and has dry-run/force behavior. These are inexpensive to test against temporary directories and risky to leave unguarded.
- Before release, add tests for standard/simple/bug creation, subdirectory context, prompt reprinting, missing/invalid input, repository discovery, archive selection preservation, dry run, force, conflicts, traversal rejection, filenames with spaces, and editor failure. The editor command should be injectable or replaceable in tests.

## Medium-priority findings

### 5. Missing arguments and invalid usage mutate state or throw raw exceptions

- Running `task` with no arguments creates a directory such as `.tasks/06mey-/` and its `task.md`, then tries to open Zed (`task.ts:127-137`). In the probe, editor startup failed and left that partial task behind.
- Running `task -p` without a target throws a `TypeError` at `task.ts:54`.
- Unknown options are treated as task names. There is no `--help`/`-h`, usage error, or `--version` behavior.
- Validate the complete command before writing anything, print concise usage for invalid input, and return a stable nonzero exit status. Consider removing a just-created empty task if editor startup fails, or explicitly document that the task remains.

### 6. Prompt reprinting bypasses repository and target validation

- The `-p` branch runs before the `.tasks` existence check (`task.ts:53-65`). From outside a task repository, `task -p 06abc-example` exits successfully with a link rooted at `file:////.tasks/...`.
- It does not verify that the supplied task directory or Markdown file exists, and reduces any provided path to basenames (`task.ts:54-55`). A typo therefore produces a plausible but broken prompt.
- Require a discovered `.tasks` root and resolve/validate the supplied target. It should be clear whether absolute paths, paths relative to the current directory, and bare task names are supported.

### 7. Editor behavior is inconsistent and failures are mishandled

- New tasks always use hard-coded `zed` (`task.ts:133,137`), while archive review uses `$VISUAL`, `$EDITOR`, or `vi` (`editFile.ts:4`). The README accurately lists Zed as a requirement, but the two editing experiences are needlessly inconsistent unless this is intentional.
- `editFile` resolves successfully for every numeric exit code and only rejects on a signal or spawn error (`editFile.ts:15-22`). A test with `EDITOR=false` continued to preview archive moves and exited 0 even though editing failed.
- Use one editor helper for both flows, reject nonzero exits, and decide whether Zed is a product requirement or merely the default editor.

### 8. Archive cleanup reports failure after succeeding

- `task -a -c` always calls `process.exit(1)`, including after deleting the review file and when there was simply nothing to delete (`task.ts:76-84`). This makes successful cleanup fail in scripts and shells.
- Return 0 for successful/idempotent cleanup and reserve nonzero statuses for actual errors.

### 9. Package metadata is contradictory or incomplete for a public release

- `package.json:5` declares `index.js` as `main`, but that file does not exist. The CLI entry in `bin` is correct.
- The description, keywords, and author are empty (`package.json:4,12-13`), and there is no repository/homepage metadata or standalone `LICENSE` file.
- `private: true` (`package.json:30`) prevents normal npm publication, while version `1.0.0` suggests a release-ready package. This is fine for a private repository release but contradictory if “release” means publishing to npm.
- The package-manager requirement is unusually strict: `devEngines` names pnpm 11.1.3 exactly and uses `onFail: "download"` (`package.json:18-23`). `npm pack --dry-run` fails with `EBADDEVENGINES` when run under npm. Confirm this is intentional and prefer the conventional `packageManager` field if the goal is Corepack/pnpm version declaration.

## Low-priority cleanup and clarity

- Remove the unused `spawn` import in `task.ts:2` and apply the repository's formatter. The current file mixes quote styles, indentation, and semicolon usage, which makes a small CLI harder to scan.
- Add a checked-in `tsconfig.json` and a `typecheck` script. The README says TypeScript can be used for static checking but gives no reproducible command or compiler settings.
- Clarify task-name rules. `bug` and `simple` are reserved first tokens, names are joined with hyphens, slashes can accidentally request nested paths, and creating the same task name twice within one minute fails with an unhandled `EEXIST` stack trace.
- `fs.mkdirSync(archive)` (`task.ts:96-99`) is run even for a dry-run preview, so `task -a` can mutate the tree by creating `000-archive`. This is minor, but it weakens the wording that the preview makes no task-directory changes; directory creation can wait until force mode.
- Archive readiness is defined only by the presence of `implementation-log.md` (`README.md:91`, `task.ts:85-86`). If an empty or work-in-progress log is possible, the criterion may archive unfinished tasks. This needs a documented convention or a stronger explicit completion marker.
- The January 1, 2026 base-36 identifier is concise, but its behavior under clock rollback and same-minute duplicate names is unspecified. A friendly collision message is likely sufficient; full collision avoidance may not be necessary.

## Potentially missing release features

These are not all blockers, but they are the most noticeable omissions for a CLI release:

1. Built-in `--help` with command syntax, examples, exit behavior, and task-name constraints.
2. Automated tests and a real `pnpm test` command; CI if the project will accept changes from more than one machine/person.
3. Configurable/default editor behavior shared by task creation and archiving.
4. Clear distribution path: private symlinked script versus npm-installed CLI, with package metadata matching that choice.
5. A license file and basic release/version mechanism if distributed beyond the repository owner.

The ideas recorded in `.tasks/future.md` align with items 1 and 3 and with the archive-flow finding. Its remaining idea, invoking an agent or exposing a `/research`-style skill instead of printing a multi-step prompt, would be a meaningful workflow improvement but changes the product boundary. It should be treated as post-release integration work unless direct agent invocation is part of the intended initial promise.

## Open questions

1. What does “release” mean here: a private Git repository/tool used by one person, a downloadable GitHub release, or publication to npm? This determines whether `private`, package metadata, CI, and a license file are blockers.
    - public github repo available generally
2. Should `task -a -f` apply the selection saved by the preceding `task -a`, or is each invocation intended to regenerate and re-review the candidates? The README currently promises the former.
    - idk what if instead we have an interactive cli like pnpm approve-builds uses, followed by a 'confirm'
        - the cli should indicate how long ago the implementation-log.md was edited, to filter out still-active tasks
3. Should new-task editing respect `$VISUAL`/`$EDITOR`, use Zed by default with an override, or require Zed unconditionally?
    - let's go with VISUAL/EDITOR
4. What task-name grammar should be supported? In particular, should spaces be normalized, should slashes and shell punctuation be rejected, and are `simple`/`bug` intentionally reserved as the first word?
    - simple/bug are intentionally reserved as the first word
    - let's just normalize slashes and shell punctuation to dash (same as spaces currently are)
5. Should `-p` accept only tasks in the nearest `.tasks` directory, or also arbitrary task paths? Should archived tasks be valid targets?
    - arbitrary. doesn't even have to exist
        - but if you give -p without an argument, it should list non-archived tasks in the nearest directory in reverse chronological order, allowing you to select one to continue with
6. Is any `implementation-log.md` enough to declare a task archive-ready, or should completion be explicit?
    - yeah it's a fine heuristic
7. Which operating systems are supported? The shebang and Node APIs are portable, but symlink installation and editor command conventions in the README are Unix-oriented.
    - unix is the focus, but we could include windows instructions
8. Is this CLI intentionally only a prompt generator, or should the first release integrate with a specific coding agent/skill command? If integration is in scope, which agents must be supported and should plain prompt output remain the fallback?
    - that'll be future work

## Validation performed

- Read all tracked source, package, and README files and reviewed recent history.
- Ran static checking successfully with `pnpm exec tsc --noEmit --target esnext --module nodenext --moduleResolution nodenext --allowImportingTsExtensions --types node task.ts editFile.ts`.
- Exercised creation and prompt printing in isolated temporary directories, including missing arguments and use outside a `.tasks` tree.
- Exercised archive preview, failed-editor, cleanup, reviewed-selection, and force behavior in isolated temporary `.tasks` trees.
- Ran `npm pack --dry-run`; it did not reach a package listing because npm rejected the pnpm-only `devEngines.packageManager` declaration with `EBADDEVENGINES`.
- No project test suite could be run because the declared `test` script intentionally exits with an error.
