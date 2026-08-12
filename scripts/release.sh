#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   npm run release                  — auto-detect bump, HTML only
#   npm run release:minor            — force minor bump, HTML only
#   npm run release:electron         — auto-detect bump + build & publish Electron app
#   bash scripts/release.sh major --electron

# ── Parse args ───────────────────────────────────────────────────────────────
FORCE_BUMP=""
BUILD_ELECTRON=false

for arg in "$@"; do
  case "$arg" in
    --electron) BUILD_ELECTRON=true ;;
    *)          FORCE_BUMP="$arg" ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
info()  { echo "  $*"; }
ok()    { echo "✓ $*"; }
die()   { echo "✗ $*" >&2; exit 1; }

strip_prefix() { echo "$1" | sed -E 's/^[a-z]+(\([^)]+\))?!?: //'; }

# ── Ensure clean working tree ─────────────────────────────────────────────────
if [ -n "$(git status --porcelain)" ]; then
  die "Working tree is dirty. Commit or stash changes first."
fi

# ── Determine version bump from conventional commits ─────────────────────────
if [ -n "$FORCE_BUMP" ]; then
  BUMP="$FORCE_BUMP"
  info "Bump forced to: $BUMP"
else
  LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
  if [ -z "$LAST_TAG" ]; then
    COMMITS=$(git log --format="%s %b" HEAD)
  else
    COMMITS=$(git log "${LAST_TAG}..HEAD" --format="%s %b")
  fi

  if [ -z "$COMMITS" ]; then
    die "No commits since last tag. Nothing to release."
  fi

  if echo "$COMMITS" | grep -qiE "(BREAKING CHANGE|^feat!|^fix!|^refactor!)"; then
    BUMP=major
  elif echo "$COMMITS" | grep -qE "^feat(\([^)]+\))?[!:]"; then
    BUMP=minor
  else
    BUMP=patch
  fi
  info "Auto-detected bump: $BUMP"
fi

# ── Bump version in package.json (no git tag yet) ────────────────────────────
npm version "$BUMP" --no-git-tag-version --silent
VERSION=$(node -p "require('./package.json').version")
ok "Version bumped to $VERSION"

# ── Build HTML ────────────────────────────────────────────────────────────────
info "Building Clauditor.html..."
npm run build
cp dist/Clauditor.html "dist/Clauditor-v${VERSION}.html"
ok "Build complete: dist/Clauditor-v${VERSION}.html ($(du -sh "dist/Clauditor-v${VERSION}.html" | cut -f1))"

# ── Build & publish Electron app (optional) ───────────────────────────────────
# electron-builder --publish always:
#   - packages the app for the current platform (.dmg / .exe / .AppImage)
#   - uploads the binary + latest.yml to the GitHub release
#   - latest.yml is what autoUpdater reads to detect new versions
if [ "$BUILD_ELECTRON" = true ]; then
  info "Building and publishing Electron app..."

  # electron-builder uses GH_TOKEN (or GITHUB_TOKEN) for the GitHub API.
  # It reads the `publish` config in package.json to know which host/repo to use.
  if [ -z "${GH_TOKEN:-}" ] && [ -z "${GITHUB_TOKEN:-}" ]; then
    # Fall back to the token gh CLI is already using
    GH_TOKEN=$(gh auth token 2>/dev/null || echo "")
    export GH_TOKEN
  fi

  npx electron-builder --publish always
  ok "Electron app published (latest.yml + installer uploaded)"
fi

# ── Generate changelog ────────────────────────────────────────────────────────
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
RANGE="${LAST_TAG:+${LAST_TAG}..HEAD}"
RANGE="${RANGE:-HEAD}"

FEATURES="" FIXES="" PERF="" REFACTOR="" CHORE=""
while IFS= read -r msg; do
  [ -z "$msg" ] && continue
  clean=$(strip_prefix "$msg")
  if   echo "$msg" | grep -qE "^feat(\([^)]+\))?[!:]";     then FEATURES="${FEATURES}- ${clean}\n"
  elif echo "$msg" | grep -qE "^fix(\([^)]+\))?[!:]";      then FIXES="${FIXES}- ${clean}\n"
  elif echo "$msg" | grep -qE "^perf(\([^)]+\))?[!:]";     then PERF="${PERF}- ${clean}\n"
  elif echo "$msg" | grep -qE "^refactor(\([^)]+\))?[!:]"; then REFACTOR="${REFACTOR}- ${clean}\n"
  else                                                           CHORE="${CHORE}- ${clean}\n"
  fi
done < <(git log "$RANGE" --format="%s" 2>/dev/null)

NOTES=""
[ -n "$FEATURES" ] && NOTES+="$(printf "### ✨ New Features\n${FEATURES}")"$'\n\n'
[ -n "$FIXES" ]    && NOTES+="$(printf "### 🐛 Bug Fixes\n${FIXES}")"$'\n\n'
[ -n "$PERF" ]     && NOTES+="$(printf "### ⚡ Performance\n${PERF}")"$'\n\n'
[ -n "$REFACTOR" ] && NOTES+="$(printf "### ♻️ Refactoring\n${REFACTOR}")"$'\n\n'
[ -n "$CHORE" ]    && NOTES+="$(printf "### 🔧 Maintenance\n${CHORE}")"$'\n\n'

if [ "$BUILD_ELECTRON" = true ]; then
  NOTES+="$(cat <<'EOF'
---

## 📦 Download

| Platform | File |
|---|---|
| Any browser (no install) | `Clauditor-v${VERSION}.html` — open in Chrome or Edge |
| macOS | `Clauditor-*.dmg` |
| Windows | `Clauditor Setup *.exe` |

_The desktop app updates itself automatically on next launch._
EOF
)"
else
  NOTES+="$(cat <<'EOF'
---

## 📦 Download

Grab **Clauditor-v${VERSION}.html** from the Assets below and open it in **Chrome or Edge**.

_Single file · no installation · works fully offline_
EOF
)"
fi

# ── Commit, tag, push ─────────────────────────────────────────────────────────
git add package.json package-lock.json
git commit -m "chore: release v${VERSION} [skip ci]"
git tag "v${VERSION}" -m "Release v${VERSION}"
git push origin main --follow-tags
ok "Pushed commit and tag v${VERSION}"

# ── Create GitHub release with Clauditor.html ─────────────────────────────────
# If electron-builder already created the release (--publish always creates it),
# we upload Clauditor.html to the existing release instead of creating a new one.
info "Publishing GitHub release..."
if [ "$BUILD_ELECTRON" = true ] && gh release view "v${VERSION}" &>/dev/null; then
  gh release upload "v${VERSION}" "dist/Clauditor-v${VERSION}.html" --clobber
  gh release edit "v${VERSION}" --title "Clauditor v${VERSION}" --notes "$NOTES"
  URL=$(gh release view "v${VERSION}" --json url -q .url)
else
  URL=$(gh release create "v${VERSION}" "dist/Clauditor-v${VERSION}.html" \
    --title "Clauditor v${VERSION}" \
    --notes "$NOTES")
fi
ok "Released: $URL"