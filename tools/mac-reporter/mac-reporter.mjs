#!/usr/bin/env node
/**
 * Mac side of https://ai.napats.dev/thinkpad — run every minute by launchd.
 *
 * READ-ONLY: it never opens, kills or changes a tunnel, and never edits
 * ~/.ssh/config or known_hosts. It reports:
 *   - Tailscale running? ThinkPad peer online?
 *   - `ssh <host> exit` works for each configured alias (Tailscale / LAN)
 *   - ports 1080/1433/1434: listening, and is the listener an ssh to the ThinkPad?
 *   - curl through socks5h://127.0.0.1:1080 for each configured URL
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
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFile, stat, truncate } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), "Library/Application Support/napats-status");
const LOG_FILE = join(homedir(), "Library/Logs/napats-status-reporter.log");
const KC_SERVICE = "napats-status-reporter";
const KC_ACCOUNT = "mac";
const args = new Set(process.argv.slice(2));
const configArg = process.argv.slice(2).find((a) => a.startsWith("--config="));
const CONFIG_FILE = configArg ? configArg.slice("--config=".length) : join(CONFIG_DIR, "mac-config.json");

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
	let via = false;
	for (const p of procs.filter((x) => x.cmd === "ssh")) {
		const ps = await run("/bin/ps", ["-o", "command=", "-p", p.pid], 2000);
		// the ssh destination is usually the last argument: [user@]host
		if (ps.stdout.trim().split(/\s+/).some((tok) => targets.includes(tok.replace(/^.*@/, "")))) via = true;
	}
	return { port, listening: procs.length > 0, via_thinkpad: via };
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

	const payload = {
		v: 1,
		reported_at: new Date().toISOString(),
		tailscale: ts,
		ssh,
		ports: portRes,
		socks,
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
