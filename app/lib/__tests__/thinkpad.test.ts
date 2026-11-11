import { describe, expect, it } from "vitest";
import { createKeyGate, sha256hex } from "../key-gate.server";
import { evaluateAlerts, OFFLINE_ALERT_MS } from "../thinkpad-alerts";
import { sourceForRequest } from "../thinkpad-auth.server";
import { parsePayload, summarize, type ThinkpadPayload } from "../thinkpad-schema";
import {
	BUCKETS,
	BUCKET_MS,
	EMPTY_ALERT_STATE,
	ONLINE_MS,
	buildView,
	isOnline,
	timeline,
	timelineStart,
	vpnSince,
} from "../thinkpad-status";
import type { HistoryPoint } from "../thinkpad-store.server";

const MIN = 60_000;
const NOW = Date.UTC(2026, 10, 11, 12, 0, 0); // 19:00 BKK

function tpPayload(over: Partial<ThinkpadPayload> = {}): ThinkpadPayload {
	return {
		v: 1,
		reported_at: "2026-11-11T11:59:58.1234567Z", // PowerShell 'o' format: 7 fractional digits
		uptime_s: 3600,
		power: { on_ac: true, battery_present: false, battery_pct: null, sleep_ac_s: 0, hibernate_ac_s: 0 },
		vpn: { adapter_found: true, up: true, has_ipv4: true },
		checks: [
			{ label: "KBS QAS API", kind: "https", ok: true, dns_ok: true, tcp_ok: true, latency_ms: 228, http_status: 401 },
			{ label: "SQL QAS", kind: "tcp", ok: true, dns_ok: true, tcp_ok: true, latency_ms: 58, http_status: null },
		],
		duration_ms: 4300,
		...over,
	};
}

const macPayload = {
	v: 1,
	reported_at: "2026-11-11T11:59:58.000Z",
	tailscale: { running: true, peer_online: true },
	ssh: [{ label: "Tailscale", ok: true, latency_ms: 300 }],
	ports: [{ port: 1080, listening: true, via_thinkpad: true }],
	socks: [{ label: "IdeaMANI UAT", ok: true, http_status: 302, latency_ms: 800 }],
	duration_ms: 1200,
};

describe("payload schema", () => {
	it("accepts a real-shaped thinkpad payload (7-digit fractional seconds)", () => {
		expect(parsePayload("thinkpad", tpPayload())).toEqual({ ok: true, payload: tpPayload() });
	});

	it("accepts a mac payload", () => {
		expect(parsePayload("mac", macPayload).ok).toBe(true);
	});

	it("rejects unknown keys anywhere (no place to put a host name)", () => {
		expect(parsePayload("thinkpad", { ...tpPayload(), host: "x" }).ok).toBe(false);
		const p = tpPayload();
		const bad = { ...p, checks: [{ ...p.checks[0], host: "internal.example" }] };
		const r = parsePayload("thinkpad", bad);
		expect(r.ok).toBe(false);
		// the error names the path, never echoes the value
		if (!r.ok) expect(r.error).not.toContain("internal.example");
	});

	it.each(["app.example.com", "10.0.0.1", "https://x", "host:443", "a/b", ""])(
		"rejects label %j (looks like host/IP/URL or empty)",
		(label) => {
			const p = tpPayload();
			expect(parsePayload("thinkpad", { ...p, checks: [{ ...p.checks[0], label }] }).ok).toBe(false);
		},
	);

	it("accepts Thai labels", () => {
		const p = tpPayload();
		expect(parsePayload("thinkpad", { ...p, checks: [{ ...p.checks[0], label: "ระบบ KBS (QAS)" }] }).ok).toBe(true);
	});

	it("rejects a mac payload sent with the thinkpad token", () => {
		expect(parsePayload("thinkpad", macPayload).ok).toBe(false);
	});

	it("summarize: vpn needs adapter up AND an IPv4; kbs_ok comes from the KBS QAS API check", () => {
		expect(summarize(tpPayload())).toEqual({ vpn_up: true, kbs_ok: true });
		expect(summarize(tpPayload({ vpn: { adapter_found: true, up: true, has_ipv4: false } })).vpn_up).toBe(false);
		const p = tpPayload();
		expect(summarize({ ...p, checks: [{ ...p.checks[0], ok: false }] }).kbs_ok).toBe(false);
		expect(summarize({ ...p, checks: [] }).kbs_ok).toBeNull();
	});
});

