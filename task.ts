#!/usr/bin/env node
import { execSync, spawn } from "child_process";
import fs, { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { join, dirname, relative, basename } from "path";
import { editFile } from './editFile.ts'
const [_, __, ...name] = process.argv;

const now = new Date();

const minutesSince2026 =
    ((now.getTime() - new Date(2026, 0, 1).getTime()) / 60000) | 0;

const theoreticalMax =
    ((new Date(2100, 0, 1).getTime() - new Date(2026, 0, 1).getTime()) /
        60000) |
    0;

const maxLength = theoreticalMax.toString(36).length;

const fmt = minutesSince2026.toString(36).padStart(maxLength, "0");

const findBase = () => {
    let cwd = process.cwd();
    let path = cwd;
    while (path && path !== "/" && !fs.existsSync(join(path, ".tasks"))) {
        path = dirname(path);
    }
    return { base: path, sub: relative(path, cwd) };
};

const { base, sub } = findBase();

const templates = {
    bug: (fullName: string, taskName = 'bug.md') =>
        `${fullName}: can you look at [@${taskName}](file://${base}/.tasks/${fullName}/${taskName}) and create a failing repro test? If you get stuck, stop and ask for more information, but otherwise you can proceed with a fix. Keep a concise log of what you've done in implementation-log.md.`,
    simple: (fullName: string, taskName = 'task.md') =>
        [`${fullName}: can you look at [@${taskName}](file://${base}/.tasks/${fullName}/${taskName}) and let me know if you have any questions?`,
	'',
	`Go ahead and implement, and keep a concise log of what you've done in implementation-log.md. Be sure to make note of any issues, workarounds, or bugs encountered.`
	].join('\n'),
    task: (fullName: string, taskName = 'task.md') => [
        `${fullName}: can you look at [@${taskName}](file://${base}/.tasks/${fullName}/${taskName}) and write up a research.md, including any open questions?`,
        "",
        `I've answered the open questions inline.`,
        `Can you write up a plan.md detailing what needs to be done? Split it up into logical phases if helpful.`,
        "",
        `Ok, go ahead and implement phase by phase, keeping a concise log of your progress in implementation-log.md. Be sure to call out any issues, workarounds or bugs encountered.`,
"",
"Can you make a commit with a detailed message describing the work done?",
    ].join('\n'),
};

if (name[0] === "-p") {
    const taskName = name[1].endsWith('.md') ? basename(name[1]) : undefined;
    const fullName = name[1].endsWith('.md') ? basename(dirname(name[1])) : basename(name[1]);
    const parts = fullName.split("-");
    if (parts[1] === "bug") {
        console.log(templates.bug(fullName, taskName));
    } else if (parts[1] === "simple") {
        console.log(templates.simple(fullName, taskName));
    } else {
        console.log(templates.task(fullName, taskName));
    }
    process.exit(0);
}

const tasks = join(base,'.tasks')
if (!fs.existsSync(tasks)) {
    console.error("Unable to find a .tasks directory");
    process.exit(1);
}

// archive
if (name[0] === '-a') {
    const fname = join(tasks, '.ready-for-cleanup.txt')
    if (name[1] === '-c') {
        if (existsSync(fname)) {
            console.log('Deleting ' + fname)
            unlinkSync(fname)
        } else {
            console.log(`${fname} not found, nothing to delete.`)
        }
        process.exit(1)
    }
    const ready = fs.readdirSync(tasks).filter(name => name !== '000-archive' && fs.statSync(join(tasks,name)).isDirectory())
        .filter(name => existsSync(join(tasks,name, 'implementation-log.md')))
    writeFileSync(fname, ready.join('\n'))
    console.log(`Opening ${fname} for editing. Delete any names you don't want archived.`)
    await editFile(fname)
    const toCleanup = readFileSync(fname,'utf-8').trim().split('\n').map(name => name.trim()).filter(name => !!name)
    if (!toCleanup.length) {
        console.log(`No tasks provided. Exiting.`)
        process.exit(0)
    }

    const archive = join(tasks, '000-archive')
    if (!fs.existsSync(archive)) {
        fs.mkdirSync(archive)
    }
    const renames = toCleanup.map((name) => {
        const prev = join(tasks,name)
        if (!existsSync(prev)) {
            console.error(`Invalid name provided: ${prev} doesn't exist.`)
            process.exit(1)
        }
        const next =join(archive,name)
        if (existsSync(next)) {
            console.error(`Cannot archive task ${name}: ${next} exists already.`)
            process.exit(2)
        }
        return [prev, next]
    })
    if (name[1] === '-f') {
        renames.forEach(([prev, next]) => {
            renameSync(prev, next)
        })
        unlinkSync(fname)
    } else {
        console.log('Provide -f to perform the moves.')
        renames.forEach(([prev, next]) => {
            console.log(`${prev} -> ${next}`)
        })
    }
    process.exit(0)
}

const fullName = `${fmt}-${name.join("-")}`;
const dir = join(tasks, fullName);
fs.mkdirSync(dir);

if (name[0] === "bug") {
    fs.writeFileSync(join(dir, "bug.md"), sub ? sub + ": " : "");
    execSync(`zed ${dir}/bug.md`);
    console.log(templates.bug(fullName));
} else {
    fs.writeFileSync(join(dir, "task.md"), sub ? sub + ": " : "");
    execSync(`zed ${dir}/task.md`);
    if (name[0] === "simple") {
        console.log(templates.simple(fullName));
    } else {
        console.log(templates.task(fullName));
    }
}
