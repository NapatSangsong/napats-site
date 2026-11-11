#!/usr/bin/env node
/**
 * Mac side of https://ai.napats.dev/thinkpad — run every minute by launchd.
 *
 * It never edits ~/.ssh/config or known_hosts. It reports:
 *   - Tailscale running? ThinkPad peer online?
 *   - `ssh <host> exit` works for each configured alias (Tailscale / LAN)
 *   - ports 1080/1433/1434: listening, and is the listener an ssh to the ThinkPad?
 *   - curl through socks5h://127.0.0.1:1080 for each configured URL
 *
 * Tunnel auto-heal ("auto_heal": true + "tunnels" in mac-config.json, owner
 * approved 2026-11-11): when a configured port has no listener it opens
 * `ssh -f -N <forward> <ThinkPad alias>` (Tailscale alias first, LAN second);
 * when the SOCKS port is an ssh to the ThinkPad but every SOCKS check fails at
 * the connection level for 2 runs in a row while ssh itself works, it stops
 * that ssh and opens a fresh one. A port held by anything else is never
 * touched. At most one attempt per port per 4 minutes.
 *
 * Node built-ins only. Host names / IPs live in
 * ~/Library/Application Support/napats-status/mac-config.json (never in the
 * repo); the payload carries labels only. Token: macOS Keychain
 * (service "napats-status-reporter", account "mac").
 *
 *   node mac-reporter.mjs --dry-run      print the payload, send nothing
 *   node mac-reporter.mjs --init-token   new token into Keychain, print its SHA-256
 *   --config=<path>                      use another mac-config.json (testing)
 */
import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFile, stat, truncate, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CONFIG_DIR = join(homedir(), "Library/Application Support/napats-status");
const LOG_FILE = join(homedir(), "Library/Logs/napats-status-reporter.log");
const HEAL_COOLDOWN_MS = 4 * 60_000;
const STALE_RUNS = 2;
const KC_SERVICE = "napats-status-reporter";
const KC_ACCOUNT = "mac";
const args = new Set(process.argv.slice(2));
const configArg = process.argv.slice(2).find((a) => a.startsWith("--config="));
const CONFIG_FILE = configArg ? configArg.slice("--config=".length) : join(CONFIG_DIR, "mac-config.json");
const HEAL_STATE_FILE = join(dirname(CONFIG_FILE), "heal-state.json");

// never outlive a minute, whatever hangs
setTimeout(() => {
	console.error(`${new Date().toISOString()} hard timeout`);
	process.exit(2);
}, 40_000).unref();

/** execFile that never rejects */
function run(cmd, argv, timeoutMs) {
	const t0 = Date.now();
	return new Promise((resolve) => {
		execFile(cmd, argv, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
			const code = err ? (typeof err.code === "number" ? err.code : -1) : 0;
			resolve({ code, stdout: String(stdout), stderr: String(stderr), ms: Date.now() - t0 });
		});
	});
}

/** spawn and wait for exit only (ssh -f leaves a daemon holding inherited pipes, so execFile would hang) */
function runDetached(cmd, argv, timeoutMs) {
	return new Promise((resolve) => {
		const child = spawn(cmd, argv, { stdio: "ignore" });
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			resolve(-1);
		}, timeoutMs);
		child.on("error", () => {
			clearTimeout(timer);
			resolve(-1);
		});
		child.on("exit", (code) => {
			clearTimeout(timer);
			resolve(code ?? -1);
		});
	});
}

async function tailscale(cfg) {
	const r = await run(cfg.tailscale_bin ?? "/usr/local/bin/tailscale", ["status", "--json"], 5000);
	try {
		const j = JSON.parse(r.stdout);
		const peer = Object.values(j.Peer ?? {}).find((p) => (p.TailscaleIPs ?? []).includes(cfg.thinkpad_tailscale_ip));
		return { running: j.BackendState === "Running", peer_online: peer ? Boolean(peer.Online) : null };
	} catch {
		return { running: false, peer_online: null };
	}
}

