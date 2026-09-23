#!/usr/bin/env bash
# Install the skills for Claude Code and/or Codex without any package manager.
#
#   ./install.sh                          # every skill, for both agents
#   ./install.sh --claude                 # ~/.claude/skills/<skill>
#   ./install.sh --codex                  # ~/.codex/skills/<skill>
#   ./install.sh --claude sketch-to-sim   # one skill, one agent
#
# Re-run to update. Each copy then runs scripts/setup.mjs, which installs its
# own node_modules, finds or downloads Chromium and renders a smoke test.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/skills"
targets=("$HOME/.claude/skills" "${CODEX_HOME:-$HOME/.codex}/skills")
skills=()
for arg in "$@"; do
  case "$arg" in
    --claude) targets=("$HOME/.claude/skills") ;;
    --codex)  targets=("${CODEX_HOME:-$HOME/.codex}/skills") ;;
    -*) echo "usage: install.sh [--claude|--codex] [skill...]" >&2; exit 2 ;;
    *) [ -f "$ROOT/$arg/SKILL.md" ] || { echo "no skill named $arg in $ROOT" >&2; exit 2; }; skills+=("$arg") ;;
  esac
done
if [ ${#skills[@]} -eq 0 ]; then
  for d in "$ROOT"/*/; do [ -f "$d/SKILL.md" ] && skills+=("$(basename "$d")"); done
fi
for dir in "${targets[@]}"; do
  for skill in "${skills[@]}"; do
    echo "==> $dir/$skill"
    mkdir -p "$dir/$skill"
    rsync -a --delete --exclude node_modules --exclude out "$ROOT/$skill/" "$dir/$skill/"
    (cd "$dir/$skill" && node scripts/setup.mjs)
  done
done
