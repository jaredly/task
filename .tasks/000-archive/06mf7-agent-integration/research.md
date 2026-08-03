# Agent workflow integration

## Summary

Both ideas are feasible, but they solve different amounts of the problem:

1. Codex skills are the best immediate replacement for the repeated prompt text in `task.ts`. They are a supported Codex customization surface, and the current Codex ACP adapter advertises configured Codex skills to ACP clients such as Zed.
2. A normal standalone CLI cannot inject a prompt into the already-open Codex thread in Zed. Zed owns a private stdio connection to the ACP adapter process, and that adapter owns a private Codex app-server child process. ACP defines how a client talks to an agent, not how a second client joins another client's live connection.

The recommended sequence is:

- Add four focused Codex skills first.
- Change `task.ts` to print one short skill invocation instead of the whole workflow transcript.
- Optionally add `task next` to infer and print the next invocation from the files present in the task directory.
- Only build direct agent invocation after deciding whether it is acceptable for the CLI to own the Codex thread. If the prompt must appear in the active Zed thread, a custom ACP bridge with a side control channel is required with today's interfaces.

## Current behavior

`task.ts` currently has three prompt templates:

- Standard tasks print four user turns: research, plan, implementation, and commit.
- Simple tasks print review/questions followed by implementation.
- Bug tasks ask for a reproduction test and then a fix in one turn.

The CLI has no concept of a current agent thread or workflow stage. The only persistent stage indicators are the task directory and the conventional files `task.md`, `bug.md`, `research.md`, `plan.md`, and `implementation-log.md`.

## Idea 1: Codex skills

### Supported shape

A Codex skill is a directory containing `SKILL.md` with `name` and `description` frontmatter. Repository skills are discovered under `.agents/skills` from the working directory through the repository root; personal skills can live in `~/.agents/skills`. Codex can invoke them implicitly, or the user can explicitly mention one with `$skill-name`.

The current `@agentclientprotocol/codex-acp` adapter calls Codex app-server's `skills/list` method and publishes each configured skill as an ACP available command named `$<skill-name>`. This means a current Zed/Codex External Agent thread should offer the skills in its command menu. This is Codex-native skill discovery forwarded by the adapter, not Zed Skills; Zed's own skills do not apply to External Agent threads.

There are two naming caveats:

- `/plan` is already an adapter command that toggles Codex plan mode. A workflow skill named `plan` would be a distinct `$plan`/`/$plan` entry but would be easy to confuse with the built-in command.
- Codex custom prompt files can create exact `/prompts:name` commands, but custom prompts are deprecated in favor of skills and are local-only. They are not a good foundation for new work.

Use names that describe this tool's workflow and avoid built-in commands:

| Skill | Explicit invocation | Responsibility |
| --- | --- | --- |
| `task-research` | `$task-research <task.md>` | Read the brief and relevant repository code, write adjacent `research.md`, include open questions, and stop without implementing. |
| `task-plan` | `$task-plan <task.md or task directory>` | Read the brief and `research.md`, including inline answers, then write adjacent `plan.md` in logical phases. |
| `task-implement` | `$task-implement <task.md or task directory>` | Implement the plan phase by phase, verify the work, and maintain `implementation-log.md`. |
| `task-bugfix` | `$task-bugfix <bug.md>` | Reproduce the bug with a failing test, investigate, fix when sufficiently understood, verify, and maintain `implementation-log.md`. |

Each skill should have one stage boundary. In particular, `task-research` should not silently continue into planning, and `task-plan` should not implement. That preserves the current opportunity to answer questions between stages.

The skill instructions should specify:

- how to resolve a supplied task directory versus a Markdown path;
- where output files go;
- whether existing output files are updated or treated as a conflict;
- when to stop for missing information;
- what verification is expected;
- whether unrelated working-tree changes must be left alone;
- the exact completion condition for the stage.

### Where the skills should live

Checking the skills into this repository at `.agents/skills` only makes them discoverable while Codex is launched in this repository. The `task` CLI is intended to be used in other repositories, so that alone is insufficient.

Reasonable distribution choices are:

