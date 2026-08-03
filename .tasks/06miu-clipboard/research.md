# Research

## Task summary

After a newly created task brief has been edited successfully, copy the task's initial coding-agent prompt to the operating system clipboard in addition to printing it.

The brief says "task.md," but standard and simple tasks use `task.md` while bug tasks use `bug.md`. All three creation modes share the same post-editor path, so the most consistent interpretation is to copy the initial prompt for every successfully created task kind.

## Current behavior

`createTask` creates the task directory and brief, awaits `services.editFile(brief)`, and only after the editor exits successfully generates and prints `promptFor(kind, fullName, brief)` (`cli.ts:201`, `cli.ts:227`, `cli.ts:232`, `cli.ts:241`). The editor service rejects on a spawn error, signal, or nonzero exit (`editFile.ts:21`). On such a failure, the task is retained, an error containing its path is printed, and no prompt is generated (`cli.ts:232`, `test/cli.test.ts:204`).

The "initial prompt" is already defined centrally. `promptFor` delegates to `promptForStage` using the task kind's initial workflow stage (`cli.ts:105`). The resulting prompt is a compact skill invocation containing the task ID and an encoded absolute `file:` URL (`workflow.ts:57`, `workflow.ts:90`). Standard tasks start with `$task-research`, simple tasks with `$task-implement`, and bug tasks with `$task-bugfix` (`workflow.ts:57`, `workflow.ts:94`). Clipboard code should consume this generated string rather than reconstructing it.

`task -p` independently generates and prints a prompt, optionally using the legacy `--no-skill` transcript (`cli.ts:259`). It does not edit a brief. The request's timing, "after the task.md edit is finished," points to task creation only, not changing `task -p` or agent-driven workflow commands.

The CLI already isolates environment-specific behavior behind `CliServices`: editing, renaming, prompts, agent access, and output are injected by the real entrypoint and replaced by the test harness (`cli.ts:42`, `task.ts:34`, `test/cli.test.ts:35`). Clipboard access fits this boundary and should not be embedded directly in `createTask`.

The documented primary targets are macOS and Linux on Node.js 24.12 or newer (`README.md:7`). Clipboard behavior is not currently implemented or documented, and the project has no clipboard dependency.

## Feasible approaches

### 1. Use `clipboardy` behind an injected clipboard service

Add an asynchronous `copyToClipboard(text: string): Promise<void>` member to `CliServices`. Wire it in `task.ts` with `clipboardy.write`, and provide a no-op or capturing implementation in unit tests. After the editor succeeds, compute the prompt once, print it, and await `services.copyToClipboard(prompt)`.

`clipboardy` exposes an ESM asynchronous `write(string): Promise<void>` API and currently supports macOS and Linux, including Wayland. Its current package requires Node.js 20 or newer, which is below this project's Node.js 24.12 floor. On Linux it uses `xsel` with a bundled fallback for X11; under Wayland it uses `wl-clipboard` when available and otherwise attempts an X11 fallback. It explicitly reports that headless Linux has no system clipboard. See the upstream [clipboardy README](https://github.com/sindresorhus/clipboardy#readme), [Linux implementation](https://github.com/sindresorhus/clipboardy/blob/main/lib/linux.js), and [package metadata](https://github.com/sindresorhus/clipboardy/blob/main/package.json).

Advantages:

- Covers both supported operating systems and Linux display-server variants through one small API.
- Keeps platform detection, executable selection, stdin handling, and useful Linux errors out of this CLI.
- Matches the project's ESM and async conventions.
- Makes `createTask` tests deterministic through dependency injection without touching the developer or CI clipboard.

Costs:

- Adds a direct dependency and its transitive packages, including functionality beyond text writes.
- Wayland still depends on `wl-clipboard` being installed, and no clipboard implementation can work in a truly headless Linux environment.

### 2. Own a platform-command wrapper

Implement a local helper using `node:child_process.spawn`: use `pbcopy` on macOS and select among `wl-copy`, `xsel`, or `xclip` on Linux, pipe the prompt to stdin, close stdin, and reject on spawn errors, signals, or nonzero exits. Node's subprocess API supports piped stdin and direct spawning without a shell; the child must receive an `end()` so a clipboard command waiting for EOF can finish. See the [Node.js child process documentation](https://nodejs.org/api/child_process.html).

