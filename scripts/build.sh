#!/usr/bin/env bash
#---------------------------------------------------------------------------------------------
#  Copyright (c) Microsoft Corporation. All rights reserved.
#  Licensed under the MIT License. See LICENSE in the project root for license information.
#---------------------------------------------------------------------------------------------
#
# Builds the static demo site into docs/.
#
#   VSCODE_DIR=/path/to/vscode scripts/build.sh
#
# 1. Syncs src/colorGroupsMockup/ into the vscode checkout's fixture folder
#    (files there that are not in src/colorGroupsMockup/ are deleted).
# 2. Runs a production rspack build of only that Component Explorer fixture.
# 3. Writes docs/ (plus .nojekyll, og.png, walkthrough.mp4, and build-info.json with the vscode commit).
#
# The vscode checkout needs `npm ci --ignore-scripts` at the root, `npm ci` in
# build/rspack, and node_modules/@vscode/codicons/dist/codicon.ttf copied to
# src/vs/base/browser/ui/codicons/codicon/codicon.ttf.

set -euo pipefail

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VSCODE_DIR="$(cd "${VSCODE_DIR:-$HOME/.copilot/repos/vscode.worktrees/agents-window-color-grouping-mockup}" && pwd)"
OUT_DIR="$DEMO_DIR/docs"
PAGES_URL="${PAGES_URL:-https://yoyokrazy.github.io/agents-window-color-groups-mockup/}"
FIXTURE_DIR="src/vs/sessions/contrib/sessions/test/browser/colorGroupsMockup"
RSPACK_DIR="$VSCODE_DIR/build/rspack"
CODICON_FONT="$VSCODE_DIR/src/vs/base/browser/ui/codicons/codicon/codicon.ttf"

fail() {
	echo "error: $*" >&2
	exit 1
}

[ -f "$RSPACK_DIR/rspack.serve-out.config.mts" ] || fail "$VSCODE_DIR is not a vscode checkout with build/rspack (set VSCODE_DIR)"
[ -x "$RSPACK_DIR/node_modules/.bin/rspack" ] || fail "run 'npm ci' in $RSPACK_DIR first"
[ -d "$VSCODE_DIR/node_modules/@vscode/component-explorer" ] || fail "run 'npm ci --ignore-scripts' in $VSCODE_DIR first"
if [ ! -f "$CODICON_FONT" ]; then
	cp "$VSCODE_DIR/node_modules/@vscode/codicons/dist/codicon.ttf" "$CODICON_FONT"
	echo "Copied codicon.ttf into the vscode checkout (gitignored there)"
fi

# Use the vscode checkout's Node version when fnm is available.
if command -v fnm >/dev/null 2>&1 && [ -f "$VSCODE_DIR/.nvmrc" ]; then
	eval "$(fnm env)"
	fnm use --silent-if-unchanged "$(cat "$VSCODE_DIR/.nvmrc")" >/dev/null
fi
echo "Node $(node --version)"

echo "Syncing src/colorGroupsMockup/ -> $FIXTURE_DIR/"
mkdir -p "$VSCODE_DIR/$FIXTURE_DIR"
rsync -a --omit-dir-times --delete --checksum --itemize-changes "$DEMO_DIR/src/colorGroupsMockup/" "$VSCODE_DIR/$FIXTURE_DIR/"

echo "Building into docs/"
(
	cd "$RSPACK_DIR"
	VSCODE_DIR="$VSCODE_DIR" DEMO_OUT_DIR="$OUT_DIR" DEMO_PAGES_URL="$PAGES_URL" \
		./node_modules/.bin/rspack build --config "$DEMO_DIR/scripts/rspack.demo.config.mjs"
)

# rspack inlines `import.meta.url` as an absolute file URL (vs/amdX.ts, in a Node-only
# code path). Keep local paths out of the published site.
perl -pi -e "s#\\Qfile://$VSCODE_DIR/\\E#file:///vscode/#g" "$OUT_DIR"/bundled/*.js
if grep -rqF -e "$VSCODE_DIR" -e "$HOME" "$OUT_DIR"; then
	fail "local paths leaked into docs/: $(grep -rlF -e "$VSCODE_DIR" -e "$HOME" "$OUT_DIR" | tr '\n' ' ')"
fi
if grep -qF "vscode-oniguruma/release/onig.wasm" "$OUT_DIR"/bundled/*.js; then
	fail "the syntax highlighting stub was not applied (see scripts/stubs/fixtureSyntaxHighlighting.mjs)"
fi

touch "$OUT_DIR/.nojekyll"
# Link preview image and the walkthrough video (git stores the duplicate blobs once).
for file in og.png walkthrough.mp4; do
	if [ -f "$DEMO_DIR/media/$file" ]; then
		cp "$DEMO_DIR/media/$file" "$OUT_DIR/$file"
	fi
done

vscode_commit="$(git -C "$VSCODE_DIR" rev-parse HEAD)"
# Local changes in the vscode checkout besides the synced mockup folder.
vscode_changes="$(git -C "$VSCODE_DIR" status --porcelain -- . ":(exclude)$FIXTURE_DIR" | wc -l | tr -d ' ')"
cat > "$OUT_DIR/build-info.json" <<EOF
{
	"vscodeRepository": "https://github.com/microsoft/vscode",
	"vscodeCommit": "$vscode_commit",
	"vscodeLocalChanges": $vscode_changes,
	"fixture": "$FIXTURE_DIR/colorGroupsMockup.fixture.ts",
	"builtAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "Built from microsoft/vscode@$vscode_commit"
gzipped=$(cat "$OUT_DIR"/bundled/*.js "$OUT_DIR"/bundled/*.css | gzip -9 | wc -c | awk '{ printf "%.1fM", $1 / 1048576 }')
echo "Site size: $(du -sh "$OUT_DIR" | cut -f1) ($(du -sh "$OUT_DIR/bundled" | cut -f1) bundled, ~$gzipped JS+CSS gzipped)"
