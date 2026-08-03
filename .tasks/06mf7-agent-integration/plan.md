# Agent workflow integration plan

## Goal

Replace the repeated workflow prompts with personal Codex skills, then add an opt-in CLI-owned Codex ACP workflow that can start and explicitly advance a task through its stages. Preserve printed skill commands as the simple fallback and do not claim to control an already-active Zed thread.

## Decisions carried forward

- Install the skills personally so they are available in every repository.
- Use Codex's conventional `$skill-name` invocation instead of trying to create exact `/research` commands.
- Allow plan and later skills to infer the task from the thread when no path is supplied; ask for a path when inference is ambiguous.
- Require explicit user action before starting or advancing agent work.
- Prompt before planning whenever the research document has an open-questions section, so unanswered questions are not skipped accidentally.
- Keep commit as a separate stage for standard tasks.
- Include commit in the combined simple-task and bug-fix workflows.
- Trial a CLI-owned ACP thread. Active Zed-thread injection is deferred.
- Prefer recovering a task/thread association from the task ID in the first user message, with persisted state and an interactive picker as reliable fallbacks.

## Proposed workflow

### Standard task

1. `task <name>` creates the brief and prints `$task-research <brief>`.
2. `$task-research` writes `research.md` and stops.
3. `$task-plan` checks for open questions, writes `plan.md`, and stops.
4. `$task-implement` implements and verifies the plan while maintaining `implementation-log.md`, then stops without committing.
5. `$task-commit` reviews the completed work and commits only task-related changes.

### Simple task

`$task-implement <brief>` reviews the brief, asks only blocking questions, implements and verifies the change, maintains `implementation-log.md`, and commits the task-related changes.

### Bug task

`$task-bugfix <brief>` creates a failing reproduction, investigates, fixes and verifies the bug, maintains `implementation-log.md`, and commits the task-related changes. It stops for more information when a reliable reproduction or safe fix cannot be established.

### CLI-owned agent mode

- `task agent start [target]` explicitly creates a Codex ACP session and runs the first stage.
- `task agent next [target]` explicitly resumes the associated session and runs the next stage.
- `task agent status [target]` reports the association, last completed stage, and inferred next stage without starting work.
- Omitting `target` uses the existing active-task picker. No agent command runs automatically during task creation.

The exact command names can be adjusted during implementation if they conflict with the final CLI parser, but the agent operations should remain under an explicit namespace rather than reserving common task names such as `next` or `start` at the top level.

## Phase 1: Define and install the personal skills

### Canonical skill files

Add a top-level `skills/` directory containing:

- `skills/task-research/SKILL.md`
- `skills/task-plan/SKILL.md`
- `skills/task-implement/SKILL.md`
- `skills/task-bugfix/SKILL.md`
- `skills/task-commit/SKILL.md`

Keep these as the canonical sources rather than placing them directly in this repository's `.agents/skills`; installation will expose them globally and avoid having two discovered copies while developing this repository.

Each skill must define:

- valid inputs: Markdown brief, task directory, or omitted path where allowed;
- resolution rules for the task ID and task directory;
- required input artifacts and output artifacts;
- a strict stage boundary and completion condition;
- handling for existing research, plan, and log files;
- preservation of unrelated working-tree changes;
- when to ask a question and stop;
- verification and logging expectations;
- commit behavior, including staging only task-related changes.

For no-argument inference, instruct the skill to locate the task ID or task-file link in the earliest relevant user message in the current thread. If there is no unique task, it must request a task path rather than choosing the newest task directory.

### Installer commands

Add an explicit personal-skill management command, preferably:

```text
task skills install
task skills status
task skills uninstall
```

Implementation requirements:

- Resolve the repository's canonical `skills/` directory relative to the installed CLI entry point, not the caller's working directory.
- On Unix, install one symlink per skill under `~/.agents/skills` so updates to this checkout take effect without copying files.
- Create parent directories as needed.
- Refuse to replace a pre-existing non-owned file, directory, or symlink; report the conflict and leave it unchanged.
- Make install and uninstall idempotent.
- Uninstall only links that resolve to this package's canonical skill directories.
- Keep home-directory mutation opt-in; do not run installation from `pnpm install` or package lifecycle scripts.
- Document the limited Windows support or add a copy fallback only if it can be updated and uninstalled safely.

### Skill validation

