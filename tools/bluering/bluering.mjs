#!/usr/bin/env node
/**
 * BlueRing Energy helper for the /energy dashboard: OTP login and API discovery.
 *
 * The BlueRing API (https://bluering.workundercloud.com/api) is private: it uses a phone
 * number and an SMS OTP, then sends `Authorization: Bearer <token>` on every request.
 * A Worker can't receive SMS, so this script logs in once on the Mac and keeps the token
 * in the macOS Keychain (service "napats-bluering"). It never prints the token.
 *
 *   node tools/bluering/bluering.mjs login     phone → SMS OTP → token into Keychain
 *   node tools/bluering/bluering.mjs probe     GET every known endpoint, save raw JSON
 *   node tools/bluering/bluering.mjs live      one plant snapshot (shape only)
 *   node tools/bluering/bluering.mjs status    token present? when does it expire?
 *
 *   --gateway=<id>   use this gateway instead of the first plant's
 *   --date=YYYY-MM-DD  day for the energies probes (default: today, Asia/Bangkok)
 *
 * The probe writes raw responses (your own data) to
 * ~/Library/Application Support/napats-status/bluering/, outside the repo.
 *
 * Hand the token to the Worker without it touching the screen or shell history:
 *   security find-generic-password -s napats-bluering -a token -w | npx wrangler secret put BLUERING_TOKEN
 *
 * Node built-ins only.
 */
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const BASE = "https://bluering.workundercloud.com/api";
const KC_SERVICE = "napats-bluering";
const OUT_DIR = join(homedir(), "Library/Application Support/napats-status/bluering");

const argv = process.argv.slice(2);
const cmd = argv.find((a) => !a.startsWith("--")) ?? "help";
const opt = Object.fromEntries(
	argv.filter((a) => a.startsWith("--")).map((a) => {
		const [k, ...v] = a.slice(2).split("=");
		return [k, v.join("=") || "true"];
	}),
);

// ---------------- Keychain ----------------

async function kcGet(account) {
	try {
		const { stdout } = await run("security", ["find-generic-password", "-s", KC_SERVICE, "-a", account, "-w"]);
		return stdout.trim() || null;
	} catch {
		return null;
	}
}

async function kcSet(account, value) {
	await run("security", ["add-generic-password", "-U", "-s", KC_SERVICE, "-a", account, "-w", value]);
}

// ---------------- HTTP ----------------

/** GETs wait out BlueRing's throttle (429) and retry; POSTs never retry (could resend an SMS) */
async function call(method, path, opts = {}) {
	for (let attempt = 0; ; attempt++) {
		const r = await callOnce(method, path, opts);
		if (r.status !== 429 || method !== "GET" || attempt >= 4) return r;
		const waitS = 20 * (attempt + 1);
		console.log(`     (429 throttled, waiting ${waitS}s)`);
		await new Promise((res) => setTimeout(res, waitS * 1000));
	}
}

async function callOnce(method, path, { token, body } = {}) {
	const headers = { Accept: "application/json" };
	if (body) headers["Content-Type"] = "application/json";
	if (token) headers.Authorization = `Bearer ${token}`;
	const res = await fetch(BASE + path, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(15_000),
	});
	const text = await res.text();
	let json = null;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		/* not JSON */
	}
	return { status: res.status, ok: res.ok, json, text };
}

// ---------------- helpers ----------------

const TOKEN_KEYS = ["accessToken", "access_token", "token", "jwt", "idToken"];
const REFRESH_KEYS = ["refreshToken", "refresh_token"];
const REF_KEYS = ["otpRef", "ref", "refCode", "reference", "otpReference"];

/** [key, value] of the first non-empty string under any of `keys`, searched depth-first */
function deepEntry(obj, keys, depth = 4) {
	if (!obj || typeof obj !== "object" || depth < 0) return null;
	for (const k of keys) if (typeof obj[k] === "string" && obj[k]) return [k, obj[k]];
	for (const v of Object.values(obj)) {
		const hit = deepEntry(v, keys, depth - 1);
		if (hit) return hit;
	}
	return null;
}

function deepString(obj, keys) {
	return deepEntry(obj, keys)?.[1] ?? null;
}