async function sshCheck({ label, host }) {
	const r = await run(
		"/usr/bin/ssh",
		["-o", "BatchMode=yes", "-o", "ConnectTimeout=4", "-o", "ServerAliveInterval=2", "-o", "ServerAliveCountMax=2", host, "exit"],
		8000,
	);
	return { label, ok: r.code === 0, latency_ms: r.code === 0 ? r.ms : null };
}

async function portCheck(port, targets) {
	const r = await run("/usr/sbin/lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"], 4000);
	const procs = [];
	let pid = null;
	for (const line of r.stdout.split("\n")) {
		if (line.startsWith("p")) pid = line.slice(1);
		else if (line.startsWith("c") && pid) procs.push({ pid, cmd: line.slice(1) });
	}
	const sshPids = [];
	for (const p of procs.filter((x) => x.cmd === "ssh")) {
		const ps = await run("/bin/ps", ["-o", "command=", "-p", p.pid], 2000);
		// the ssh destination is usually the last argument: [user@]host
		if (ps.stdout.trim().split(/\s+/).some((tok) => targets.includes(tok.replace(/^.*@/, "")))) sshPids.push(Number(p.pid));
	}
	// _pids stays local (stripped before sending)
	return { port, listening: procs.length > 0, via_thinkpad: sshPids.length > 0, _pids: sshPids };
}

async function socksCheck({ label, url, expect_status = [] }, socksPort, socksUp) {
	if (!socksUp) return { label, ok: false, http_status: null, latency_ms: null };
	const r = await run(
		"/usr/bin/curl",
		["-s", "-o", "/dev/null", "-w", "%{http_code} %{time_total}", "--max-time", "8", "--proxy", `socks5h://127.0.0.1:${socksPort}`, url],
		10_000,
	);
	const [codeStr, timeStr] = r.stdout.trim().split(" ");
	const code = Number(codeStr);
	const status = code >= 100 && code <= 599 ? code : null;
	return {
		label,
		ok: status != null && (expect_status.length === 0 || expect_status.includes(status)),
		http_status: status,
		latency_ms: status != null ? Math.round(Number(timeStr) * 1000) : null,
	};
}

async function readJson(path, fallback) {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch {
		return fallback;
	}
}

/** Reopen missing tunnels / restart a stale SOCKS tunnel. Returns the payload block. */
async function healTunnels(cfg, ssh, portRes, socks, socksPort, targets) {
	if (!cfg.auto_heal || !Array.isArray(cfg.tunnels) || cfg.tunnels.length === 0) return undefined;
	const state = await readJson(HEAL_STATE_FILE, { last: {}, stale: 0 });
	state.last ??= {};
	const okLabel = (ssh.find((s) => s.ok && s.label === "Tailscale") ?? ssh.find((s) => s.ok))?.label;
	const host = (cfg.ssh ?? []).find((s) => s.label === okLabel)?.host;
	const socksDead = socks.length > 0 && socks.every((s) => !s.ok && s.http_status == null);
	const socksPortRes = portRes.find((p) => p.port === socksPort);
	if (socksPortRes?.via_thinkpad && socksDead) state.stale = (state.stale ?? 0) + 1;
	else state.stale = 0;

	const now = Date.now();
	if (host && !args.has("--dry-run")) {
		for (const t of cfg.tunnels) {
			const p = portRes.find((x) => x.port === t.port);
			if (!p || !Array.isArray(t.forward)) continue;
			const last = state.last[t.port];
			if (last && now - Date.parse(last.at) < HEAL_COOLDOWN_MS) continue;
			let action = null;
			if (!p.listening) action = "opened";
			else if (t.port === socksPort && p.via_thinkpad && state.stale >= STALE_RUNS) {
				const alive = (pid) => {
					try {
						process.kill(pid, 0);
						return true;
					} catch {
						return false;
					}
				};
				for (const pid of p._pids) {
					try {
						process.kill(pid, "SIGTERM");
					} catch {}
				}
				await new Promise((r) => setTimeout(r, 1500));
				// a hung ssh may ignore SIGTERM
				for (const pid of p._pids.filter(alive)) {
					try {
						process.kill(pid, "SIGKILL");
					} catch {}
				}
				await new Promise((r) => setTimeout(r, 500));
				action = "restarted";
				state.stale = 0;
			}
			if (!action) continue;
			const code = await runDetached(
				"/usr/bin/ssh",
				[
					"-f", "-N", ...t.forward,
					"-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes",
					"-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=3", "-o", "ConnectTimeout=10",
					host,
				],
				25_000,
			);
			state.last[t.port] = { action: code === 0 ? action : "failed", at: new Date().toISOString() };
			// refresh this port's row so the payload shows the result of the heal
			const fresh = await portCheck(t.port, targets);
			Object.assign(p, fresh);
		}
	}
	if (!args.has("--dry-run")) {
		try {
			await writeFile(HEAL_STATE_FILE, JSON.stringify(state));
		} catch {}
	}
	const events = Object.entries(state.last)
		.map(([port, e]) => ({ port: Number(port), action: e.action, at: e.at }))
		.sort((a, b) => a.port - b.port)
		.slice(0, 10);
	return { enabled: true, events };
}

