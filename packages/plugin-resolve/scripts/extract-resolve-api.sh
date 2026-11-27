#!/usr/bin/env bash
# Takes the scripting docs out of DaVinci Resolve installers, without installing them, and shows which
# of the plugin's API calls each version has (see scripts/resolve-api-compat.py).
#
# Usage: scripts/extract-resolve-api.sh [--installed] [DaVinci_Resolve_[Studio_]<version>_{Mac,Windows[_ARM64]}.zip...]
#   --installed  also takes the docs of the Resolve installed on this Mac
#
# Writes .resolve-api/<version>/ with Scripting/ (README, CHANGELOG, DaVinciResolveScript.pyi),
# Workflow Integrations/ (README.txt, CHANGELOG.txt) and that version's WorkflowIntegration.node.
# Versions already there are skipped. Needs 7zz (brew install sevenzip), python3, and about 20 GB of
# free disk space while a zip is unpacked.
#
# Mac zip: a .dmg with "Install Resolve <version>.pkg", whose Manifest.pkg payload (an uncompressed
# cpio archive) holds /Library/Application Support/.../Developer. Windows zip: see
# extract-windows-node.sh, the MSI's tables map the Developer files to their cabinets.
set -euo pipefail
cd "$(dirname "$0")/.."

CACHE=.resolve-api
DEVELOPER="Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer"
# Paths relative to Developer/
WANTED=(
	"Scripting/README.txt"
	"Scripting/README.md"
	"Scripting/CHANGELOG.txt"
	"Scripting/CHANGELOG.md"
	"Scripting/DaVinciResolveScript.pyi"
	"Workflow Integrations/README.txt"
	"Workflow Integrations/CHANGELOG.txt"
	"Workflow Integrations/Examples/SamplePlugin/WorkflowIntegration.node"
)

command -v 7zz > /dev/null || { echo "7zz not found, install it with: brew install sevenzip" >&2; exit 1; }
mkdir -p "$CACHE"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Copies the wanted files from a Developer folder to .resolve-api/<version>/
store() {
	local src=$1 version=$2 out="$CACHE/$2" rel
	rm -rf "$out.tmp"
	for rel in "${WANTED[@]}"; do
		if [[ -f "$src/$rel" ]]; then
			mkdir -p "$(dirname "$out.tmp/$rel")"
			cp "$src/$rel" "$out.tmp/$rel"
		fi
	done
	[[ -d "$out.tmp/Scripting" ]] || { echo "No scripting docs found for $version" >&2; rm -rf "$out.tmp"; return 1; }
	mv "$out.tmp" "$out"
	echo "$out"
}

extract_mac() {
	local zip=$1 version=$2 dir="$work/mac" dmg pkg patterns=() rel
	mkdir -p "$dir"
	dmg=$(unzip -Z1 "$zip" | grep '\.dmg$')
	echo "Unpacking $(basename "$zip") ..."
	unzip -q -o "$zip" "$dmg" -d "$dir"
	pkg=$(7zz l -slt "$dir/$dmg" | sed -n 's/^Path = \(.*Install Resolve[^/]*\.pkg\)$/\1/p' | head -1)
	[[ -n "$pkg" ]] || { echo "No installer package in $dmg" >&2; return 1; }
	7zz e -y -bso0 "$dir/$dmg" "$pkg" -o"$dir"
	rm "$dir/$dmg"
	(cd "$dir" && xar -xf "$(basename "$pkg")" Manifest.pkg/Payload)
	rm "$dir/$(basename "$pkg")"
	for rel in "${WANTED[@]}"; do patterns+=("./$DEVELOPER/$rel"); done
	mkdir -p "$dir/root"
	(cd "$dir/root" && cpio -id --quiet "${patterns[@]}" < ../Manifest.pkg/Payload)
	rm -rf "$dir/Manifest.pkg"
	store "$dir/root/$DEVELOPER" "$version"
	rm -rf "$dir"
}

