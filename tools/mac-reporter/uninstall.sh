#!/bin/bash
# Remove the /thinkpad Mac reporter launchd agent.
#   --remove-files   also delete ~/Library/Application Support/napats-status and the Keychain token
set -euo pipefail

LABEL="com.napats.status-reporter"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null && echo "Stopped $LABEL" || echo "$LABEL not loaded"
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"

if [ "${1:-}" = "--remove-files" ]; then
	rm -rf "$HOME/Library/Application Support/napats-status"
	/usr/bin/security delete-generic-password -s napats-status-reporter -a mac >/dev/null 2>&1 || true
	echo "Deleted config, script and Keychain token"
fi
