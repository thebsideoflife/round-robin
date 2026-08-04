#!/usr/bin/env bash
#
# Commit, push and deploy in one step.
#
#   npm run ship                 -> commits as "Update"
#   npm run ship "fix PX upload" -> commits with that message
#
# Keeping these three together is deliberate: the painful failures on this
# project came from GitHub and the deployed Worker drifting apart.
set -euo pipefail

cd "$(dirname "$0")/.."
MSG="${1:-Update}"

# A stale lock from an interrupted command blocks everything downstream.
[ -f .git/index.lock ] && rm -f .git/index.lock

if [ -n "$(git status --porcelain)" ]; then
  echo "==> Committing: $MSG"
  git add -A
  git commit -q -m "$MSG"
else
  echo "==> Nothing new to commit"
fi

echo "==> Syncing with GitHub"
git pull --rebase --autostash origin main
git push -q origin main

echo "==> Building and deploying"
npm run deploy

echo
echo "Done. GitHub and the live site are both current."