- Add tests that every canonical skill has valid frontmatter with a unique name and nonempty description.
- Add focused assertions for required workflow boundaries, artifact names, and standard/simple/bug commit behavior.
- Exercise install, repeated install, conflict handling, status, and uninstall against a temporary fake home directory.
- Manually verify `$task-research`, `$task-plan`, `$task-implement`, `$task-bugfix`, and `$task-commit` appear in Codex CLI after installation.
- Update or reinstall Zed's Codex External Agent to the current registry adapter, then verify the same skills appear in the Zed command menu. Record any spelling difference such as `/$task-research` in the README.

## Phase 2: Replace long prompt templates with skill invocations

Refactor `promptFor` in `cli.ts` so task creation and `task -p` emit a single first-stage invocation:

- standard: `<task-id>: $task-research <absolute or correctly linked brief>`;
- simple: `<task-id>: $task-implement <brief>`;
- bug: `<task-id>: $task-bugfix <brief>`.

Keep the task ID at the start of the first message. This makes the ACP session title/preview useful for later thread discovery and gives the skills a stable identifier to infer from thread context.

Decide one canonical path representation and use it everywhere. A file URL/Markdown link is preferable for editor context, but the skill must also receive an unambiguous path it can resolve from the repository working directory.

Update:

- CLI unit tests for creation and `-p` output;
- help and README examples;
- task-kind documentation;
- task directory examples to include the optional agent state file introduced later.

Preserve `task -p` as a no-agent fallback: it prints the invocation and never starts Codex.

## Phase 3: Add stage resolution and safety checkpoints

Create a workflow module separate from argument parsing. It should model task kind, ordered stages, artifacts, and stage completion explicitly.

Suggested stage orders:

| Kind | Stages |
| --- | --- |
| standard | `research`, `plan`, `implement`, `commit`, `complete` |
| simple | `implement-and-commit`, `complete` |
| bug | `bugfix-and-commit`, `complete` |

Requirements:

- Prefer persisted agent workflow state after a successful CLI-owned turn.
- Use artifact presence only to recover or propose a stage when state is missing; show the inference and require confirmation before adopting it.
- Never treat the existence of `implementation-log.md` alone as proof that implementation completed, because the log may be created at the beginning of work.
- Before moving from research to planning, if `research.md` contains an `Open questions` heading, prompt: confirm that the questions were answered or intentionally left unanswered. Default to not continuing.
- Allow an explicit stage override for recovery, but confirm when it moves backward, skips a stage, or conflicts with persisted state.
- Report `complete` cleanly rather than sending another agent prompt.

Add unit tests for every task kind, missing artifacts, recovered state, open-question confirmation, rejected confirmation, stage override, failed turns, and completion.

## Phase 4: Prototype the CLI-owned ACP session

### Protocol client boundary

Add `@agentclientprotocol/sdk` and `@agentclientprotocol/codex-acp` as pinned runtime dependencies. Encapsulate them behind a small internal interface so CLI tests use a fake agent client without starting Codex.

The production client should:

1. Spawn the installed `codex-acp` entry point as a child process with piped stdio.
2. Complete ACP initialization and inspect advertised capabilities before calling optional methods.
3. Reuse the user's existing Codex authentication; present a clear error or supported login flow when authentication is required.
4. Create a session with the repository root as `cwd`, or load/resume a known session.
5. Send one skill invocation through `session/prompt`.
6. Stream agent text, tool progress, and errors to the terminal without mixing protocol data into normal output.
7. Handle permission requests interactively with deny as the safe default.
8. Handle elicitation/user-input requests or fail with a clear explanation when a request type is not yet supported.
9. Forward cancellation on `SIGINT`, wait for turn termination, and cleanly stop the adapter child.
10. Return success only for a normally completed turn. Do not advance persisted stage state after cancellation, protocol failure, or agent failure.

Do not begin with a long-lived daemon. A fresh adapter process can load the persisted Codex session for each explicit command; this keeps lifecycle and upgrades simpler while testing the workflow.

### Persisted state

After the first successful session creation, write a versioned file such as `.tasks/<task-id>/.agent.json`:

```json
{
  "version": 1,
  "agent": "codex-acp",
  "sessionId": "...",
  "cwd": "/absolute/repository/root",
  "taskId": "06mf7-agent-integration",
  "lastCompletedStage": "research"
}
```

Write state atomically and validate it before use. Keep credentials, prompts, and conversation content out of this file. Moving the task into `000-archive` should move the association naturally with the directory.

