#!/usr/bin/env bash
# scripts/deploy.sh — PxD room packager + remote deploy helper
#
# Usage:
#   scripts/deploy.sh --room <name> [OPTIONS]
#
# Options:
#   --room <name>           Room name; must match rooms/<name>/pxd/  (required)
#   --host <ssh-target>     SSH target for remote deploy (e.g. pi5-ssd).
#                           If omitted, only the local package step runs.
#   --nginx-root <path>     Nginx web root on the remote host.
#                           Default: /opt/paradox/html
#   --rooms-base <path>     Override path to the rooms/ directory.
#                           Default: <pxd-dir>/../../rooms
#   --pxd-dir <path>        Override the framework root (apps/PxD/).
#                           Default: directory containing this script
#
# Examples:
#   # Package locally only
#   scripts/deploy.sh --room agent22
#
#   # Package + rsync + symlink on a Pi
#   scripts/deploy.sh --room agent22 --host pi5-ssd
#
#   # Then reload Nginx if the symlink target changed
#   ssh pi5-ssd "sudo nginx -s reload"
#
# See docs/PACKAGER.md for full documentation.

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PXD_DIR="$SCRIPT_DIR/.."          # apps/PxD/

ROOM=""
HOST=""
NGINX_ROOT="/opt/paradox/html"
ROOMS_BASE=""                      # resolved after arg parse

# ── Argument parsing ───────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --room)        ROOM="$2";        shift 2 ;;
        --host)        HOST="$2";        shift 2 ;;
        --nginx-root)  NGINX_ROOT="$2";  shift 2 ;;
        --rooms-base)  ROOMS_BASE="$2";  shift 2 ;;
        --pxd-dir)     PXD_DIR="$2";     shift 2 ;;
        -h|--help)
            sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | grep '^#' | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *)
            echo "Unknown argument: $1" >&2
            echo "Run with --help for usage." >&2
            exit 1 ;;
    esac
done

if [[ -z "$ROOM" ]]; then
    echo "Error: --room is required." >&2
    echo "Run with --help for usage." >&2
    exit 1
fi

# Resolve paths
PXD_DIR="$(cd "$PXD_DIR" && pwd)"
ROOMS_BASE="${ROOMS_BASE:-$PXD_DIR/../../rooms}"
ROOMS_BASE="$(cd "$ROOMS_BASE" && pwd)"

ROOM_SRC="$ROOMS_BASE/$ROOM/pxd"
ROOM_OUT="$ROOMS_BASE/$ROOM/html"

if [[ ! -d "$ROOM_SRC" ]]; then
    echo "Error: room source directory not found: $ROOM_SRC" >&2
    exit 1
fi

# ── Step 1: Package ────────────────────────────────────────────────────────
echo "==> Packaging $ROOM ..."
node "$PXD_DIR/scripts/package.js" --room-dir "$ROOM_SRC" --out "$ROOM_OUT"

# ── Step 2: Remote deploy (only if --host given) ───────────────────────────
if [[ -z "$HOST" ]]; then
    echo ""
    echo "No --host given — local package only."
    echo "Output: $ROOM_OUT"
    exit 0
fi

REMOTE_OUT="/opt/paradox/rooms/$ROOM/html"

echo ""
echo "==> Syncing to $HOST:$REMOTE_OUT ..."
rsync -av --delete "$ROOM_OUT/" "$HOST:$REMOTE_OUT/"

echo ""
echo "==> Swinging Nginx symlink on $HOST ..."
ssh "$HOST" "ln -sfn '$REMOTE_OUT' '$NGINX_ROOT/$ROOM'"
echo "    $NGINX_ROOT/$ROOM -> $REMOTE_OUT"

echo ""
echo "Done.  If the symlink target changed, run:"
echo "    ssh $HOST 'sudo nginx -s reload'"