/** Structure of a JSON value with secrets and long strings masked, safe to print */
function shape(v, depth = 0) {
	if (v === null || typeof v !== "object") {
		if (typeof v === "string") return v.length > 40 ? `<string ${v.length}>` : v;
		return v;
	}
	if (depth > 3) return Array.isArray(v) ? `[${v.length} items]` : "{…}";
	if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1), ...(v.length > 1 ? [`…${v.length} items`] : [])] : [];
	const out = {};
	for (const [k, x] of Object.entries(v)) {
		out[k] = /token|secret|password|otp$/i.test(k) && typeof x === "string" ? "<redacted>" : shape(x, depth + 1);
	}
	return out;
}

function jwtExp(token) {
	try {
		const exp = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).exp;
		return typeof exp === "number" ? new Date(exp * 1000) : null;
	} catch {
		return null;
	}
}

function errMsg(r) {
	return r.json?.message ?? r.json?.error ?? r.text.slice(0, 200);
}

function bangkokToday() {
	return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

async function requireToken() {
	const token = await kcGet("token");
	if (!token) {
		console.error("No BlueRing token in Keychain. Run: node tools/bluering/bluering.mjs login");
		process.exit(1);
	}
	const exp = jwtExp(token);
	if (exp && exp < new Date()) {
		console.error(`BlueRing token expired ${exp.toISOString()}. Run login again.`);
		process.exit(1);
	}
	return token;
}

/** Bangkok day (YYYY-MM-DD) → its midnight as UTC ISO, the startDate form BlueRing expects */
function bangkokMidnightIso(date) {
	return new Date(`${date}T00:00:00+07:00`).toISOString();
}

// ---------------- commands ----------------

async function login() {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const phone = (await rl.question("Phone number used in the BlueRing app (e.g. 0812345678): ")).replace(/[\s-]/g, "");
	if (!phone) throw new Error("no phone number");

	// Server is NestJS + class-validator; `mobileNumber` (10 digits, leading 0) confirmed
	// 2026-11-12. It rate-limits hard (~3 requests per minute per IP).
	if (!/^0\d{9}$/.test(phone)) throw new Error("mobile number must be 10 digits starting with 0");
	const phoneKey = "mobileNumber";
	const sent = await call("POST", "/auth/send-otp", { body: { [phoneKey]: phone } });
	console.log(`  POST /auth/send-otp {${phoneKey}} → ${sent.status}${sent.ok ? "" : ` ${errMsg(sent)}`}`);
	if (sent.status === 429) throw new Error("rate-limited by BlueRing; wait a minute and run login again");
	if (!sent.ok) throw new Error(`send-otp failed: ${sent.status} ${errMsg(sent)}`);
	console.log("  response shape:", JSON.stringify(shape(sent.json)));

	// login body confirmed 2026-11-12: { mobileNumber, otpRef, otpCode }, all strings.
	// The ref comes back from send-otp; the SMS usually shows it too, so ask if it's missing.
	let ref = deepEntry(sent.json, REF_KEYS)?.[1] ?? null;
	if (ref) console.log(`  OTP ref: ${ref}`);
	else ref = (await rl.question("OTP reference (shown in the SMS, e.g. ABCD): ")).trim();

	const otp = (await rl.question("OTP from SMS: ")).trim();
	rl.close();
	if (!otp || !ref) throw new Error("OTP and OTP reference are both required");

	const auth = await call("POST", "/auth/login", { body: { mobileNumber: phone, otpRef: ref, otpCode: otp } });
	console.log(`  POST /auth/login {mobileNumber, otpRef, otpCode} → ${auth.status}${auth.ok ? "" : ` ${errMsg(auth)}`}`);
	if (auth.status === 429) throw new Error("rate-limited by BlueRing; wait a minute and run login again");
	if (!auth.ok) throw new Error(`login failed: ${auth.status} ${errMsg(auth)}`);
	console.log("  response shape:", JSON.stringify(shape(auth.json)));

	const token = deepString(auth.json, TOKEN_KEYS);
	if (!token) throw new Error("login succeeded but no token field was found (see shape above)");
	await kcSet("token", token);
	const refresh = deepString(auth.json, REFRESH_KEYS);
	if (refresh) await kcSet("refresh", refresh);

	const me = await call("GET", "/users/me", { token });
	console.log(`\n✓ token saved to Keychain (${KC_SERVICE}/token)${refresh ? " + refresh token" : ""}`);
	console.log(`  GET /users/me with it → ${me.status}`);
	const exp = jwtExp(token);
	console.log(`  expires: ${exp ? exp.toISOString() : "unknown (not a JWT)"}`);
	console.log("\nGive it to the Worker (the token never touches the screen or shell history):");
	console.log(`  security find-generic-password -s ${KC_SERVICE} -a token -w | npx wrangler secret put BLUERING_TOKEN`);
}

async function probe() {
	const token = await requireToken();
	const date = opt.date ?? bangkokToday();
	await mkdir(OUT_DIR, { recursive: true, mode: 0o700 });
	const results = [];

	async function hit(path) {
		const r = await call("GET", path, { token });
		const file = join(OUT_DIR, path.replace(/^\//, "").replace(/[^a-zA-Z0-9=&_-]+/g, "_").slice(0, 120) + ".json");
		await writeFile(file, JSON.stringify({ path, status: r.status, fetchedAt: new Date().toISOString(), body: r.json ?? r.text }, null, 2), { mode: 0o600 });
		results.push({ path, status: r.status });
		const head = r.ok ? JSON.stringify(shape(r.json)) : errMsg(r);
		console.log(`${String(r.status).padEnd(4)} ${path}\n     ${head.length > 600 ? head.slice(0, 600) + "…" : head}`);
		return r;
	}

	// endpoints a non-admin account can read (mapped 2026-11-12; /plants and /gateways/{id} are admin-only)
	const me = await hit("/users/me");
	const plants = await hit(`/users/${me.json?.id}/plants`);
	const gid = opt.gateway ?? plants.json?.[0]?.gatewayId;
	if (!gid) {
		console.log("\nNo gateway found on the account's plants. Pass --gateway=<id>.");
	} else {
		const start = encodeURIComponent(bangkokMidnightIso(date));
		const page = "limit=200&offset=0";
		await hit(`/gateways/${gid}/performances?period=minutes&startDate=${start}&${page}`);
		await hit(`/gateways/${gid}/performances?period=days&startDate=${start}&${page}`);
		await hit(`/gateways/${gid}/energies?type=minute&startDate=${start}&${page}`);
		await hit(`/gateways/${gid}/energies?type=daily&startDate=${start}&${page}`);
		await hit(`/gateways/${gid}/energies?type=monthly&${page}`);
		await hit(`/gateways/${gid}/energies/count?type=daily`);
	}
	await hit("/settings/carbon_emission_rate");

	const ok = results.filter((r) => r.status < 300);
	console.log(`\n${ok.length}/${results.length} endpoints answered 2xx. Raw JSON: ${OUT_DIR}`);
}

async function live() {
	const token = await requireToken();
	const me = (await call("GET", "/users/me", { token })).json;
	const gid = opt.gateway ?? (await call("GET", `/users/${me?.id}/plants`, { token })).json?.[0]?.gatewayId;
	if (!gid) throw new Error("no gateway on this account; pass --gateway=<id>");
	const start = encodeURIComponent(bangkokMidnightIso(bangkokToday()));
	const rows = (await call("GET", `/gateways/${gid}/performances?period=minutes&startDate=${start}&limit=200&offset=0`, { token })).json;
	const last = Array.isArray(rows) ? rows.reduce((a, b) => (!a || b.date > a.date ? b : a), null) : null;
	if (!last) return console.log("No reading yet today.");
	const solar = Math.round(last.pvActivePower * 1000);
	const grid = Math.round(last.gridActivePower * 1000);
	const at = new Date(last.date).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
	console.log(`${at}  solar ${solar} W · grid ${grid} W · home ${Math.max(0, solar + grid)} W · ${last.gridVoltage} V`);
	console.log(
		`today  solar ${last.dailyEnergyGeneration} kWh · bought ${last.dailyEnergyPurchased} kWh · sold ${last.dailyEnergySold} kWh`,
	);
}

async function status() {
	const token = await kcGet("token");
	if (!token) return console.log("No token in Keychain.");
	const exp = jwtExp(token);
	const me = await call("GET", "/users/me", { token });
	console.log(`token: present · expires ${exp ? exp.toISOString() : "unknown"} · /users/me → ${me.status}`);
}

const commands = { login, probe, live, status };
if (!commands[cmd]) {
	console.log(
		"usage: node tools/bluering/bluering.mjs <login|probe|live|status> [--gateway=<id>] [--date=YYYY-MM-DD]",
	);
	process.exit(cmd === "help" ? 0 : 1);
}
commands[cmd]().catch((e) => {
	console.error(`✗ ${e instanceof Error ? e.message : e}`);
	process.exit(1);
});
