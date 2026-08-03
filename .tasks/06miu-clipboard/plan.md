# Plan

## Phase 1: Add the clipboard integration boundary

Add the cross-platform clipboard dependency and expose text copying through the CLI's existing injected service layer.

- Add `clipboardy` as a runtime dependency in `package.json` and update `pnpm-lock.yaml` with pnpm.
- Extend `CliServices` in `cli.ts` with an asynchronous `copyToClipboard(text: string): Promise<void>` function.
- Import `clipboardy` in `task.ts` and wire `clipboardy.write` into the real `runCli` service object.
- Keep platform selection and process execution inside `clipboardy`; do not add project-owned `pbcopy`, `xsel`, `xclip`, or `wl-copy` command logic.
- Update the `test/cli.test.ts` harness with a default no-op clipboard implementation so existing command tests remain isolated from the host clipboard.
- Preserve the existing uncommitted `task init` changes in `cli.ts`, `test/cli.test.ts`, and `README.md`; make only additive clipboard-related edits in those files.

## Phase 2: Copy prompts after successful task editing

Update `createTask` in `cli.ts` so successful standard, simple, and bug task creation copies the same initial prompt that it prints.

- Leave task directory creation, brief initialization, and editor invocation unchanged.
- After `services.editFile(brief)` resolves, generate the initial prompt once with the existing `promptFor(kind, fullName, brief)` helper.
- Print the generated prompt through `services.out` exactly as today, without adding a separate clipboard-success message.
- Await `services.copyToClipboard(prompt)` only after the editor completes successfully.
- Return `0` when both editing and clipboard copying succeed.
- If clipboard copying rejects, retain the created task and brief, keep the prompt available on stdout, report that task creation and printing succeeded but clipboard copying failed, include the underlying error, and return `1`.
- Do not invoke clipboard copying when task validation, directory creation, or editing fails.
- Apply this behavior only to newly created tasks. Leave `task -p`, `--no-skill`, `task agent`, `task init`, archive, help, and version commands unchanged.

## Phase 3: Cover clipboard behavior

Extend `test/cli.test.ts` using injected clipboard functions; never write to the real system clipboard during automated tests.

- Enhance the existing task-kind creation coverage to capture copied text for standard, simple, and bug tasks.
- Assert that each copied value exactly equals the prompt emitted through `services.out`, including the correct initial skill and encoded task-file URL.
- Record editor and clipboard events to verify copying occurs after the editor promise resolves.
- Extend the editor-failure test to verify the clipboard service is not called.
- Add a clipboard-failure test that verifies exit code `1`, task and brief retention, prompt output preservation, and a concise error containing the underlying failure.
- Add a representative non-creation assertion, preferably through `task -p`, proving prompt printing alone does not copy to the clipboard.
- Keep the harness default as a no-op so unrelated CLI, archive, skills, and agent tests require no behavior changes.

Run focused verification after the code and tests are in place:

- `node --test test/cli.test.ts`
- `pnpm typecheck`

## Phase 4: Document the user-visible behavior

Update `README.md` to match the new task-creation workflow and platform constraints.

- Change the introductory task-creation description to state that the initial prompt is printed and copied after the editor exits successfully.
- Add a concise note near the task-creation usage explaining that creating a task overwrites the current system clipboard with the generated skill invocation and task-file URL, not the brief contents.
- Document that clipboard access on Linux requires a graphical X11 or Wayland session and that native Wayland environments may require `wl-clipboard`.
- State that prompt output remains available in the terminal if clipboard access fails.
- Do not claim new Windows support merely because the selected dependency can operate there.
- Leave `task -p` documented as print-only.

## Phase 5: Validate the complete change

Run the repository's complete checks and review the scoped diff.

- Run `pnpm typecheck`.
- Run `pnpm test`.
- Run `git diff --check`.
- Review `package.json` and `pnpm-lock.yaml` to confirm `clipboardy` is a runtime dependency and the lockfile contains only the expected dependency resolution changes.
- Review the final diff to confirm existing `task init` work was preserved and no real clipboard access was introduced into tests.

## Out of scope

- Copying prompts produced by `task -p`, including `--no-skill` transcripts.
- Copying prompts for `task agent` stages.
- Copying the contents of `task.md` or `bug.md`.
- Adding a flag or configuration setting to disable clipboard copying.
- Adding a clipboard success message or changing the generated prompt format.
- Implementing or maintaining platform-specific clipboard subprocess logic in this repository.
- Expanding the documented support policy to Windows.

## Completion criteria

- Every successfully edited standard, simple, or bug task copies its exact printed initial prompt to the system clipboard.
- Clipboard copying never occurs before editor success or from non-creation prompt commands.
- Clipboard failures retain the task, preserve the printed prompt, produce a useful error, and return exit code `1`.
- Existing task creation output and prompt formatting remain unchanged on success.
- macOS and desktop Linux clipboard behavior is provided through `clipboardy` and documented with Linux display-server limitations.
- Focused CLI tests, the full test suite, type checking, and diff checks pass.
