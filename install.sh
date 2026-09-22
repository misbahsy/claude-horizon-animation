#!/usr/bin/env bash
# Install horizon-reel for Claude Code and/or Codex without any package manager.
#
#   ./install.sh            # both
#   ./install.sh --claude   # ~/.claude/skills/horizon-reel
#   ./install.sh --codex    # ~/.codex/skills/horizon-reel
#
# Re-run to update. Each copy then runs scripts/setup.mjs, which installs its
# own node_modules, finds or downloads Chromium and renders a smoke test.
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/skills/horizon-reel"
targets=()
case "${1:-}" in
  --claude) targets=("$HOME/.claude/skills") ;;
  --codex)  targets=("${CODEX_HOME:-$HOME/.codex}/skills") ;;
  "")       targets=("$HOME/.claude/skills" "${CODEX_HOME:-$HOME/.codex}/skills") ;;
  *) echo "usage: install.sh [--claude|--codex]" >&2; exit 2 ;;
esac
for dir in "${targets[@]}"; do
  echo "==> $dir/horizon-reel"
  mkdir -p "$dir/horizon-reel"
  rsync -a --delete --exclude node_modules "$SRC/" "$dir/horizon-reel/"
  (cd "$dir/horizon-reel" && node scripts/setup.mjs)
done
