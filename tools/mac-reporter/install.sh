#!/bin/bash
# Install the /thinkpad Mac reporter as a launchd agent (every 60 s, current user).
# Needs: mac-config.json in ~/Library/Application Support/napats-status and a
# token in Keychain (node mac-reporter.mjs --init-token). Remove with uninstall.sh.
set -euo pipefail

LABEL="com.napats.status-reporter"
DIR="$HOME/Library/Application Support/napats-status"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE="${NODE:-$(command -v node)}"
HERE="$(cd "$(dirname "$0")" && pwd)"

[ -f "$DIR/mac-config.json" ] || { echo "missing $DIR/mac-config.json" >&2; exit 1; }
/usr/bin/security find-generic-password -s napats-status-reporter -a mac >/dev/null 2>&1 \
	|| { echo "no token in Keychain — run: node $HERE/mac-reporter.mjs --init-token" >&2; exit 1; }

install -m 0644 "$HERE/mac-reporter.mjs" "$DIR/mac-reporter.mjs"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>$LABEL</string>
	<key>ProgramArguments</key>
	<array>
		<string>$NODE</string>
		<string>$DIR/mac-reporter.mjs</string>
	</array>
	<key>StartInterval</key><integer>60</integer>
	<key>RunAtLoad</key><true/>
	<key>ProcessType</key><string>Background</string>
	<!-- tunnels opened by auto-heal (ssh -f) must outlive each run -->
	<key>AbandonProcessGroup</key><true/>
	<key>StandardOutPath</key><string>$HOME/Library/Logs/napats-status-reporter.log</string>
	<key>StandardErrorPath</key><string>$HOME/Library/Logs/napats-status-reporter.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed $LABEL (log: ~/Library/Logs/napats-status-reporter.log)"