### Thread discovery and recovery

Implement discovery in this order:

1. Use a valid session ID from `.agent.json`.
2. Otherwise call `session/list` filtered by repository `cwd` and look for the exact task ID in the session title/preview. The first prompt format from Phase 2 intentionally puts it first.
3. If metadata is insufficient, allow `session/load` history replay for plausible candidates and inspect the first user message for the exact task ID.
4. If there are zero or multiple matches, show an interactive session picker or offer to create a new session. Never choose "most recent" silently.
5. Persist the confirmed association for future commands.

Before adopting a session not created by this CLI, explain that the CLI will resume it outside Zed and require confirmation. Do not operate on the same thread concurrently with an active Zed turn.

### ACP tests

- Unit-test JSON-RPC/session orchestration through a fake transport.
- Test new session, resume, list/discovery, replay-based first-message matching, ambiguity, capability absence, authentication failure, permission allow/deny, cancellation, and child-process exit.
- Test that stage state advances only after a successful prompt response.
- Add one opt-in integration test against the real adapter that creates a temporary repository and performs a harmless read-only turn. Keep it out of the default test suite if it requires authentication or network access.

## Phase 5: Wire agent commands into the CLI

Extend `runCli` and `CliServices` without coupling protocol processes directly to command parsing:

- Add `task agent start [target]`.
- Add `task agent next [target]`.
- Add `task agent status [target]`.
- Add an optional explicit stage override to `start`/`next` for recovery.
- Reuse the existing active-task picker and target resolution rules.
- Reserve `agent` as a command only when it is the first argument; retain existing standard task naming behavior otherwise.

Command behavior:

- `start` refuses to overwrite an existing valid association unless the user explicitly chooses a new session.
- `next` discovers/resumes the association, runs the safety checkpoint, sends exactly one next-stage prompt, and records completion only after success.
- `status` performs no mutation and does not spawn Codex unless session discovery explicitly requires it and the user confirms.
- All commands return the established exit codes: `0` success/cancel/no-op, `1` operational or agent failure, `2` invalid usage.

Add end-to-end CLI tests with fake services for parsing, target selection, confirmations, output, cancellation, and exit codes.

## Phase 6: Documentation and manual validation

Update the README with:

- personal skill installation and removal;
- the five skill names and stage boundaries;
- printed-prompt mode versus CLI-owned agent mode;
- `task agent start`, `next`, and `status` examples;
- authentication, permission, cancellation, and state-file behavior;
- how Zed thread import works and the fact that it does not live-update an already-open Zed thread;
- the warning against concurrent use of one session from Zed and the CLI;
- recovery steps for missing or stale `.agent.json`.

Run:

```sh
pnpm typecheck
pnpm test
```

Then manually validate:

1. Install the personal skills and invoke each from Codex CLI.
2. Update/reinstall the Zed Codex agent and confirm the skills appear in a new External Agent thread.
3. Create each task kind and verify the printed first-stage command.
4. Start a standard task through `task agent start`, answer research questions in the file, and advance through plan, implementation, and commit.
5. Run simple and bug tasks and confirm they commit within their combined workflows.
6. Stop a turn, deny a permission, and interrupt with `Ctrl-C`; verify stage state is unchanged.
7. Delete the state file and recover the session from the task ID in its first message.
8. Import the CLI-created Codex thread into Zed and document the observed behavior.

## Deferred work

- Injecting into the exact active Zed thread through a custom ACP adapter/control socket.
- A shared Codex app-server daemon between Zed and the task CLI.
- Automatic stage advancement after an agent turn.
- Background operation, notifications, or unattended permission approval.
- Publishing the skills as a general Codex plugin rather than personal symlinks.

These should remain out of scope until the CLI-owned-thread experiment establishes whether deeper Zed integration is necessary.

## Completion criteria

- The five personal skills install safely and are usable from Codex CLI and the current Zed Codex adapter.
- New and reprinted task prompts use the appropriate short skill invocation.
- Standard, simple, and bug workflows enforce their chosen stage and commit boundaries.
- Agent work starts and advances only through explicit commands.
- The CLI can create, persist, resume, discover, and safely advance a Codex ACP session.
- A missing state file can be recovered from an exact task ID in session metadata or first-message replay, with ambiguity handled interactively.
- Failures, cancellation, and denied permissions never advance workflow state.
- The existing CLI tests remain green, new behavior has focused automated coverage, and type checking passes.
