import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { editFile, parseEditorCommand } from "../editFile.ts";

test("parseEditorCommand supports quoted flags and rejects shell operators", () => {
  assert.deepEqual(parseEditorCommand(`editor --wait "two words"`), [
    "editor",
    "--wait",
    "two words",
  ]);
  assert.throws(() => parseEditorCommand("editor; touch elsewhere"), /Editor must/);
  assert.throws(() => parseEditorCommand(""), /Editor must/);
});

test("editFile passes flags and filename as literal arguments", async () => {
  const root = mkdtempSync(join(tmpdir(), "tasks editor-"));
  const script = join(root, "fake editor.mjs");
  const capture = join(root, "captured args.json");
  const filename = join(root, "brief with spaces.md");
  writeFileSync(
    script,
    `import { writeFileSync } from "node:fs";\nwriteFileSync(process.env.CAPTURE_PATH, JSON.stringify(process.argv.slice(2)));\n`,
  );
  writeFileSync(filename, "");

  const previousVisual = process.env.VISUAL;
  const previousCapture = process.env.CAPTURE_PATH;
  process.env.VISUAL = `${process.execPath} "${script}" --wait`;
  process.env.CAPTURE_PATH = capture;
  try {
    await editFile(filename);
  } finally {
    if (previousVisual === undefined) delete process.env.VISUAL;
    else process.env.VISUAL = previousVisual;
    if (previousCapture === undefined) delete process.env.CAPTURE_PATH;
    else process.env.CAPTURE_PATH = previousCapture;
  }

  assert.deepEqual(JSON.parse(readFileSync(capture, "utf8")), ["--wait", filename]);
});

test("editFile rejects a nonzero editor exit", async () => {
  const previousVisual = process.env.VISUAL;
  process.env.VISUAL = `${process.execPath} -e "process.exit(7)"`;
  try {
    await assert.rejects(editFile("unused.md"), /status 7/);
  } finally {
    if (previousVisual === undefined) delete process.env.VISUAL;
    else process.env.VISUAL = previousVisual;
  }
});