1. Keep canonical skill sources in this repository and provide an install command that symlinks or copies them into `~/.agents/skills`. This is simplest for a personal CLI.
2. Package the skills as a small Codex plugin if the CLI is intended for general installation and upgrades. This is more machinery, but it gives the workflow an explicit distributable unit.
3. Add a `task init` command that installs `.agents/skills` into each target repository. This makes the workflow repository-scoped and shareable but duplicates files across repositories.

For the current personal-tool shape, option 1 is the smallest useful choice. The installer should be explicit rather than modifying the user's home directory during package installation.

### CLI simplification enabled by skills

Task creation can print only the first command:

```text
$task-research .tasks/06mf7-agent-integration/task.md
```

A separate `task next <task>` command could infer a likely next stage from file presence:

| Files present | Suggested next action |
| --- | --- |
| `task.md` only | `task-research` |
| `task.md` + `research.md` | `task-plan` |
| `plan.md`, no implementation log | `task-implement` |
| `bug.md`, no implementation log | `task-bugfix` |
| `implementation-log.md` | done or commit/review, depending on the chosen workflow |

This inference is only a convenience. File presence does not prove that open questions were answered or that a stage completed successfully. The command should show what it inferred and allow an explicit stage override.

## Idea 2: advancing an agent thread

### What ACP provides

ACP v1 uses JSON-RPC. In the normal stdio transport, the client launches the agent subprocess and exclusively communicates through that process's stdin/stdout. The client initializes the connection, creates or loads a session, and sends turns with `session/prompt`. Optional `session/list`, `session/load`, and `session/resume` capabilities support discovery and continuation.

Zed is the ACP client in an External Agent thread. It launches `codex-acp`, and the current adapter in turn launches `codex app-server` as its own stdio child. The adapter translates Zed's ACP session calls into Codex app-server thread and turn calls.

There is no documented Zed CLI command, URL scheme, extension API, or ACP method for an unrelated process to append a user turn to the active Agent Panel thread. The `zed` CLI can open files and workspaces but exposes no agent-prompt operation.

### Integration options

#### A. CLI-owned Codex session

The task CLI can become an ACP client, spawn `@agentclientprotocol/codex-acp`, create a session, persist its session ID in the task directory, and later load/resume it to send the next stage. Alternatively, because this feature is Codex-specific, it can speak directly to `codex app-server` using `thread/start`/`thread/resume` and `turn/start`.

Advantages:

- Uses supported protocols and current libraries.
- Can implement `task start` and `task next` without modifying Zed or the adapter.
- The Codex adapter already supports listing and loading persisted sessions, so Zed can import a CLI-created thread later when the working directory is recorded.

Limitations:

- It does not inject into or live-update the already-open Zed thread.
- The CLI must handle streamed events, approvals, cancellations, authentication failures, and user-input requests rather than merely fire-and-forget a string.
- Running the same persisted thread concurrently from the CLI and Zed should be prohibited unless Codex documents that as safe.
- Importing or reloading a thread in Zed is a separate UI step; it is not a live shared session.

This is the best direct-automation option if "use the same Zed thread" is not a hard requirement.

#### B. Custom ACP bridge with a control socket

For exact injection into the active Zed thread, Zed must launch an agent process that also exposes a second local control channel. The practical design is a small fork or wrapper around `@agentclientprotocol/codex-acp`:

- ACP stdio remains connected to Zed.
- A Unix-domain socket accepts authenticated local `prompt`, `status`, and possibly `cancel` requests from `task`.
- The bridge maps a project/task identifier to the correct active ACP session.
- A request from `task next` is submitted through the same adapter session, so updates and approvals continue to flow through Zed.

This is feasible but materially more complex. It must address multiple Zed windows, multiple threads in one project, stale socket discovery, session selection, active-turn steering versus a new turn, permissions, socket ownership/mode, adapter upgrades, and crash recovery. It also changes the installed agent from the registry-managed Codex adapter to a custom agent command or maintained fork.

This should only be built if active-Zed-thread injection is the defining requirement.

#### C. Shared Codex app-server daemon

Codex app-server supports programmatic thread resume and turn creation, and current Codex also has remote-control/daemon functionality. In principle, both the Zed adapter and `task` could connect to one shared app-server and subscribe to the same thread.

The current Codex ACP adapter does not expose configuration for connecting to an existing app-server; its source launches a private `codex app-server` child. Therefore this is not an off-the-shelf solution today. It becomes attractive if the adapter gains shared-daemon support, but Zed would still need to receive events for turns initiated by the other client and define ownership of approvals.

