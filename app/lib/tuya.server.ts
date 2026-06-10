/**
 * Tuya Cloud API client (server-side only — HMAC-SHA256 signing with ACCESS_SECRET).
 * Port of the proven Python client (energy_data_3.py v3):
 *   - token cached in-memory + KV, refreshed on sign/token errors with one retry
 *   - report-logs fetched in 4h chunks; pagination continues whenever a batch
 *     is full (100 rows) because Tuya's has_more flag is unreliable
 *   - endpoint fallback chain for report-logs (v2.1 → v2.0 → iot-03 → logs type=7)
 */

export interface TuyaEnv {
	TUYA_ACCESS_ID: string;
	TUYA_ACCESS_SECRET: string;
	TUYA_ENDPOINT: string;
	TUYA_DEVICE_ID: string;
}

export interface TuyaLog {
	event_time: number;
	value: string;
}

export interface LiveReading {
	ts: number;
	power_w: number;
	voltage_v: number;
	current_a: number;
	power_factor: number;
	freq_hz: number;
	meter_kwh: number;
	/** raw property list straight from Tuya, for the Technical Inspector */
	raw: Array<{ code: string; value: unknown }>;
}

interface TuyaResult {
	success?: boolean;
	code?: number | string;
	msg?: string;
	result?: unknown;
}

const PAGE_SIZE = 100;
const CHUNK_MS = 4 * 3600 * 1000;
const MAX_PAGES = 200;
const TOKEN_KV_KEY = "energy:tuya:token";
const ENDPOINT_KV_KEY = "energy:tuya:endpoint";
const ENERGY_CODE = "forward_energy_total";

/** Tuya error codes that mean the access token is invalid/expired */
const TOKEN_ERRORS = new Set(["1004", "1010", "1011"]);

// ---------------- signing ----------------

const enc = new TextEncoder();

