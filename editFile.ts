import { spawn } from "child_process";

export function editFile(filename: string): Promise<void> {
  const editor = process.env.VISUAL || process.env.EDITOR || "vi";

  return new Promise((resolve, reject) => {
    const child = spawn(
      `${editor} ${filename}`,
      {
        stdio: "inherit",
        shell: true
      },
    );

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Editor terminated by signal ${signal}`));
      } else {
        resolve();
      }
    });
  });
}