async function readToken() {
	const r = await run("/usr/bin/security", ["find-generic-password", "-s", KC_SERVICE, "-a", KC_ACCOUNT, "-w"], 5000);
	const t = r.stdout.trim();
	if (r.code !== 0 || !t) throw new Error("token not in Keychain — run with --init-token");
	return t;
}

async function initToken() {
	const token = randomBytes(32).toString("base64url");
	const r = await run("/usr/bin/security", ["add-generic-password", "-U", "-s", KC_SERVICE, "-a", KC_ACCOUNT, "-w", token], 5000);
	if (r.code !== 0) throw new Error(`security add-generic-password failed (${r.code})`);
	console.log(`Saved to Keychain (service ${KC_SERVICE}, account ${KC_ACCOUNT}).`);
	console.log(`MAC_INGEST_TOKEN_SHA256=${createHash("sha256").update(token).digest("hex")}`);
}

async function trimLog() {
	try {
		if ((await stat(LOG_FILE)).size > 1024 * 1024) await truncate(LOG_FILE, 0);
	} catch {}
}

async function main() {
	if (args.has("--init-token")) return initToken();

	const t0 = Date.now();
	const cfg = JSON.parse(await readFile(CONFIG_FILE, "utf8"));
	const targets = cfg.thinkpad_targets ?? [];
	const socksPort = cfg.socks_port ?? 1080;
	const ports = cfg.ports ?? [1080, 1433, 1434];

	const [ts, ssh, portRes] = await Promise.all([
		tailscale(cfg),
		Promise.all((cfg.ssh ?? []).map(sshCheck)),
		Promise.all(ports.map((p) => portCheck(p, targets))),
	]);
	const socksUp = portRes.some((p) => p.port === socksPort && p.listening);
	const socks = await Promise.all((cfg.socks ?? []).map((s) => socksCheck(s, socksPort, socksUp)));
	const heal = await healTunnels(cfg, ssh, portRes, socks, socksPort, targets);

	const payload = {
		v: 1,
		reported_at: new Date().toISOString(),
		tailscale: ts,
		ssh,
		ports: portRes.map(({ _pids, ...p }) => p),
		socks,
		...(heal ? { tunnel_heal: heal } : {}),
		duration_ms: Date.now() - t0,
	};
	const json = JSON.stringify(payload);
	const fails = [...ssh, ...socks].filter((x) => !x.ok).map((x) => x.label);
	const summary = `ts=${ts.running ? "up" : "down"} peer=${ts.peer_online} fail=[${fails.join(",")}] ${payload.duration_ms}ms`;

	if (args.has("--dry-run")) {
		console.log(json);
		console.log(summary);
		return;
	}

	await trimLog();
	const res = await fetch(cfg.endpoint, {
		method: "POST",
		headers: { Authorization: `Bearer ${await readToken()}`, "Content-Type": "application/json" },
		body: json,
		signal: AbortSignal.timeout(10_000),
	});
	const line = `${new Date().toISOString()} ${res.status} ${summary}`;
	if (res.ok) console.log(line);
	else {
		console.error(`${line} ${(await res.text()).slice(0, 200)}`);
		process.exitCode = 1;
	}
}

main().catch((e) => {
	console.error(`${new Date().toISOString()} error: ${e instanceof Error ? e.message : String(e)}`);
	process.exitCode = 1;
});
