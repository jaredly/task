---
name: task-create
description: Create a local task brief when the user asks to make a task for work already discussed. Reserve a task directory, write task.md, and stop before research, planning, or implementation.
---

# Task Create

1. Use this skill when the user asks to create or make a task for work already described in the conversation. Derive a concise, descriptive task name and brief from that context. Ask a question only when the requested work is ambiguous enough that a useful task brief cannot be written.
2. From the repository where the work belongs, run `task -n <descriptive name>`. This reserves a timestamped task directory and prints the absolute path for its `task.md` file.
3. Write a concise task description to the returned `task.md` path. Include the requested outcome and material constraints or acceptance criteria from the conversation; do not add speculative implementation details.
4. Report the created task path to the user.
5. Stop after creating the brief. Do not create `research.md`, `plan.md`, or `implementation-log.md`; do not investigate, edit product code, run implementation tests, or commit unless the user explicitly asks to begin a later workflow stage.

Completion requires a reserved task directory containing an accurate `task.md` brief and no work beyond task creation.
