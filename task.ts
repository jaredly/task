#!/usr/bin/env node
import { readFileSync, renameSync } from "node:fs";

import { checkbox, confirm, select } from "@inquirer/prompts";

import { CodexAcpAgent } from "./agent.ts";
import { runCli, type Choice } from "./cli.ts";
import { editFile } from "./editFile.ts";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

const chooseOne = async (message: string, choices: Choice[]) =>
  select({ message, choices });

const chooseMany = async (message: string, choices: Choice[]) =>
  checkbox({ message, choices });

const agent = new CodexAcpAgent({
  write: (text) => process.stdout.write(text),
  info: console.log,
  error: console.error,
  choosePermission: async (message, choices) => {
    const ordered = [...choices].sort((left, right) => {
      const leftReject = left.description?.startsWith("reject") ? 0 : 1;
      const rightReject = right.description?.startsWith("reject") ? 0 : 1;
      return leftReject - rightReject;
    });
    return await select({ message, choices: ordered });
  },
});

const exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  now: new Date(),
  version: packageJson.version,
  editFile,
  rename: renameSync,
  chooseOne,
  chooseMany,
  confirm: (message) => confirm({ message, default: false }),
  agent,
  out: console.log,
  error: console.error,
});

process.exitCode = exitCode;