describe("ingest token", () => {
	const tpToken = "tp-token-0123456789abcdef";
	const macToken = "mac-token-0123456789abcdef";
	const req = (auth?: string) =>
		new Request("https://x/api/thinkpad/report", { method: "POST", headers: auth ? { Authorization: auth } : {} });

	it("maps each token to its own source", async () => {
		const env = { THINKPAD_INGEST_TOKEN_SHA256: await sha256hex(tpToken), MAC_INGEST_TOKEN_SHA256: await sha256hex(macToken) };
		expect(await sourceForRequest(req(`Bearer ${tpToken}`), env)).toBe("thinkpad");
		expect(await sourceForRequest(req(`Bearer ${macToken}`), env)).toBe("mac");
	});

	it("rejects wrong, missing, malformed and unconfigured", async () => {
		const env = { THINKPAD_INGEST_TOKEN_SHA256: await sha256hex(tpToken) };
		expect(await sourceForRequest(req(`Bearer ${tpToken}x`), env)).toBeNull();
		expect(await sourceForRequest(req(), env)).toBeNull();
		expect(await sourceForRequest(req(tpToken), env)).toBeNull(); // no "Bearer"
		expect(await sourceForRequest(req("Bearer short"), env)).toBeNull();
		expect(await sourceForRequest(req(`Bearer ${tpToken}`), {})).toBeNull();
		// the secret must be a hash — storing the raw token there must not work
		expect(await sourceForRequest(req(`Bearer ${tpToken}`), { THINKPAD_INGEST_TOKEN_SHA256: tpToken })).toBeNull();
	});

	it("tolerates upper-case / padded hex in the secret", async () => {
		const env = { THINKPAD_INGEST_TOKEN_SHA256: ` ${(await sha256hex(tpToken)).toUpperCase()}\n` };
		expect(await sourceForRequest(req(`Bearer ${tpToken}`), env)).toBe("thinkpad");
	});
});

describe("page key gate", () => {
	const gate = createKeyGate("__Host-test");
	const KEY = "page-key-123";

	it("?key=right → redirect with cookie; that cookie then passes", async () => {
		let thrown: unknown;
		try {
			await gate.pageGate(new Request(`https://x/thinkpad?key=${KEY}`), KEY, "/thinkpad");
		} catch (e) {
			thrown = e;
		}
		const res = thrown as Response;
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe("/thinkpad");
		const cookie = res.headers.get("Set-Cookie") ?? "";
		expect(cookie).toContain(`__Host-test=${await sha256hex(KEY)}`);
		expect(cookie).toContain("HttpOnly");
		const pair = cookie.split(";")[0];
		await expect(gate.pageGate(new Request("https://x/thinkpad", { headers: { Cookie: pair } }), KEY, "/thinkpad")).resolves.toBeUndefined();
	});

	it("wrong key, no cookie, or unset key → 404", async () => {
		const status = async (p: Promise<void>) => {
			try {
				await p;
				return 200;
			} catch (e) {
				return (e as { init?: { status?: number } }).init?.status ?? (e as Response).status;
			}
		};
		expect(await status(gate.pageGate(new Request("https://x/thinkpad?key=nope"), KEY, "/thinkpad"))).toBe(404);
		expect(await status(gate.pageGate(new Request("https://x/thinkpad"), KEY, "/thinkpad"))).toBe(404);
		const cookie = `__Host-test=${await sha256hex(KEY)}`;
		expect(await status(gate.requireAuth(new Request("https://x/", { headers: { Cookie: cookie } }), undefined))).toBe(404);
	});
});

const pt = (minAgo: number, vpn = true, kbs: boolean | null = true): HistoryPoint => ({ t: NOW - minAgo * MIN, vpn_up: vpn, kbs_ok: kbs });
/** one heartbeat per minute from `fromMin` ago down to `toMin` ago */
const run = (fromMin: number, toMin: number, vpn = true, kbs: boolean | null = true) => {
	const out: HistoryPoint[] = [];
	for (let m = fromMin; m >= toMin; m--) out.push(pt(m, vpn, kbs));
	return out;
};

describe("online / VPN since / timeline", () => {
	it("online means a heartbeat within 3 minutes", () => {
		expect(isOnline(NOW - ONLINE_MS, NOW)).toBe(true);
		expect(isOnline(NOW - ONLINE_MS - 1, NOW)).toBe(false);
		expect(isOnline(null, NOW)).toBe(false);
	});

	it("VPN since = start of the unbroken run of VPN-up heartbeats", () => {
		const h = [...run(120, 61, false), ...run(60, 0)];
		expect(vpnSince(h, NOW, NOW - 24 * 60 * MIN)).toEqual({ since: NOW - 60 * MIN, truncated: false });
	});

	it("a gap longer than 3 minutes breaks the run (machine was off)", () => {
		const h = [...run(120, 31), ...run(20, 0)]; // 11-minute gap
		expect(vpnSince(h, NOW, NOW - 24 * 60 * MIN)?.since).toBe(NOW - 20 * MIN);
	});

	it("truncated when the run reaches the start of the window", () => {
		const start = NOW - 60 * MIN;
		expect(vpnSince(run(60, 0), NOW, start)).toEqual({ since: start, truncated: true });
	});

	it("null when offline or VPN currently down", () => {
		expect(vpnSince(run(60, 5), NOW, 0)).toBeNull();
		expect(vpnSince([...run(60, 1), pt(0, false)], NOW, 0)).toBeNull();
		expect(vpnSince([], NOW, 0)).toBeNull();
	});

	it("timeline: 288 five-minute slots classified off / ok / novpn / mixed", () => {
		const start = timelineStart(NOW);
		const at = (slot: number, k: number, vpn: boolean): HistoryPoint => ({ t: start + slot * BUCKET_MS + k * MIN, vpn_up: vpn, kbs_ok: true });
		const h = [at(0, 0, true), at(0, 1, true), at(1, 0, false), at(2, 0, true), at(2, 1, false), at(BUCKETS - 1, 4, true)];
		const tl = timeline(h, NOW);
		expect(tl.states).toHaveLength(BUCKETS);
		expect(tl.start).toBe(start);
		expect(tl.states.slice(0, 4)).toEqual(["ok", "novpn", "mixed", "off"]);
		expect(tl.states[BUCKETS - 1]).toBe("ok");
	});

	it("buildView flags sleep-on-AC that isn't Never and stale Mac data", () => {
		const v = buildView({
			now: NOW,
			thinkpad: {
				source: "thinkpad",
				received_at: NOW - MIN,
				reported_at: null,
				vpn_up: true,
				kbs_ok: true,
				payload: tpPayload({ power: { on_ac: true, battery_present: false, battery_pct: null, sleep_ac_s: 1800, hibernate_ac_s: 0 } }),
			},
			mac: { source: "mac", received_at: NOW - 30 * MIN, reported_at: null, vpn_up: null, kbs_ok: null, payload: macPayload as never },
			history: [],
			alerts: null,
		});
		expect(v.thinkpad?.online).toBe(true);
		expect(v.thinkpad?.sleep_warning).toBe(true);
		expect(v.mac?.reporting).toBe(false);
		expect(v.alerts).toEqual(EMPTY_ALERT_STATE);
	});
});

