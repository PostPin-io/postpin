#!/usr/bin/env python3
"""Shows which Resolve API calls of the plugin each Resolve version has.

Usage: python3 scripts/resolve-api-compat.py [--all]

Reads the Developer docs that scripts/extract-resolve-api.sh put into .resolve-api/<version>/ and
the calls from scripts/resolve-api-usage.mjs. Prints a Markdown table of the calls some version
lacks (--all: every call), and the Electron version each Resolve runs plugins in.

A version has a call when its docs list the method on that class: DaVinciResolveScript.pyi (21.1 and
later), otherwise README.txt; the README's "Deprecated" and "Unsupported" sections mark a method as
such. Docs list what Blackmagic documents, not what the native object exposes, so a "–" means
"undocumented" and is worth a check on a real install before relying on it.
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".resolve-api"

OK, DEPRECATED, UNSUPPORTED = "ok", "deprecated", "unsupported"
RANK = {OK: 3, DEPRECATED: 2, UNSUPPORTED: 1}
CELL = {OK: "✓", DEPRECATED: "deprecated", UNSUPPORTED: "unsupported", None: "–"}
API_SECTIONS = {"DaVinci Resolve API", "WorkflowIntegration module API"}


def section_mode(title: str):
	if "Deprecated" in title:
		return DEPRECATED
	if "Unsupported" in title:
		return UNSUPPORTED
	return OK if title in API_SECTIONS else None


def parse_readme(path: Path, methods: dict):
	"""README.txt (underlined headers) or README.md (# headers): class lines, then indented methods."""
	lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
	mode, cls = None, None
	for i, line in enumerate(lines):
		next_line = lines[i + 1] if i + 1 < len(lines) else ""
		if re.fullmatch(r"-{3,}", next_line.strip()) and line.strip():
			mode, cls = section_mode(line.strip()), None
		elif m := re.match(r"#+\s+(.*)", line):
			mode, cls = section_mode(m.group(1).strip()), None
		elif mode and re.fullmatch(r"[A-Z]\w+", line.strip()):
			cls = line.strip()
		# "Method(" under a class line, or "Class.Method(" (README.md's deprecated calling conventions)
		elif mode and (m := re.match(r"\s*(?:([A-Z]\w+)\.)?(\w+)\(", line)) and (m.group(1) or cls):
			key = f"{m.group(1) or cls}.{m.group(2)}"
			if RANK.get(methods.get(key), 0) < RANK[mode]:
				methods[key] = mode


def parse_pyi(path: Path, methods: dict):
	cls = None
	for line in path.read_text(encoding="utf-8").splitlines():
		if m := re.match(r"class (\w+)", line):
			cls = m.group(1)
		elif cls and (m := re.match(r"\s+def (\w+)\(", line)):
			methods[f"{cls}.{m.group(1)}"] = OK


def electron_version(changelog: Path):
	"""The newest 'Electron x.y.z' the Workflow Integrations changelog mentions."""
	if not changelog.exists():
		return None
	m = re.search(r"Electron (\d+(?:\.\d+)*)", changelog.read_text(encoding="utf-8", errors="replace"))
	return m.group(1) if m else None


def load_version(directory: Path):
	methods = {}
	scripting = directory / "Scripting"
	workflow = directory / "Workflow Integrations"
	# 21.1 replaced README.txt with README.md; an install over an older one can leave a stale .txt
	readme = scripting / "README.md" if (scripting / "README.md").exists() else scripting / "README.txt"
	for readme in (readme, workflow / "README.txt"):
		if readme.exists():
			parse_readme(readme, methods)
	pyi = scripting / "DaVinciResolveScript.pyi"
	if pyi.exists():
		parse_pyi(pyi, methods)
	return methods, electron_version(workflow / "CHANGELOG.txt")


def version_key(name: str):
	return tuple(int(part) for part in re.findall(r"\d+", name))


def main():
	show_all = "--all" in sys.argv[1:]
	versions = sorted((d for d in CACHE.iterdir() if d.is_dir()), key=lambda d: version_key(d.name)) if CACHE.exists() else []
	if not versions:
		sys.exit(f"No docs in {CACHE.relative_to(ROOT)}/, run scripts/extract-resolve-api.sh first.")

	used = subprocess.run(
		["node", str(ROOT / "scripts/resolve-api-usage.mjs")], check=True, capture_output=True, text=True
	).stdout.split()
	loaded = [(d.name, *load_version(d)) for d in versions]

	header = ["Call", *(name for name, _, _ in loaded)]
	rows = []
	for call in used:
		states = [methods.get(call) for _, methods, _ in loaded]
		if show_all or any(state != OK for state in states):
			rows.append([f"`{call}`", *(CELL[state] for state in states)])
	rows.append(["Electron", *(electron or "?" for _, _, electron in loaded)])

	print("| " + " | ".join(header) + " |")
	print("|" + "---|" * len(header))
	for row in rows:
		print("| " + " | ".join(row) + " |")
	if not show_all:
		print(f"\nThe other {len(used) - len(rows) + 1} of {len(used)} calls are in every version (--all lists them).")


if __name__ == "__main__":
	main()
