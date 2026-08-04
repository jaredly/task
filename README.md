# task

A small Node.js CLI for organizing coding tasks in a repository and generating prompts for an AI coding agent.

Each task lives in the nearest `.tasks` directory and receives a compact, sortable time prefix. The CLI opens a Markdown brief in your editor, then prints a compact Codex skill invocation. It can also own and advance a Codex ACP session explicitly.

## Requirements

- Node.js 24.12 or newer
- pnpm 11.1.3 for installation and development
- A Unix-like environment (macOS and Linux are the supported targets)

## Installation

Clone the repository, install its dependencies, and link the executable:

```sh
git clone https://github.com/jaredly/task.git
cd task
pnpm install
pnpm link --global
```

Alternatively, symlink the executable into a directory already on your `PATH` after installing dependencies:

```sh
ln -s /path/to/task/task.ts ~/.local/bin/task
```

Initialize each repository where tasks should be managed:

```sh
task init
```

The command looks for `.tasks` in the current directory and its ancestors. If none exists, it asks for default-no `(y/N)` confirmation before creating `.tasks` in the current directory. Once initialized, the CLI can be run from any descendant directory and uses the nearest `.tasks` directory.

Install the eleven bundled skills for all repositories with:

```sh
task skills install
task skills status
```

The installer creates owned symlinks in `~/.agents/skills`; it never replaces an existing path. `task skills uninstall` removes only symlinks pointing to this installation. Restart Codex or its Zed External Agent after changing installed skills. Symlink installation is supported on macOS and Linux; Windows may require Developer Mode or elevated symlink privileges.

### Editor configuration

Task briefs are opened using `$VISUAL`, then `$EDITOR`, falling back to `vi`. Editor flags and quoted paths are supported without invoking a shell:

```sh
export VISUAL='code --wait'
export EDITOR='zed --wait'
```

If the editor fails, the new task is retained and its path is printed so the brief can be recovered.

### Windows

Windows is not a primary support target, but the Node entry point can be linked from PowerShell after installing Node and pnpm:

```powershell
pnpm install
pnpm link --global
$env:VISUAL = "code --wait"
```

## Usage

Run `task -h` for the command summary:

```text
Usage:
  task <name...>          Create a standard task
  task simple <name...>   Create a simple task
  task bug <name...>      Create a bug task
  task init               Initialize .tasks in the current directory
  task -p [--no-skill] [target]
                         Print a task prompt, selecting a task if omitted
  task skills <action>    Install, inspect, or uninstall personal skills
  task agent <action>     Start, advance, or inspect a Codex ACP workflow
  task -a                 Select completed tasks to archive
  task -h, --help         Show this help
  task --version          Show the version
```

### Create a standard task

```sh
task add search filters
```

This creates a directory similar to:

```text
.tasks/06m8p-add-search-filters/
└── task.md
```

The generated prompt begins with `$task-research`. Standard tasks then advance through `$task-plan`, `$task-implement`, and `$task-commit`; each stage stops at its stated boundary.

### Create a simple task

```sh
task simple update dependencies
```

Simple tasks invoke `$task-simple`, which skips research and planning, reviews the brief, asks only blocking questions, implements and verifies the change, records progress in `implementation-log.md`, and makes a scoped commit.

### Create a bug task

```sh
task bug login redirect
```

Bug tasks create `bug.md` and invoke `$task-bugfix`. The skill requires a failing reproduction before the fix, verification, an implementation log, and a scoped commit.

### Jira-backed tasks

When the task already lives in Jira, use the `-jira` skills instead of creating a local task. They are invoked directly with an issue key or Jira URL rather than through `task add`, and the ticket replaces the `.tasks` directory: no `task.md`, `research.md`, `plan.md`, or `implementation-log.md` is written.

| Skill | Reads | Writes |
| --- | --- | --- |
| `$task-research-jira` | ticket description and comments | a `## Research note` comment ending in open questions |
| `$task-plan-jira` | the ticket plus the research comment and its answers | an `## Implementation plan` comment |
| `$task-implement-jira` | the ticket plus the research and plan comments | commit on a ticket branch, draft PR, `## Implementation log` comment |
| `$task-simple-jira` | the ticket description | commit on a ticket branch, draft PR, `## Implementation log` comment |
| `$task-bugfix-jira` | the ticket as a bug report | regression test, commit on a ticket branch, draft PR, `## Implementation log` comment |

Each stage posts new comments and never edits the description or an existing comment. There is no `$task-commit-jira`: the three implementing skills end with a scoped commit on a ticket-keyed branch and a draft pull request whose URL is included in the implementation-log comment. Jira access comes from whatever Jira tooling the agent has configured, such as an Atlassian MCP server.

