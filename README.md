# tasks

A small Bun CLI for organizing coding tasks in a repository and generating prompts for an AI coding agent.

Each task is stored in the nearest `.tasks` directory and receives a sortable, time-based prefix. The CLI opens a Markdown brief for editing, then prints a prompt that references the brief and describes the expected workflow.

## Requirements

- [Bun](https://bun.sh/)
- [Zed](https://zed.dev/) available as `zed` on your `PATH`
- A repository or parent directory containing a `.tasks` directory

`pnpm` is used to manage the development dependencies, but it is not required to run the CLI.

## Installation

Clone the project and install its development dependencies:

```sh
pnpm install
```

Run the executable directly:

```sh
/path/to/tasks/task simple update-dependencies
```

For convenient global use, add the project directory to your `PATH` or symlink `task` into a directory already on your `PATH`:

```sh
ln -s /path/to/tasks/task ~/.local/bin/task
```

In each repository where tasks should be managed, create a `.tasks` directory:

```sh
mkdir .tasks
```

The CLI can be run from any descendant directory. It walks up the directory tree to find the nearest `.tasks` directory.

## Usage

### Create a standard task

```sh
task add-search-filters
```

This creates a directory similar to:

```text
.tasks/06m8p-add-search-filters/
└── task.md
```

The generated prompt guides the agent through research, planning, phased implementation, and a final commit.

### Create a simple task

```sh
task simple update-dependencies
```

Simple tasks use a shorter workflow: review the brief, ask any necessary questions, implement the change, and record progress in `implementation-log.md`.

### Create a bug task

```sh
task bug login-redirect
```

Bug tasks create `bug.md`. The generated prompt asks the agent to begin with a failing reproduction test, proceed with a fix when possible, and keep an implementation log.

When a task is created from a subdirectory, the relative path is inserted into the new brief as context.

### Print a task prompt again

Pass either a task directory name or a Markdown brief to `-p`:

```sh
task -p .tasks/06m8p-add-search-filters
task -p .tasks/06m8p-bug-login-redirect/bug.md
```

The task type is inferred from the generated directory name. Providing the Markdown path preserves its filename in the printed prompt.

## Archiving

Tasks containing an `implementation-log.md` are considered ready for archive review.

Start an archive review:

```sh
task -a
```

This writes the candidates to `.tasks/.ready-for-cleanup.txt` and opens the file in `$VISUAL`, `$EDITOR`, or `vi`. Remove any tasks that should remain active and close the editor. The command then prints the moves it would make without changing any task directories.

Apply the reviewed moves:

```sh
task -a -f
```

Archived tasks are moved to `.tasks/000-archive/`. To remove a leftover review file without archiving anything, run:

```sh
task -a -c
```

## Task directory layout

A completed task commonly looks like this:

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

The prefix is the number of minutes since January 1, 2026, encoded in base 36 and padded to a fixed width. This keeps task directories compact and chronologically sortable.

## Development

The CLI is implemented as an executable TypeScript file run directly by Bun. There is currently no build step or automated test suite.

```sh
./task -p example-task
```

The project is private and licensed under ISC as declared in `package.json`.
