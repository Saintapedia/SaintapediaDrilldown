#!/usr/bin/env bash
# Install SaintapediaDrilldown on a Canasta (Docker) MediaWiki instance.
# Run from your Canasta instance directory (the one containing docker-compose.yml).
#
# Usage:
#   bash /path/to/SaintapediaDrilldown/install.sh
#   bash /path/to/SaintapediaDrilldown/install.sh --from-git   # clone from GitHub
#   bash /path/to/SaintapediaDrilldown/install.sh --repo /path/to/SaintapediaDrilldown

set -euo pipefail

INSTANCE_DIR="$(pwd)"
EXT_NAME="SaintapediaDrilldown"
EXT_DIR="$INSTANCE_DIR/extensions/$EXT_NAME"
SETTINGS_FILE="$INSTANCE_DIR/config/settings/global/${EXT_NAME}.php"
REPO_URL="https://github.com/Saintapedia/SaintapediaDrilldown.git"
FROM_GIT=0
REPO_SOURCE=""

while [[ $# -gt 0 ]]; do
	case "$1" in
		--from-git) FROM_GIT=1; shift ;;
		--repo) REPO_SOURCE="${2:?}"; shift 2 ;;
		*) echo "Unknown arg: $1" >&2; exit 2 ;;
	esac
done

echo "SaintapediaDrilldown installer (Canasta)"
echo "Instance directory: $INSTANCE_DIR"
echo ""

if [[ ! -f "$INSTANCE_DIR/docker-compose.yml" && ! -f "$INSTANCE_DIR/docker-compose.yaml" ]]; then
	echo "ERROR: No docker-compose.yml found in $(pwd)."
	echo "Run this script from your Canasta instance directory."
	exit 1
fi

# 1 — Ensure Cargo is enabled (required at runtime; not a hard extension.json dependency)
if command -v canasta &>/dev/null; then
	echo "Checking Cargo via canasta CLI..."
	if canasta extension list 2>/dev/null | grep -qx 'Cargo'; then
		echo "Enabling Cargo (required dependency)..."
		canasta extension enable Cargo || true
	else
		echo "WARNING: 'canasta extension list' did not show Cargo."
		echo "SaintapediaDrilldown requires Cargo >= 3.0. Enable Cargo manually if needed."
	fi
else
	echo "NOTE: canasta CLI not found — ensure Cargo is enabled before this extension loads."
fi

# 2 — Place extension in extensions/
if [[ -n "$REPO_SOURCE" ]]; then
	echo "Copying extension from $REPO_SOURCE ..."
	rm -rf "$EXT_DIR"
	cp -a "$REPO_SOURCE" "$EXT_DIR"
elif [[ -d "$EXT_DIR" ]]; then
	echo "Extension directory already exists: $EXT_DIR"
elif [[ $FROM_GIT -eq 1 ]]; then
	echo "Cloning from $REPO_URL ..."
	git clone "$REPO_URL" "$EXT_DIR"
else
	SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
	if [[ "$(basename "$SCRIPT_DIR")" == "$EXT_NAME" ]]; then
		echo "Copying extension from $SCRIPT_DIR ..."
		cp -a "$SCRIPT_DIR" "$EXT_DIR"
	else
		echo "ERROR: extensions/$EXT_NAME not found."
		echo "Run with --from-git or --repo /path/to/$EXT_NAME"
		exit 1
	fi
fi

if [[ ! -f "$EXT_DIR/extension.json" ]]; then
	echo "ERROR: $EXT_DIR/extension.json missing — install aborted."
	exit 1
fi

# 3 — Remove legacy SaintapediaSort settings if present
for legacy in \
	"$INSTANCE_DIR/config/settings/global/SaintapediaSort.php" \
	"$INSTANCE_DIR/config/settings/SaintapediaSort.php"
do
	if [[ -f "$legacy" ]]; then
		echo "Removing legacy settings file: $legacy"
		rm -f "$legacy"
	fi
done

# 4 — Write settings file (Canasta loads config/settings/global/*.php)
mkdir -p "$(dirname "$SETTINGS_FILE")"
cat > "$SETTINGS_FILE" <<'PHP'
<?php
/**
 * SaintapediaDrilldown — user extension settings (Canasta).
 * Cargo must be enabled before this file is loaded (enable via: canasta extension enable Cargo).
 */
wfLoadExtension( 'SaintapediaDrilldown' );
PHP
echo "Wrote $SETTINGS_FILE"

# 5 — Restart
echo ""
echo "Restarting Canasta..."
if command -v canasta &>/dev/null; then
	canasta restart
else
	docker compose restart
fi

echo ""
echo "Done. Verify at Special:Version — look for SaintapediaDrilldown 0.4.0."
echo "Then open Special:Drilldown and check browser console for SaintapediaDrilldown warnings."
echo ""
echo "If the site shows HTTP 500, recover with:"
echo "  rm -f $SETTINGS_FILE && canasta restart"