This avoids a JavaScript dependency and resembles the existing `editFile` helper. It is not actually dependency-free on Linux, however: the user must have the appropriate desktop utility installed. Correct fallback behavior also requires display-session detection and careful process handling. Clipboardy's upstream Linux implementation specifically avoids `xclip` because it can leave subprocess pipes open and hang. Reimplementing that matrix is disproportionate to this feature.

### 3. Support only macOS with `pbcopy`

`pbcopy` accepts stdin and writes it to the general macOS pasteboard, so this is the smallest implementation for the current development machine. It would contradict the README's Linux support claim and make a core task-creation side effect platform-dependent without a documented fallback. This approach is not recommended.

## Recommendation

Use approach 1: add `clipboardy` as a runtime dependency and expose it to `runCli` through `CliServices.copyToClipboard`.

In `createTask`, after `editFile` resolves:

1. Generate `const prompt = promptFor(kind, fullName, brief)` exactly once.
2. Print that exact string through `services.out(prompt)` so existing terminal behavior and the manual fallback remain intact.
3. Await `services.copyToClipboard(prompt)` and return `0` on success.
4. If copying fails, report a concise clipboard-specific error and return `1`, while retaining the created task and already printed prompt.

Printing before the clipboard operation guarantees the user still receives the prompt when a display server, Wayland utility, or clipboard process is unavailable. A nonzero result is preferable to silently claiming full success when a requested side effect failed, and it is consistent with the existing editor-failure policy. The error should state that the task was created and the prompt was printed but clipboard copying failed, so recovery is obvious.

Do not add a second success message such as `Copied to clipboard`; successful creation currently emits only the useful prompt, and the clipboard behavior can be documented without changing the output shape. Do not copy after an editor failure, because the user has not successfully completed the brief edit. Do not change `task -p` in this task; it has no editor completion event and the brief does not request general copy-on-print behavior.

## Test coverage

Extend the CLI test harness with a default asynchronous no-op `copyToClipboard`. Then add focused assertions in `test/cli.test.ts`:

- Successful creation copies exactly the same prompt string passed to `services.out`.
- Clipboard copying occurs only after `editFile` resolves.
- Standard, simple, and bug creation all copy their correct initial skill prompts; the existing task-kind creation loop is a natural place to capture this.
- An editor failure never invokes clipboard copying.
- A clipboard failure retains the task and brief, still prints the generated prompt, reports the clipboard error, and returns `1`.
- Non-creation commands such as `task -p`, help, `init`, archive, and agent commands do not invoke clipboard copying.

The real clipboard integration should not be exercised by the automated suite because doing so would mutate the running user's clipboard and commonly fails in headless CI. The injected service tests establish the CLI contract; `clipboardy` owns its platform integration tests.

Type checking and the full test suite remain the appropriate validation commands:

- `pnpm typecheck`
- `pnpm test`

## Documentation and compatibility

Update the README's opening description and task-creation documentation to say that, after the editor exits successfully, the initial prompt is both printed and copied to the system clipboard. Note that Linux requires a graphical X11 or Wayland session and may require `wl-clipboard` for native Wayland operation.

This deliberately overwrites the user's existing clipboard whenever a task is created successfully. That is the requested behavior, but it is a visible UX change and should be stated plainly. The clipboard contains only the generated skill invocation and task-file URL, not the contents of the edited brief.

The implementation adds a required `CliServices` member, so `task.ts` and the test harness must be updated together. It also changes `package.json` and `pnpm-lock.yaml`. There is no persisted data migration and no change to task directory formats or agent state.

Headless Linux and remote SSH sessions may fail to copy even though task creation and editing succeeded. Preserving stdout provides a usable fallback; returning nonzero makes the missing clipboard side effect observable. macOS and supported desktop Linux remain the intended environments, while Windows behavior supplied incidentally by `clipboardy` need not expand the project's documented support policy.

## Open questions

None. The recommended defaults resolve the unspecified scope and failure behavior: apply copying to all newly created task kinds, leave `task -p` unchanged, and preserve printed output while returning nonzero on clipboard failure.