async function sha256hex(s: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", enc.encode(s));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256HexUpper(secret: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
	return [...new Uint8Array(sig)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.toUpperCase();
}

/** Matches Python urllib.parse.quote(str(v), safe=',') for our param values */
function quoteParam(v: string | number): string {
	return encodeURIComponent(String(v)).replace(/%2C/gi, ",");
}

function pathWithQuery(path: string, params?: Record<string, string | number>): string {
	if (!params || Object.keys(params).length === 0) return path;
	const qs = Object.keys(params)
		.sort()
		.map((k) => `${k}=${quoteParam(params[k])}`)
		.join("&");
	return `${path}?${qs}`;
}

async function tuyaRequest(
	env: TuyaEnv,
	method: string,
	path: string,
	opts: { token?: string; params?: Record<string, string | number>; body?: string } = {},
): Promise<TuyaResult> {
	const fullPath = pathWithQuery(path, opts.params);
	const t = String(Date.now());
	const stringToSign = `${method}\n${await sha256hex(opts.body ?? "")}\n\n${fullPath}`;
	const message = env.TUYA_ACCESS_ID + (opts.token ?? "") + t + stringToSign;
	const sign = await hmacSha256HexUpper(env.TUYA_ACCESS_SECRET, message);
	const headers: Record<string, string> = {
		client_id: env.TUYA_ACCESS_ID,
		sign,
		t,
		sign_method: "HMAC-SHA256",
		nonce: "",
		"Content-Type": "application/json",
	};
	if (opts.token) headers.access_token = opts.token;
	try {
		const res = await fetch(env.TUYA_ENDPOINT + fullPath, {
			method,
			headers,
			body: opts.body || undefined,
			signal: AbortSignal.timeout(25_000),
		});
		return (await res.json()) as TuyaResult;
	} catch (e) {
		return { success: false, msg: String(e) };
	}
}

// ---------------- token ----------------

let memToken: { token: string; expMs: number } | null = null;

async function fetchFreshToken(env: TuyaEnv, kv: KVNamespace): Promise<string> {
	const r = await tuyaRequest(env, "GET", "/v1.0/token", { params: { grant_type: 1 } });
	if (!r.success) {
		throw new Error(`Tuya token failed: code=${r.code} ${r.msg ?? ""}`);
	}
	const result = r.result as { access_token: string; expire_time?: number };
	const expireSec = result.expire_time ?? 7200;
	const ttlSec = Math.max(60, expireSec - 120);
	memToken = { token: result.access_token, expMs: Date.now() + ttlSec * 1000 };
	await kv.put(TOKEN_KV_KEY, JSON.stringify(memToken), { expirationTtl: ttlSec });
	return result.access_token;
}

export async function getToken(env: TuyaEnv, kv: KVNamespace): Promise<string> {
	if (memToken && Date.now() < memToken.expMs) return memToken.token;
	const cached = await kv.get<{ token: string; expMs: number }>(TOKEN_KV_KEY, "json");
	if (cached && Date.now() < cached.expMs) {
		memToken = cached;
		return cached.token;
	}
	return fetchFreshToken(env, kv);
}

async function clearToken(kv: KVNamespace): Promise<void> {
	memToken = null;
	await kv.delete(TOKEN_KV_KEY);
}

/** Signed GET with token; on token-invalid errors refresh once and retry. */
async function authedGet(
	env: TuyaEnv,
	kv: KVNamespace,
	path: string,
	params?: Record<string, string | number>,
): Promise<TuyaResult> {
	const token = await getToken(env, kv);
	const r = await tuyaRequest(env, "GET", path, { token, params });
	if (!r.success && TOKEN_ERRORS.has(String(r.code))) {
		await clearToken(kv);
		const fresh = await fetchFreshToken(env, kv);
		return tuyaRequest(env, "GET", path, { token: fresh, params });
	}
	return r;
}

// ---------------- live ----------------

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

export async function getLive(env: TuyaEnv, kv: KVNamespace): Promise<LiveReading> {
	const r = await authedGet(env, kv, `/v2.0/cloud/thing/${env.TUYA_DEVICE_ID}/shadow/properties`);
	if (!r.success) {
		throw new Error(`Tuya live failed: code=${r.code} ${r.msg ?? ""}`);
	}
	const result = r.result as { properties?: Array<{ code: string; value: unknown }> };
	const props = result?.properties ?? [];
	const get = (code: string) => props.find((p) => p.code === code)?.value;
	return {
		ts: Date.now(),
		power_w: num(get("power_a")) * 0.1,
		voltage_v: num(get("voltage_a")) * 0.1,
		current_a: num(get("current_a")) * 0.001,
		power_factor: num(get("power_factor")),
		freq_hz: num(get("freq") ?? get("frequency")) * 0.01,
		meter_kwh: num(get(ENERGY_CODE)) * 0.01,
		raw: props.map((p) => ({ code: p.code, value: p.value })),
	};
}

// ---------------- report-logs (history) ----------------

interface LogSource {
	name: string;
	path: string;
	extra: Record<string, string | number>;
}

function logSources(deviceId: string): LogSource[] {
	return [
		{ name: "report-logs v2.1", path: `/v2.1/cloud/thing/${deviceId}/report-logs`, extra: {} },
		{ name: "report-logs v2.0", path: `/v2.0/cloud/thing/${deviceId}/report-logs`, extra: {} },
		{ name: "report-logs iot-03", path: `/v1.0/iot-03/devices/${deviceId}/report-logs`, extra: {} },
		{
			name: "operation logs type=7",
			path: `/v2.0/cloud/thing/${deviceId}/logs`,
			extra: { type: "7", query_type: 1 },
		},
	];
}

interface RawLog {
	code?: string;
	event_time?: number | string;
	eventTime?: number | string;
	value?: unknown;
}

/** One time window, following pagination. Full batches (>=100) always continue
 *  even when has_more is falsy — the flag is known to lie. */
async function fetchChunk(
	env: TuyaEnv,
	kv: KVNamespace,
	source: LogSource,
	startMs: number,
	endMs: number,
): Promise<{ ok: boolean; logs: RawLog[]; err?: TuyaResult }> {
	const logs: RawLog[] = [];
	let lastRowKey = "";
	for (let page = 0; page < MAX_PAGES; page++) {
		const params: Record<string, string | number> = {
			codes: ENERGY_CODE,
			start_time: startMs,
			end_time: endMs,
			size: PAGE_SIZE,
			...source.extra,
		};
		if (lastRowKey) params.last_row_key = lastRowKey;
		const r = await authedGet(env, kv, source.path, params);
		if (!r.success) return { ok: false, logs, err: r };
		const res = (r.result ?? {}) as
			| RawLog[]
			| {
					logs?: RawLog[];
					list?: RawLog[];
					last_row_key?: string;
					next_row_key?: string;
					current_row_key?: string;
					has_more?: boolean;
					has_next?: boolean;
			  };
		if (Array.isArray(res)) {
			logs.push(...res);
			break;
		}
		const batch = res.logs ?? res.list ?? [];
		logs.push(...batch);
		lastRowKey = res.last_row_key ?? res.next_row_key ?? res.current_row_key ?? "";
		if (batch.length === 0) break;
		const more = res.has_more || res.has_next || batch.length >= PAGE_SIZE;
		if (!more || !lastRowKey) break;
	}
	return { ok: true, logs };
}

/**
 * Fetch forward_energy_total report logs for [startMs, endMs) in 4h chunks.
 * Tries each known endpoint until one works (40000303 = wrong endpoint for
 * this data center); the winner is cached in KV.
 */
export async function fetchReportLogs(
	env: TuyaEnv,
	kv: KVNamespace,
	startMs: number,
	endMs: number,
): Promise<TuyaLog[]> {
	const sources = logSources(env.TUYA_DEVICE_ID);
	const cachedPath = await kv.get(ENDPOINT_KV_KEY);
	let sourceIdx = Math.max(
		0,
		sources.findIndex((s) => s.path === cachedPath),
	);
	const all: RawLog[] = [];
	let cs = startMs;
	while (cs < endMs) {
		const ce = Math.min(cs + CHUNK_MS, endMs);
		let done = false;
		while (!done) {
			const { ok, logs, err } = await fetchChunk(env, kv, sources[sourceIdx], cs, ce);
			if (ok) {
				all.push(...logs);
				done = true;
			} else if (sourceIdx + 1 < sources.length) {
				sourceIdx++; // try next endpoint for this and all later chunks
			} else {
				throw new Error(`Tuya report-logs failed on all endpoints: code=${err?.code} ${err?.msg ?? ""}`);
			}
		}
		cs = ce;
	}
	if (sources[sourceIdx].path !== cachedPath) {
		await kv.put(ENDPOINT_KV_KEY, sources[sourceIdx].path, { expirationTtl: 7 * 86400 });
	}
	// normalize + dedupe by event_time
	const byTime = new Map<number, TuyaLog>();
	for (const log of all) {
		if (log.code && log.code !== ENERGY_CODE) continue;
		const et = log.event_time ?? log.eventTime;
		if (et == null || log.value == null) continue;
		const ms = Number(et);
		if (!Number.isFinite(ms)) continue;
		byTime.set(ms, { event_time: ms, value: String(log.value) });
	}
	return [...byTime.values()].sort((a, b) => a.event_time - b.event_time);
}
