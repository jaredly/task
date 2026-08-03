# task

A small Node.js CLI for organizing coding tasks in a repository and generating prompts for an AI coding agent.

Each task lives in the nearest `.tasks` directory and receives a compact, sortable time prefix. The CLI opens a Markdown brief in your editor, then prints a prompt that references the brief and describes the expected workflow.

## Requirements

- Node.js 24.12 or newer
- pnpm 11.1.3 for installation and development
- A Unix-like environment (macOS and Linux are the supported targets)
- A repository or parent directory containing a `.tasks` directory

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

Create a `.tasks` directory in each repository where tasks should be managed:

```sh
mkdir .tasks
```

The CLI can be run from any descendant directory. It walks up the directory tree to find the nearest `.tasks` directory.

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
  task -p [target]        Print a task prompt, selecting a task if omitted
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

The generated prompt guides the agent through research, planning, phased implementation, and a final commit.

### Create a simple task

```sh
task simple update dependencies
```

Simple tasks use a shorter workflow: review the brief, ask necessary questions, implement the change, and record progress in `implementation-log.md`.

### Create a bug task

```sh
task bug login redirect
```

Bug tasks create `bug.md`. Their prompt asks the agent to begin with a failing reproduction test, proceed with a fix when possible, and keep an implementation log.

`simple` and `bug` are reserved when used as the first argument. The rest of the name is joined with dashes. Characters outside ASCII letters, numbers, `_`, and `-` are converted to dashes; consecutive dashes are collapsed.

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
│   └── implementation-log.md
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
