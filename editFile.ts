import { spawn } from "node:child_process";

import { parse } from "shell-quote";

export function parseEditorCommand(editor: string): string[] {
  const parsed = parse(editor, {});
  if (parsed.length === 0) {
    throw new Error("Editor must be an executable with optional quoted arguments");
  }

  return parsed.map((part) => {
    if (typeof part !== "string" || part.length === 0) {
      throw new Error(
        "Editor must be an executable with optional quoted arguments",
      );
    }
    return part;
  });
}

export function editFile(filename: string): Promise<void> {
  const editor = process.env.VISUAL || process.env.EDITOR || "vi";
  const [command, ...args] = parseEditorCommand(editor);

  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args, filename], {
      stdio: "inherit",
      shell: false,
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Editor terminated by signal ${signal}`));
      } else if (code !== 0) {
        reject(new Error(`Editor exited with status ${code ?? "unknown"}`));
      } else {
        resolve();
      }
    });
  });
}
