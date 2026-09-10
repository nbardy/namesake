#!/usr/bin/env bash
# Build a committed version of the visual site without shipping shared-tree edits.
set -euo pipefail

HOSTING_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_REPO="${PHYSICS_SOURCE_REPO:-$HOSTING_DIR/../../../wave_physics_0to1}"
SOURCE_REF="${PHYSICS_SOURCE_REF:-HEAD}"
SOURCE_SHA="$(git -C "$SOURCE_REPO" rev-parse --verify "${SOURCE_REF}^{commit}")"

if [[ ! -d "$SOURCE_REPO/node_modules" ]]; then
  echo "Install the visual site's dependencies with bun install in $SOURCE_REPO."
  exit 1
fi

BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/physics-site-build.XXXXXX")"
trap 'rm -rf "$BUILD_DIR"' EXIT
git -C "$SOURCE_REPO" archive "$SOURCE_SHA" | tar -x -C "$BUILD_DIR"
ln -s "$(cd "$SOURCE_REPO/node_modules" && pwd)" "$BUILD_DIR/node_modules"

cd "$BUILD_DIR"
GITHUB_PAGES=false bun run build --base / --outDir "$HOSTING_DIR/dist" --emptyOutDir

node "$HOSTING_DIR/finalize.mjs"

# Cloudflare's SPA handling replaces the host-specific fallback files.
rm -f "$HOSTING_DIR/dist/_redirects" "$HOSTING_DIR/dist/404.html" "$HOSTING_DIR/dist/CNAME"
cp "$HOSTING_DIR/redirects.txt" "$HOSTING_DIR/dist/_redirects"
printf '{"sourceRepository":"nbardy/wave-physics-0to1","sourceCommit":"%s"}\n' \
  "$SOURCE_SHA" > "$HOSTING_DIR/dist/build-info.json"
echo "Built visual site from $SOURCE_SHA for https://physics.nicholasbardy.com"
