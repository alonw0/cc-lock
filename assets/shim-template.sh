#!/bin/bash
# cc-lock shim - replaces claude symlink when locked
# DO NOT EDIT - managed by cc-lock daemon
#
# Variables replaced by shim-manager:
#   {{REAL_BINARY}} - path to the real claude binary
#   {{CHECK_LOCK}} - path to check-lock script

STATE_FILE="$HOME/.cc-lock/state.json"
REAL_BINARY="{{REAL_BINARY}}"
CHECK_LOCK="{{CHECK_LOCK}}"

# Quick check: if state file doesn't exist, just exec
if [ ! -f "$STATE_FILE" ]; then
  exec "$REAL_BINARY" "$@"
fi

# Parse status from state file
STATUS=$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' "$STATE_FILE" | head -1 | grep -o '"[^"]*"$' | tr -d '"')

if [ "$STATUS" = "unlocked" ] || [ "$STATUS" = "grace" ]; then
  exec "$REAL_BINARY" "$@"
fi

# Locked - show message and offer bypass
echo ""
echo "🔒 Claude Code is locked by cc-lock"
echo ""

EXPIRES=$(grep -o '"expiresAt"[[:space:]]*:[[:space:]]*"[^"]*"' "$STATE_FILE" | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -n "$EXPIRES" ]; then
  echo "Lock expires: $EXPIRES"
fi

ATTEMPTS=$(grep -o '"bypassAttempts"[[:space:]]*:[[:space:]]*[0-9]*' "$STATE_FILE" | head -1 | grep -o '[0-9]*$')
echo "Bypass attempts this period: ${ATTEMPTS:-0}"
echo ""
echo "To bypass, run: cc-lock unlock"
echo ""
exit 1