extract_windows() {
	local zip=$1 version=$2 dir="$work/win" dat key cab rel
	mkdir -p "$dir/Developer"
	[[ -x "$work/venv/bin/python" ]] || {
		# pymsi reads MSI tables in pure Python, no msitools needed
		python3 -m venv "$work/venv"
		"$work/venv/bin/pip" install --quiet --disable-pip-version-check "python-msi==0.0.0rc0"
	}
	dat=$(unzip -Z1 "$zip" | grep '\.dat$')
	echo "Unpacking $(basename "$zip") ..."
	unzip -q -o "$zip" "$dat" -d "$dir"
	7zz e -y -bso0 "$dir/$dat" ResolveInstaller.msi -o"$dir"

	# One line per wanted file: <file key> <cabinet> <path relative to Developer/>
	"$work/venv/bin/python" -I - "$dir/ResolveInstaller.msi" "${WANTED[@]}" > "$dir/files.tsv" << 'EOF'
import pathlib
import sys

import pymsi

package = pymsi.Package(pathlib.Path(sys.argv[1]))
wanted = set(sys.argv[2:])
rows = lambda table: list(package.get(table).rows)
components = {r["Component"]: r for r in rows("Component")}
directories = {r["Directory"]: r for r in rows("Directory")}
# "short|long" names, optionally "target:source"
long_name = lambda value: value.split(":")[0].split("|")[-1]

def path_of(directory):
	parts = []
	while directory:
		row = directories[directory]
		name = long_name(row["DefaultDir"])
		if name not in (".", "SourceDir"):
			parts.append(name)
		directory = row["Directory_Parent"]
	return list(reversed(parts))

media = sorted((m for m in rows("Media") if m["LastSequence"]), key=lambda m: m["LastSequence"])
for f in rows("File"):
	parts = path_of(components[f["Component_"]]["Directory_"]) + [long_name(f["FileName"])]
	if "Developer" not in parts:
		continue
	rel = "/".join(parts[len(parts) - 1 - parts[::-1].index("Developer") + 1:])
	if rel in wanted:
		# A file is in the first cabinet whose LastSequence reaches its Sequence
		cab = next(m["Cabinet"] for m in media if m["LastSequence"] >= f["Sequence"])
		print(f["File"], cab, rel, sep="\t")
EOF

	for cab in $(cut -f2 "$dir/files.tsv" | sort -u); do
		7zz e -y -bso0 "$dir/$dat" "$cab" -o"$dir"
	done
	while IFS=$'\t' read -r key cab rel; do
		7zz e -y -bso0 "$dir/$cab" "$key" -o"$dir"
		mkdir -p "$(dirname "$dir/Developer/$rel")"
		mv "$dir/$key" "$dir/Developer/$rel"
	done < "$dir/files.tsv"
	store "$dir/Developer" "$version"
	rm -rf "$dir"
}

for arg in "$@"; do
	if [[ "$arg" == --installed ]]; then
		plist="/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Info.plist"
		version=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$plist")
		version=${version%.0} # 21.2.0 -> 21.2, as in the zip names
		rm -rf "${CACHE:?}/$version"
		store "/$DEVELOPER" "$version"
		continue
	fi

	name=$(basename "$arg")
	if [[ ! "$name" =~ ^DaVinci_Resolve_(Studio_)?([0-9.]+)_(Mac|Windows)(_ARM64)?\.zip$ ]]; then
		echo "Skipping $name: not a DaVinci_Resolve_[Studio_]<version>_{Mac,Windows}.zip" >&2
		continue
	fi
	version=${BASH_REMATCH[2]}
	if [[ -d "$CACHE/$version" ]]; then
		echo "$CACHE/$version exists, skipping $name"
		continue
	fi
	case "${BASH_REMATCH[3]}" in
		Mac) extract_mac "$arg" "$version" ;;
		Windows) extract_windows "$arg" "$version" ;;
	esac
done

echo
python3 scripts/resolve-api-compat.py