#### D. Zed UI automation

Driving Zed with macOS accessibility/keyboard automation could focus the Agent Panel, paste text, and submit it. It would be brittle around focus, multiple windows, keymaps, and prompt drafts, and it would have poor failure reporting. It is not a reasonable implementation foundation.

### Recommended staged design

1. Implement and manually validate the four skills in Codex CLI and a current Zed Codex External Agent thread.
2. Replace the long templates in `task.ts` with short skill invocations. Preserve plain printed output as the universal fallback.
3. Add `task next [task] [--stage research|plan|implement|bugfix]` if file-based stage inference is still useful after trying the skills.
4. If automation is desired, prototype a CLI-owned app-server session and store minimal versioned state such as task path, Codex thread ID, and last requested stage. Do not describe it as controlling Zed.
5. Build the custom ACP bridge only after validating that importing or switching to a CLI-owned thread is inadequate.

## Compatibility observations

- The machine inspected has Zed `1.13.2` and Codex CLI `0.144.5`.
- Zed's local external-agent cache still contains the older `codex-acp` `0.16.0` binary, while its current registry metadata advertises `@agentclientprotocol/codex-acp` `1.1.9`.
- The old `zed-industries/codex-acp` repository was archived in July 2026 and directs new installs to `agentclientprotocol/codex-acp`, which is based on Codex app-server.
- Skill advertisement is verified in the current `agentclientprotocol/codex-acp` source. It should be tested after updating/reinstalling the Zed Codex agent because the cached older adapter may not expose configured skills the same way.

## Open questions

1. Must `task next` inject into the exact active Codex thread displayed in Zed, or is a CLI-owned Codex thread that can later be imported into Zed acceptable?
    - we can try out a clie-owned thread
2. Should these workflow skills be personal across every repository, checked into each target repository, or distributed as an installable plugin?
    - personal across every repo
3. Is the desired invocation spelling important? Skills naturally use `$task-research`; exact `/research` commands would either rely on deprecated custom prompts, Zed-native skills that do not apply to External Agents, or adapter-specific command behavior.
    - we can conform to conventions
4. Should `task-plan` accept only a task path, or should it infer the active task entirely from prior thread context when invoked without arguments?
    - if invoked without a task path, it should infer the current task from the current thread
5. When `research.md` contains unanswered questions, should `task next` refuse to suggest/run planning, warn and continue, or leave that judgment entirely to the skill?
    - it should prompt the user to see if they meant to leave them unanswered
6. Should `task-implement` include committing, or should review/commit remain a separate explicit stage? The current standard template asks for a commit after implementation, while simple and bug templates do not.
    - for the standard template it should be separate. for simple & bug, it should be rolled in
7. Should automation ever start work immediately after task creation, or only advance on an explicit `task next` command?
    - only advance on explicit user action
8. How should a task be associated with a thread when several Codex threads share the same repository: persisted thread ID, task-path metadata in the thread, an interactive picker, or "most recently active"?
    - if it's possible to extract the task ID from the 'first user message in the thread', that would be great
9. Is updating the installed Zed Codex adapter to the current registry version acceptable before testing the skill experience?
    - sure

## Sources

- [Codex skills documentation](https://learn.chatgpt.com/docs/build-skills)
- [Codex app-server documentation](https://learn.chatgpt.com/docs/app-server)
- [Zed External Agents documentation](https://zed.dev/docs/ai/external-agents)
- [Zed CLI reference](https://zed.dev/docs/reference/cli)
- [ACP overview](https://agentclientprotocol.com/protocol/v1/overview)
- [ACP session setup](https://agentclientprotocol.com/protocol/v1/session-setup)
- [ACP session listing](https://agentclientprotocol.com/protocol/v1/session-list)
- [ACP prompt turns](https://agentclientprotocol.com/protocol/v1/prompt-turn)
- [ACP slash commands](https://agentclientprotocol.com/protocol/v1/slash-commands)
- [ACP transports](https://agentclientprotocol.com/protocol/v1/transports)
- [Current Codex ACP adapter](https://github.com/agentclientprotocol/codex-acp)
- [Archived Zed Codex ACP adapter and migration notice](https://github.com/zed-industries/codex-acp)