`init`, `simple`, and `bug` are reserved when used as the first argument. The rest of the name is joined with dashes. Characters outside ASCII letters, numbers, `_`, and `-` are converted to dashes; consecutive dashes are collapsed.

When a task is created from a subdirectory, its path relative to the repository root is inserted into the new brief as context.

### Print a task prompt

Run `task -p` without a target to select from active tasks in the nearest `.tasks` directory, newest first:

```sh
task -p
```

An explicit target can be a bare task name, directory path, or Markdown brief:

```sh
task -p 06m8p-add-search-filters
task -p .tasks/06m8p-add-search-filters
task -p .tasks/000-archive/06m8q-bug-login-redirect/bug.md
```

Explicit targets do not need to exist. Bare names resolve under the nearest `.tasks` directory when one is available; paths resolve relative to the current directory. The workflow is inferred from the task directory name, and an explicit Markdown filename is preserved.

The printed prompt starts with the task ID and passes the brief as an encoded absolute `file:` URL. `task -p` never starts an agent and remains the fallback for pasting a command into Codex CLI or Zed. In Zed's command menu, the adapter may display a skill as `/$task-research`; the underlying skill name is unchanged.

Use `--no-skill` to print the original self-contained workflow transcript instead. The option works with an explicit target in either order or with the interactive picker:

```sh
task -p --no-skill 06m8p-add-search-filters
task -p --no-skill
```

This affects only printed prompts. Task creation and `task agent` continue to use the bundled skills.

## Codex ACP workflow

Agent mode starts or advances exactly one stage per explicit command:

```sh
task agent start 06m8p-add-search-filters
task agent status 06m8p-add-search-filters
task agent next 06m8p-add-search-filters
```

Omit the target to use the active-task picker. `start` creates a Codex session; `next` resumes it and runs one stage; `status` reads local state without starting Codex. Standard stages are research, plan, implement, and commit. Simple and bug tasks each use one combined implementation-and-commit stage.

After a successful turn, the CLI atomically writes `.agent.json` beside the brief with the Codex session ID and last completed stage. Failed and cancelled turns do not advance it. Before planning when `research.md` has an `Open questions` heading, the CLI requires confirmation and defaults to stopping.

If `.agent.json` is missing, `next` infers a conservative stage from artifacts, looks for the exact task ID in Codex session metadata or the first user message, and asks before adopting the session. A partial `implementation-log.md` never implies that implementation is complete. Use `--stage <stage>` to recover from stale stage data; conflicting overrides require confirmation. Use `task agent start <target> --new-session` to replace an association, also with confirmation.

Agent mode uses the installed `codex-acp` package and the user's existing Codex authentication. Permission requests are interactive with rejection choices ordered first. `Ctrl-C` requests cancellation. Do not operate on the same Codex thread concurrently from Zed and this CLI.

CLI-owned sessions can later be loaded by a compatible Zed Codex External Agent, but this does not inject into or live-update an already-open Zed thread. Active-thread bridging remains outside this implementation.

## Archiving

Any direct child task containing `implementation-log.md` is eligible for archive review. Start the interactive flow with:

```sh
task -a
```

The checklist is sorted by the log's modification time, oldest first, and shows how long ago each log was updated. Tasks start unselected. After choosing tasks, the CLI prints the selection and requires confirmation before moving anything to `.tasks/000-archive/`.

Cancellation, an empty selection, or rejecting confirmation makes no filesystem changes. The old `.ready-for-cleanup.txt`, `-a -f`, and `-a -c` workflow is no longer supported.

## Task directory layout

```text
.tasks/
├── 000-archive/
├── 06m8p-add-search-filters/
│   ├── task.md
│   ├── research.md
│   ├── plan.md
│   ├── implementation-log.md
│   └── .agent.json
└── 06m8q-bug-login-redirect/
    ├── bug.md
    └── implementation-log.md
```

The prefix is the number of minutes since January 1, 2026, encoded in base 36 and padded to a fixed width. This keeps task directories compact and chronologically sortable. Creating the same normalized task name twice in one minute returns a collision error.

## Exit behavior

- `0`: the command completed, was cancelled, or had nothing to do.
- `1`: an operational failure occurred, such as a missing `.tasks` directory, editor failure, or filesystem conflict.
- `2`: command usage was invalid.

Errors are printed without stack traces. Archive operations preflight all selected paths and attempt to roll back completed moves if a later move fails.

## Development

The CLI runs directly from TypeScript using Node.js's built-in type stripping. There is no build step.

```sh
pnpm install
pnpm typecheck
pnpm test
```

The project uses the ISC license. It is distributed through its public GitHub repository and is intentionally marked private in `package.json` to prevent npm publication.
