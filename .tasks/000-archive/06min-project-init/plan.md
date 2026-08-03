# Plan

## Phase 1: Add the initialization command

Update `cli.ts` to expose `task init` in the command help and dispatch it as a top-level command before the generic task-creation fallback.

- Add an `initTasks` helper that receives `CliServices` and the result of `findTasksBase`.
- When an existing `.tasks` directory is found in the current directory or an ancestor, return success, report its path, and do not prompt or create a nested directory.
- When no `.tasks` directory is found, ask through `services.confirm` whether to create `.tasks` in `services.cwd`. Rely on the existing entrypoint configuration in `task.ts`, where confirmation defaults to false and is presented as `(y/N)`.
- If confirmation is declined, return success with the existing `Cancelled.` convention and leave the filesystem unchanged.
- If confirmation is accepted, create `join(services.cwd, ".tasks")`, report the created path, and return success.
- Accept no operands or options after `init`; report `Usage: task init` and return exit code `2` for extra arguments.
- Leave `findTasksBase` and generic task creation unchanged. Filesystem conflicts, including a regular file named `.tasks`, continue through the existing top-level error handler and return exit code `1`.

## Phase 2: Cover command behavior

Extend `test/cli.test.ts` with focused command-level tests using an uninitialized temporary directory and the injected confirmation service.

- Verify declined confirmation returns `0`, emits cancellation output, and does not create `.tasks`.
- Verify accepted confirmation returns `0`, creates `.tasks` as a directory directly under the current working directory, and reports the path.
- Verify running `task init` from below an existing `.tasks` directory returns `0`, does not invoke confirmation, and does not create a nested `.tasks` directory.
- Verify extra arguments return `2` with `Usage: task init` and do not prompt or mutate the filesystem.
- Verify `init` is dispatched as a command rather than creating a task whose normalized name is `init`.
- Update the existing help assertion to require the new `task init` entry.

The entrypoint test does not need prompt interaction coverage because `task.ts` already configures `@inquirer/prompts` confirmation with `default: false`; the CLI unit tests exercise both confirmation outcomes through `CliServices`.

## Phase 3: Update user documentation

Update `README.md` so setup and command documentation match the new behavior.

- Add `task init` to the usage summary.
- Replace the manual `mkdir .tasks` setup step with the initialization command and describe its default-no confirmation.
- Clarify that initialization uses the current directory only when no `.tasks` directory exists in the current directory or an ancestor.
- Add `init` to the documented top-level reserved command names.

## Phase 4: Validate the change

Run the repository's standard checks:

- `pnpm typecheck`
- `pnpm test`

Confirm the tests cover exit codes, prompt invocation, filesystem mutation, ancestor idempotence, help text, and invalid arguments.

## Out of scope

- Automatically initializing as part of ordinary task creation.
- Discovering or initializing a Git repository root instead of `services.cwd`.
- Changing how other commands locate the nearest ancestor `.tasks` directory.
- Adding recovery or replacement behavior when `.tasks` exists as a regular file.
- Preserving `task init` as a way to create a task literally named `init`; `init` becomes a reserved top-level command.

## Completion criteria

- `task init` is documented and available from the CLI help.
- The command is idempotent anywhere under an existing `.tasks` directory and never prompts in that case.
- In an uninitialized directory tree, `.tasks` is created in the current directory only after an explicit affirmative response to a default-no prompt.
- Cancellation and invalid invocation leave the filesystem unchanged and return the documented exit codes.
- Type checking and the complete automated test suite pass.
