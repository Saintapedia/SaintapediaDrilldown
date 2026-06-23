#!/usr/bin/env bash
# Uninstall SaintapediaDrilldown from a Canasta (Docker) MediaWiki instance.
# Run from your Canasta instance directory (the one containing docker-compose.yml).
# Usage: bash /path/to/SaintapediaDrilldown/uninstall.sh

set -e

INSTANCE_DIR="$(pwd)"
EXT_DIR="$INSTANCE_DIR/extensions/SaintapediaDrilldown"
SETTINGS_FILE="$INSTANCE_DIR/config/settings/global/SaintapediaDrilldown.php"
SETTINGS_ALT="$INSTANCE_DIR/config/settings/SaintapediaDrilldown.php"

echo "SaintapediaDrilldown uninstaller"
echo "Instance directory: $INSTANCE_DIR"
echo ""

# 1 — Verify this looks like a Canasta instance
if [ ! -f "$INSTANCE_DIR/docker-compose.yml" ] && [ ! -f "$INSTANCE_DIR/docker-compose.yaml" ]; then
    echo "ERROR: No docker-compose.yml found in $(pwd)."
    echo "Run this script from your Canasta instance directory."
    exit 1
fi

# 2 — Remove the settings file (stops the extension loading)
REMOVED_SETTINGS=0
for f in "$SETTINGS_FILE" "$SETTINGS_ALT"; do
    if [ -f "$f" ]; then
        echo "Removing settings file: $f"
        rm "$f"
        REMOVED_SETTINGS=1
    fi
done
if [ "$REMOVED_SETTINGS" -eq 0 ]; then
    echo "No settings file found at:"
    echo "  $SETTINGS_FILE"
    echo "  $SETTINGS_ALT"
    echo "If you loaded the extension another way (e.g. directly in LocalSettings.php),"
    echo "remove that line manually before continuing."
    read -p "Continue anyway? [y/N] " yn
    case "$yn" in [yY]*) ;; *) echo "Aborted."; exit 1 ;; esac
fi

# 3 — Remove the extension directory
if [ -d "$EXT_DIR" ]; then
    echo "Removing extension directory: $EXT_DIR"
    rm -rf "$EXT_DIR"
else
    echo "Extension directory not found at $EXT_DIR — already removed or installed elsewhere."
fi

# 4 — Restart to rebuild symlinks and clear ResourceLoader cache
echo ""
echo "Restarting containers to clear symlinks and ResourceLoader cache..."
if command -v canasta &>/dev/null; then
    canasta restart
else
    docker compose restart
fi

echo ""
echo "Done. SaintapediaDrilldown has been uninstalled."
echo "Visit Special:Version on your wiki to confirm it is no longer listed."
