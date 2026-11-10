#!/usr/bin/env bash
# Extracts WorkflowIntegration.node from DaVinci Resolve's Windows installer, so the plugin can be
# built for Windows without a Windows machine.
#
# Usage: scripts/extract-windows-node.sh DaVinci_Resolve_Studio_<version>_Windows[_ARM64].zip...
# Writes native/win32-x64/WorkflowIntegration.node, or native/win32-arm64/ for the _ARM64 zip.
# Needs 7zz (brew install sevenzip), python3 and about 10 GB of free disk space per zip.
#
# The zip holds "Install Resolve <version>.dat", a 7z archive with ResolveInstaller.msi and its
# cabinets (ResExtNN.cab). The cabinets store files under keys, not names; the MSI's tables map the
# SamplePlugin's WorkflowIntegration.node to its key and cabinet.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ $# -eq 0 ]]; then
	echo "Usage: $0 DaVinci_Resolve_Studio_<version>_Windows[_ARM64].zip..." >&2
	exit 1
fi
command -v 7zz > /dev/null || { echo "7zz not found, install it with: brew install sevenzip" >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# pymsi reads MSI tables in pure Python, no msitools needed
python3 -m venv "$work/venv"
"$work/venv/bin/pip" install --quiet --disable-pip-version-check "python-msi==0.0.0rc0"

for zip in "$@"; do
	case "$(basename "$zip")" in
		*_ARM64.zip) arch=arm64 ;;
		*) arch=x64 ;;
	esac
	dir="$work/$arch"
	mkdir -p "$dir"

	dat=$(unzip -Z1 "$zip" | grep '\.dat$')
	echo "Unpacking $(basename "$zip") ..."
	unzip -q -o "$zip" "$dat" -d "$dir"
	7zz e -y -bso0 "$dir/$dat" ResolveInstaller.msi -o"$dir"

	read -r key cab version < <("$work/venv/bin/python" -I - "$dir/ResolveInstaller.msi" << 'EOF'
import pathlib
import sys

import pymsi

package = pymsi.Package(pathlib.Path(sys.argv[1]))
rows = lambda table: list(package.get(table).rows)
components = {r["Component"]: r for r in rows("Component")}
directories = {r["Directory"]: r for r in rows("Directory")}
# "short|long" names, optionally "target:source"
long_name = lambda value: value.split(":")[-1].split("|")[-1]

[node] = [
	f
	for f in rows("File")
	if long_name(f["FileName"]) == "WorkflowIntegration.node"
	and long_name(directories[components[f["Component_"]]["Directory_"]]["DefaultDir"]) == "SamplePlugin"
]
# A file is in the first cabinet whose LastSequence reaches its Sequence
media = sorted((m for m in rows("Media") if m["LastSequence"]), key=lambda m: m["LastSequence"])
cab = next(m["Cabinet"] for m in media if m["LastSequence"] >= node["Sequence"])
version = next(r["Value"] for r in rows("Property") if r["Property"] == "ProductVersion")
print(node["File"], cab, version)
EOF
	)

	7zz e -y -bso0 "$dir/$dat" "$cab" -o"$dir"
	7zz e -y -bso0 "$dir/$cab" "$key" -o"$dir"

	out="native/win32-$arch/WorkflowIntegration.node"
	mkdir -p "$(dirname "$out")"
	mv "$dir/$key" "$out"
	rm -rf "$dir"
	echo "$out from Resolve $version, sha256 $(shasum -a 256 "$out" | cut -c1-16)…"
done
