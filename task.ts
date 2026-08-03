#!/usr/bin/env node
import { readFileSync, renameSync } from "node:fs";

import { checkbox, confirm, select } from "@inquirer/prompts";

import { runCli, type Choice } from "./cli.ts";
import { editFile } from "./editFile.ts";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

const chooseOne = async (message: string, choices: Choice[]) =>
  select({ message, choices });

const chooseMany = async (message: string, choices: Choice[]) =>
  checkbox({ message, choices });

const exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  now: new Date(),
  version: packageJson.version,
  editFile,
  rename: renameSync,
  chooseOne,
  chooseMany,
  confirm: (message) => confirm({ message, default: false }),
  out: console.log,
  error: console.error,
});

process.exitCode = exitCode;
