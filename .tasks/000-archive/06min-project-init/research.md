# Research

## Task summary

Add a `task init` command. It should check for a `.tasks` directory from the current working directory, and when none is found it should ask whether to create `.tasks` in the current directory using a default-no `(y/N)` confirmation.

## Current behavior

The CLI currently requires a repository or ancestor directory to already contain `.tasks`. `findTasksBase(cwd)` walks upward from `cwd`, returning the directory that owns the nearest `.tasks` directory, and ignores a regular file named `.tasks` (`cli.ts:71`, `test/cli.test.ts:79`).

Task creation calls `createTask(args, services, base)` after command dispatch. If `base` is missing, it prints `Unable to find a .tasks directory` and exits `1` (`cli.ts:176`, `cli.ts:686`). This means running `task add work` outside an initialized tree fails rather than creating `.tasks`.

`init` is not reserved today. Because `runCli` treats any non-option command not matched by `-p`, `-a`, `skills`, or `agent` as a task name, `task init` currently creates a normal task named `init` when a `.tasks` directory exists, and fails with the standard missing-directory error when one does not (`cli.ts:644`, `cli.ts:663`, `cli.ts:678`, `cli.ts:686`).

The service boundary already supports interactive confirmation. `CliServices.confirm` is injected for tests (`test/cli.test.ts:40`) and the real entry point uses `@inquirer/prompts` with `default: false`, which renders default-no behavior appropriate for `(y/N)` (`task.ts:42`). The CLI also already handles prompt cancellation uniformly by returning `0` and printing `Cancelled.` for `ExitPromptError` (`cli.ts:687`).

The README currently documents manual setup with `mkdir .tasks` and lists "A repository or parent directory containing a `.tasks` directory" as a requirement (`README.md:7`, `README.md:31`). The usage summary has no `init` command (`README.md:73`).

## Feasible approaches

1. Add a dedicated `initTasks(services, base)` helper and dispatch it before task creation.

   This is the most compatible approach. `runCli` can compute `base` once, branch on `args[0] === "init"`, reject extra arguments as usage errors, and otherwise leave existing task creation behavior unchanged. The helper can:

   - If `base` is already found, print a no-op message such as `Found existing .tasks directory: <path>` and return `0`.
   - If no base is found, call `services.confirm("Create .tasks in the current directory?")`.
   - On rejection, print `Cancelled.` and return `0`.
   - On acceptance, create `join(services.cwd, ".tasks")` with `mkdirSync`, print `Created .tasks directory: <path>`, and return `0`.

   This keeps all filesystem work in `cli.ts`, follows the existing service-injected prompt pattern, and gives tests direct control over confirmation.

2. Fold initialization into `createTask` when no `.tasks` directory exists.

   This would reduce an extra command but changes the behavior of every task-creation command outside a `.tasks` tree. The brief specifically asks for `task init`, so implicit initialization would be a broader UX and compatibility change.

3. Add initialization to `findTasksBase`.

   This should be avoided. `findTasksBase` is currently a pure lookup helper used by task creation, prompt selection, archive, and agent commands. Making it prompt or write would couple read-only commands to side effects and complicate tests.

## Recommendation

Implement approach 1. Reserve `init` as a top-level command in `runCli`, with an adjacent helper in `cli.ts`. Reuse `services.confirm` so the actual `(y/N)` default is provided by the existing entry point. Keep `findTasksBase` read-only.

Suggested command semantics:

- `task init` inside an existing `.tasks` tree: return `0` and do not create anything.
- `task init` outside an existing `.tasks` tree, confirmation rejected: return `0`, print `Cancelled.`, and do not create `.tasks`.
- `task init` outside an existing `.tasks` tree, confirmation accepted: create `.tasks` directly under `services.cwd`, return `0`, and print the created path.
- `task init extra`: return `2` with `Usage: task init`.
- If a regular file named `.tasks` exists in `cwd`, `findTasksBase` will return `undefined`; creation with `mkdirSync(join(cwd, ".tasks"))` will fail with the platform `EEXIST`/not-a-directory error and return `1` through the existing catch path. A clearer preflight error could be added, but is not necessary for the requested behavior.

## Test coverage

Add focused tests in `test/cli.test.ts`:

- `task init` creates `.tasks` in an uninitialized temporary directory only after confirmation.
- Rejected confirmation leaves the directory unchanged and exits cleanly.
- Existing `.tasks` makes `task init` idempotent and does not call confirmation.
- `task init extra` returns usage error `2`.
- Update the help assertion to include `task init`, and add an assertion that `task init` no longer creates a normal task named `init`.

The entrypoint already configures confirmation as default-no, so unit tests can verify behavior through `CliServices.confirm`; no new dependency is needed.

## Documentation

Update README setup and usage:

- Replace or augment the manual `mkdir .tasks` setup instructions with `task init`.
- Add `task init` to the help block.
- Mention that the CLI can initialize the current directory and prompts before creating `.tasks`.
- Update the reserved-word note to include `init`, since it will no longer be available as a plain task name. A user can still create a task with another name containing init, for example `task project init`.

## Compatibility and migration concerns

This is a small breaking change for anyone who currently runs `task init` intending to create a task literally named `init`. Because top-level verbs already reserve names like `simple`, `bug`, `skills`, and `agent`, reserving `init` is consistent with the CLI shape. Documenting the reservation should be enough.

The default-no prompt avoids accidental creation in the wrong directory, especially because the command initializes `services.cwd` rather than a repository root discovered by Git. There is no current Git-root helper in the codebase, and the brief explicitly says "current directory", so adding Git discovery would be extra behavior.

No external facts are needed for this task.

## Open questions

None.