describe("alerts", () => {
	const S0 = EMPTY_ALERT_STATE;

	it("says nothing before the reporter ever reported", () => {
		expect(evaluateAlerts(NOW, null, [], S0)).toEqual({ state: S0, messages: [] });
	});

	it("offline > 10 min: one push, no repeat, then one recovery push", () => {
		const last = NOW - OFFLINE_ALERT_MS - MIN;
		const a = evaluateAlerts(NOW, last, run(40, 11), S0);
		expect(a.messages).toHaveLength(1);
		expect(a.messages[0]).toContain("ThinkPad หายไป");
		expect(a.state.offline_since).toBe(last);

		const b = evaluateAlerts(NOW + 5 * MIN, last, run(40, 11), a.state);
		expect(b.messages).toHaveLength(0);

		const back = evaluateAlerts(NOW + 30 * MIN, NOW + 29 * MIN, [{ t: NOW + 29 * MIN, vpn_up: true, kbs_ok: true }], b.state);
		expect(back.messages).toHaveLength(1);
		expect(back.messages[0]).toContain("กลับมาแล้ว");
		expect(back.state.offline_since).toBeNull();
	});

	it("exactly 10 min without heartbeat is not yet offline", () => {
		expect(evaluateAlerts(NOW, NOW - OFFLINE_ALERT_MS, run(30, 10), S0).messages).toHaveLength(0);
	});

	it("VPN down: alerts only after > 10 min of consecutive bad heartbeats", () => {
		const nine = [...run(40, 10), ...run(9, 0, false)];
		expect(evaluateAlerts(NOW, NOW, nine, S0).messages).toHaveLength(0);

		const ten = [...run(40, 11), ...run(10, 0, false)];
		const r = evaluateAlerts(NOW, NOW, ten, S0);
		expect(r.messages).toHaveLength(1);
		expect(r.messages[0]).toContain("VPN");
		expect(r.state).toEqual({ offline_since: null, degraded_since: NOW - 10 * MIN, degraded_kind: "vpn" });

		// still down next tick → no repeat
		expect(evaluateAlerts(NOW + 5 * MIN, NOW + 5 * MIN, [...ten, ...run(-1, -5, false)], r.state).messages).toHaveLength(0);

		// back → one recovery push
		const ok = evaluateAlerts(NOW + 6 * MIN, NOW + 6 * MIN, [...ten, pt(-6)], r.state);
		expect(ok.messages).toHaveLength(1);
		expect(ok.messages[0]).toContain("VPN กลับมาปกติ");
		expect(ok.state.degraded_since).toBeNull();
	});

	it("KBS QAS API failing with VPN up is its own kind", () => {
		const h = [...run(40, 13), ...run(12, 0, true, false)];
		const r = evaluateAlerts(NOW, NOW, h, S0);
		expect(r.state.degraded_kind).toBe("kbs");
		expect(r.messages[0]).toContain("KBS QAS API");
	});

	it("bad for the whole window counts from the first heartbeat in it", () => {
		const r = evaluateAlerts(NOW, NOW, run(30, 0, false), S0);
		expect(r.state.degraded_since).toBe(NOW - 30 * MIN);
	});

	it("while offline, VPN is not evaluated", () => {
		const r = evaluateAlerts(NOW, NOW - 20 * MIN, run(60, 20, false), S0);
		expect(r.messages).toHaveLength(1);
		expect(r.state.degraded_since).toBeNull();
	});

	it("a short VPN blip after coming back online doesn't alert", () => {
		const h = [...run(60, 30), ...run(2, 0, false)]; // offline 28 min, then 3 bad beats
		expect(evaluateAlerts(NOW, NOW, h, S0).messages).toHaveLength(0);
	});
});
