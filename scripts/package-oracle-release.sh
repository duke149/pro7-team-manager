#!/usr/bin/env bash
set -euo pipefail

if [[ $# -gt 1 ]]; then
  echo "Usage: $0 [output-directory]" >&2
  exit 1
fi

repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root"

if ! git diff --quiet HEAD; then
  echo "Refusing to package a dirty tracked HEAD." >&2
  exit 1
fi

if git ls-tree -r --name-only HEAD | grep -Fxq '.env.local'; then
  echo "Refusing to archive .env.local." >&2
  exit 1
fi

output_directory="${1:-$repository_root/outputs}"
mkdir -p "$output_directory"
git_sha="$(git rev-parse HEAD)"
archive_path="$output_directory/pro7-$git_sha.tar.gz"

git archive --format=tar.gz --output="$archive_path" HEAD
printf '%s\n' "$archive_path"
