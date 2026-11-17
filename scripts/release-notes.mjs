#!/usr/bin/env node
/**
 * Release notes for one version, put together from the packages' CHANGELOG.md files (written by
 * `pnpm changeset version`): a section per product, in the order below.
 *
 *   node scripts/release-notes.mjs 0.6.0 > notes.md
 *
 * A pre-release (0.6.0-rc.1) without a section of its own gets the notes of its version (0.6.0)
 * as far as they exist. Exits with 1 when no package has notes for the version, so a release
 * tagged without running `pnpm changeset version` first doesn't go out without notes.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const PRODUCTS = [
	["Web app", "packages/postpin"],
	["PostPin Desktop", "packages/desktop"],
	["DaVinci Resolve plugin", "packages/plugin-resolve"],
	["Premiere Pro plugin", "packages/plugin-premiere"],
	["Media processing", "packages/worker"],
	["Self-hosting", "deploy"],
];

const HEADINGS = {
	"Major Changes": "Breaking changes",
	"Minor Changes": "New",
	"Patch Changes": "Improvements and fixes",
};

/** The changelog's sections by version: "## 0.5.2" up to the next "## " */
export function changelogSections(markdown) {
	const sections = new Map();
	const parts = markdown.split(/^## (\S+)[ \t]*\n/m);
	for (let i = 1; i < parts.length; i += 2) sections.set(parts[i], parts[i + 1].trim());
	return sections;
}

export function releaseNotes(version, readChangelog) {
	const base = version.replace(/-.*$/, "");
	const notes = [];
	for (const [name, dir] of PRODUCTS) {
		let sections;
		try {
			sections = changelogSections(readChangelog(dir));
		} catch {
			continue;
		}
		const text = sections.get(version) ?? sections.get(base);
		if (!text || text.startsWith("No changes")) continue;
		const body = text.replace(/^### (.+)$/gm, (_, h) => `#### ${HEADINGS[h] ?? h}`);
		notes.push(`## ${name}\n\n${body}`);
	}
	return notes.join("\n\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const version = process.argv[2]?.replace(/^v/, "");
	if (!version) {
		console.error("usage: node scripts/release-notes.mjs <version>");
		process.exit(2);
	}
	const notes = releaseNotes(version, (dir) =>
		readFileSync(join(root, dir, "CHANGELOG.md"), "utf8"),
	);
	if (!notes) {
		console.error(
			`No changelog has notes for ${version}. Run pnpm changeset version before tagging.`,
		);
		process.exit(1);
	}
	process.stdout.write(`${notes}\n`);
}
