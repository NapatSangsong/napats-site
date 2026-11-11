import { describe, expect, it } from "vitest";
import { createKeyGate, sha256hex } from "../key-gate.server";
import { evaluateAlerts, OFFLINE_ALERT_MS } from "../thinkpad-alerts";
import { THINKPAD_PUBLIC, sourceForRequest, thinkpadGate } from "../thinkpad-auth.server";
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

describe("thinkpad page access", () => {
	it("is public: page and status API pass with no key and no cookie", async () => {
		expect(THINKPAD_PUBLIC).toBe(true);
		await expect(thinkpadGate.pageGate(new Request("https://x/thinkpad"), undefined, "/thinkpad")).resolves.toBeUndefined();
		await expect(thinkpadGate.requireAuth(new Request("https://x/api/thinkpad/status"), undefined)).resolves.toBeUndefined();
	});
});

describe("page key gate (used when THINKPAD_PUBLIC is false)", () => {
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
		expect(r.state).toMatchObject({ offline_since: null, degraded_since: NOW - 10 * MIN, degraded_kind: "vpn" });

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

// ---------------- history / new alerts ----------------
import { buildDigest, evaluateReboot, evaluateVpnExpiry, isDigestTime, willRaiseOffline } from "../thinkpad-alerts";
import { computeRuns, latencySeries, latencySeriesStart, predictVpnEnd, stats, type Run } from "../thinkpad-history";

const H = 60 * MIN;
const run2 = (vpn: boolean, startMinAgo: number, endMinAgo: number, ended_by: Run["ended_by"]): Run => ({
	vpn_up: vpn,
	start: NOW - startMinAgo * MIN,
	end: NOW - endMinAgo * MIN,
	beats: startMinAgo - endMinAgo + 1,
	ended_by,
});

describe("computeRuns (mirror of SQL thinkpad_runs)", () => {
	it("splits on VPN change and on gaps > 3 min, labels how each run ended", () => {
		const h = [...run(100, 61), ...run(60, 41, false), ...run(30, 0)]; // flip at 60, gap 41→30
		const r = computeRuns(h);
		expect(r.map((x) => [x.vpn_up, x.ended_by, x.beats])).toEqual([
			[true, "change", 40],
			[false, "offline", 20],
			[true, "last", 31],
		]);
		expect(r[0].start).toBe(NOW - 100 * MIN);
		expect(r[2].end).toBe(NOW);
	});
});

describe("7-day stats", () => {
	it("percentages, drops, offline events and longest gap", () => {
		// 10 h observed: 6 h VPN, drop, 2 h no VPN, 1 h offline gap, 1 h VPN (ongoing)
		const runs = [run2(true, 600, 241, "change"), run2(false, 240, 121, "offline"), run2(true, 60, 0, "last")];
		const s = stats(runs, NOW)!;
		expect(s.since).toBe(NOW - 600 * MIN);
		expect(s.vpn_drops).toBe(1);
		expect(s.offline_events).toBe(1);
		expect(s.longest_offline_ms).toBe(61 * MIN);
		expect(s.online_pct).toBeCloseTo(((360 + 120 + 61) / 600) * 100, 0);
		expect(s.vpn_pct).toBeCloseTo(((360 + 61) / 600) * 100, 0);
		expect(s.days).toHaveLength(7);
		expect(s.days.slice(0, 5).every((d) => d.vpn_pct == null)).toBe(true);
	});

	it("counts the current outage when offline now", () => {
		const s = stats([run2(true, 120, 30, "last")], NOW)!;
		expect(s.offline_events).toBe(1);
		expect(s.longest_offline_ms).toBe(30 * MIN);
	});

	it("null without data", () => {
		expect(stats([], NOW)).toBeNull();
	});
});

describe("VPN session prediction", () => {
	const sessions = (lens: number[]) => {
		const out: Run[] = [];
		let t = 30 * 24 * 60; // minutes ago
		for (const len of lens) {
			out.push(run2(true, t, t - len + 1, "change"));
			out.push(run2(false, t - len, t - len - 10, "change"));
			t -= len + 11;
		}
		return out;
	};

	it("needs at least 2 completed sessions", () => {
		expect(predictVpnEnd(sessions([720]), NOW)).toMatchObject({ n: 1, consistent: false, predicted_end: null });
	});

	it("consistent sessions predict the end of the current one", () => {
		const runs = [...sessions([720, 715, 722]), run2(true, 700, 0, "last")];
		const p = predictVpnEnd(runs, NOW);
		expect(p).toMatchObject({ n: 3, consistent: true, typical_ms: 720 * MIN, current_start: NOW - 700 * MIN });
		expect(p.predicted_end).toBe(NOW + 20 * MIN);
	});

	it("scattered sessions are not a fixed limit", () => {
		const p = predictVpnEnd([...sessions([120, 600, 900]), run2(true, 30, 0, "last")], NOW);
		expect(p.consistent).toBe(false);
		expect(p.predicted_end).toBeNull();
	});

	it("short sessions (< 30 min) and offline-ended runs don't count", () => {
		const runs = [run2(true, 900, 880, "change"), run2(true, 800, 100, "offline"), run2(true, 60, 0, "last")];
		expect(predictVpnEnd(runs, NOW).n).toBe(0);
	});

	it("warns once, 30 min ahead, per VPN run", () => {
		const runs = [...sessions([720, 715, 722]), run2(true, 700, 0, "last")];
		const p = predictVpnEnd(runs, NOW);
		const a = evaluateVpnExpiry(EMPTY_ALERT_STATE, p, NOW);
		expect(a.messages).toHaveLength(1);
		expect(a.messages[0]).toContain("น่าจะหลุด");
		expect(evaluateVpnExpiry(a.state, p, NOW + MIN).messages).toHaveLength(0);
		expect(evaluateVpnExpiry(EMPTY_ALERT_STATE, p, NOW - 20 * MIN).messages).toHaveLength(0); // 40 min left
	});
});

describe("latency series", () => {
	it("places 15-min buckets on a 96-slot axis", () => {
		const start = latencySeriesStart(NOW);
		const l = latencySeries(
			[
				{ bucket: start, label: "A", avg_ms: 100, fails: 0, samples: 15 },
				{ bucket: start + 95 * 15 * MIN, label: "A", avg_ms: 300, fails: 2, samples: 15 },
				{ bucket: start - 15 * MIN, label: "A", avg_ms: 999, fails: 0, samples: 1 },
			],
			NOW,
		);
		expect(l.series.A.avg).toHaveLength(96);
		expect(l.series.A.avg[0]).toBe(100);
		expect(l.series.A.avg[95]).toBe(300);
		expect(l.series.A.fails[95]).toBe(2);
		expect(l.series.A.avg.filter((v) => v != null)).toHaveLength(2);
	});
});

describe("new alerts", () => {
	const row = (over: Partial<ThinkpadPayload> = {}, ageMin = 0, uptimeS = 3600) => ({
		source: "thinkpad" as const,
		received_at: NOW - ageMin * MIN,
		reported_at: null,
		vpn_up: true,
		kbs_ok: true,
		payload: tpPayload({ uptime_s: uptimeS, ...over }),
	});

	it("offline alert says power cut / home internet when the house meter is offline too", () => {
		const last = NOW - 15 * MIN;
		expect(willRaiseOffline(NOW, last, EMPTY_ALERT_STATE)).toBe(true);
		expect(evaluateAlerts(NOW, last, [], EMPTY_ALERT_STATE, { homeMeterOnline: false }).messages[0]).toContain("ไฟดับ");
		expect(evaluateAlerts(NOW, last, [], EMPTY_ALERT_STATE, { homeMeterOnline: true }).messages[0]).toContain("บ้านมีไฟ");
		expect(willRaiseOffline(NOW, last, { ...EMPTY_ALERT_STATE, offline_since: last })).toBe(false);
	});

	it("VPN-down alert points at home internet when the Internet check fails", () => {
		const h = [...run(40, 11), ...run(10, 0, false)];
		expect(evaluateAlerts(NOW, NOW, h, EMPTY_ALERT_STATE, { internetOk: false }).messages[0]).toContain("เน็ตบ้าน");
	});

	it("Windows Update restart pending: one warning with the restart window, cleared silently", () => {
		const pending = row({ windows_update: { reboot_required: true, active_hours: { start: 5, end: 18 } } });
		const a = evaluateReboot(EMPTY_ALERT_STATE, pending, NOW);
		expect(a.messages).toHaveLength(1);
		expect(a.messages[0]).toContain("18:00–05:00");
		expect(evaluateReboot(a.state, pending, NOW + 5 * MIN).messages).toHaveLength(0);
		const clear = evaluateReboot(a.state, { ...row({ windows_update: { reboot_required: false, active_hours: null } }), received_at: NOW + 10 * MIN }, NOW + 10 * MIN);
		expect(clear.state.reboot_pending_since).toBeNull();
	});

	it("a boot-time jump is reported as a restart, with VPN state", () => {
		const before = evaluateReboot(EMPTY_ALERT_STATE, row({}, 0, 36000), NOW);
		expect(before.messages).toHaveLength(0);
		const after = evaluateReboot(before.state, { ...row({ vpn: { adapter_found: true, up: false, has_ipv4: false } }, 0, 300), received_at: NOW + 10 * MIN }, NOW + 10 * MIN);
		expect(after.messages[0]).toContain("restart");
		expect(after.messages[0]).toContain("VPN ยังไม่ได้ต่อ");
	});

	it("stale heartbeat: no reboot judgement", () => {
		const r = evaluateReboot(EMPTY_ALERT_STATE, row({ windows_update: { reboot_required: true, active_hours: null } }, 10), NOW);
		expect(r.messages).toHaveLength(0);
	});

	it("digest only Mon–Fri 08:xx Bangkok", () => {
		expect(isDigestTime(Date.UTC(2026, 10, 11, 1, 30))).toBe(true); // Wed 08:30 BKK
		expect(isDigestTime(Date.UTC(2026, 10, 11, 2, 0))).toBe(false); // 09:00
		expect(isDigestTime(Date.UTC(2026, 10, 14, 1, 30))).toBe(false); // Sat
	});

	it("digest text: ready / not ready", () => {
		const base = buildView({ now: NOW, thinkpad: row(), mac: null, history: run(30, 0), alerts: null, runs: computeRuns(run(30, 0)) });
		expect(buildDigest(base)).toContain("พร้อมทำงาน");
		const p = tpPayload();
		const bad = buildView({ now: NOW, thinkpad: row({ checks: [{ ...p.checks[0], ok: false }] }), mac: null, history: [], alerts: null });
		expect(buildDigest(bad)).toContain("เข้าไม่ได้: KBS QAS API");
	});

	it("schema accepts the new optional fields and still accepts old payloads", () => {
		expect(parsePayload("thinkpad", tpPayload({ windows_update: { reboot_required: true, active_hours: { start: 5, end: 18 } }, wifi: { connected: true, signal_pct: 92, rx_mbps: 2402 } })).ok).toBe(true);
		expect(parsePayload("thinkpad", tpPayload()).ok).toBe(true);
		expect(parsePayload("thinkpad", { ...tpPayload(), wifi: { connected: true, signal_pct: 92, rx_mbps: 1, ssid: "home" } }).ok).toBe(false);
	});
});

describe("mac tunnel auto-heal payload", () => {
	it("accepts heal events, rejects unknown actions", () => {
		const ok = { ...macPayload, tunnel_heal: { enabled: true, events: [{ port: 1080, action: "opened", at: "2026-11-11T13:00:00.000Z" }] } };
		expect(parsePayload("mac", ok).ok).toBe(true);
		const bad = { ...macPayload, tunnel_heal: { enabled: true, events: [{ port: 1080, action: "killed", at: "2026-11-11T13:00:00.000Z" }] } };
		expect(parsePayload("mac", bad).ok).toBe(false);
		expect(parsePayload("mac", macPayload).ok).toBe(true);
	});
});

// ---------------- round 3: reconnect stats, health, LINE ----------------
import { evaluateHealth } from "../thinkpad-alerts";
import { verifyLineSignature } from "../line.server";

describe("reconnect time and drops by hour", () => {
	it("measures VPN down → up while online, and buckets drops by BKK hour", () => {
		const runs = [
			run2(true, 300, 201, "change"), // drop at NOW-201min
			run2(false, 200, 181, "change"), // back up after ~20 min
			run2(true, 180, 61, "change"), // drop again
			run2(false, 60, 51, "change"),
			run2(true, 50, 0, "last"),
		];
		const s = stats(runs, NOW)!;
		expect(s.vpn_drops).toBe(2);
		expect(s.reconnect_last_ms).toBe(11 * MIN); // 61 → 50
		expect(s.reconnect_avg_ms).toBe(((21 + 11) / 2) * MIN);
		const hourOf = (minAgo: number) => new Date(NOW - minAgo * MIN + 7 * 3600_000).getUTCHours();
		expect(s.drops_by_hour[hourOf(201)] + (hourOf(201) === hourOf(61) ? 0 : s.drops_by_hour[hourOf(61)])).toBe(2);
		expect(s.drops_by_hour.reduce((a, b) => a + b, 0)).toBe(2);
	});
});

describe("disk alert", () => {
	const row = (pct: number, at = NOW) => ({
		source: "thinkpad" as const,
		received_at: at,
		reported_at: null,
		vpn_up: true,
		kbs_ok: true,
		payload: tpPayload({ health: { disk_free_gb: pct, disk_free_pct: pct, mem_used_pct: 30, cpu_pct: 3 } }),
	});
	it("warns once under 10 %, clears only at 12 % or more", () => {
		const a = evaluateHealth(EMPTY_ALERT_STATE, row(9), NOW);
		expect(a.messages).toHaveLength(1);
		expect(a.messages[0]).toContain("ดิสก์");
		expect(evaluateHealth(a.state, row(11, NOW + MIN), NOW + MIN).state.disk_low_since).not.toBeNull();
		expect(evaluateHealth(a.state, row(9, NOW + MIN), NOW + MIN).messages).toHaveLength(0);
		expect(evaluateHealth(a.state, row(12, NOW + MIN), NOW + MIN).state.disk_low_since).toBeNull();
		expect(evaluateHealth(EMPTY_ALERT_STATE, row(12), NOW).messages).toHaveLength(0);
	});
});

describe("CRD link and status reply", () => {
	it("VPN-down alert carries the Remote Desktop link", () => {
		const h = [...run(40, 11), ...run(10, 0, false)];
		expect(evaluateAlerts(NOW, NOW, h, EMPTY_ALERT_STATE, { crdUrl: "https://crd.example/x" }).messages[0]).toContain("https://crd.example/x");
	});
	it("status reply uses the 'now' header and adds the CRD link when VPN is down", () => {
		const v = buildView({
			now: NOW,
			thinkpad: { source: "thinkpad", received_at: NOW, reported_at: null, vpn_up: false, kbs_ok: true, payload: tpPayload({ vpn: { adapter_found: true, up: false, has_ipv4: false } }) },
			mac: null,
			history: [],
			alerts: null,
			crdUrl: "https://crd.example/x",
		});
		const t = buildDigest(v, "status");
		expect(t).toContain("📟 ตอนนี้");
		expect(t).toContain("https://crd.example/x");
	});
});

describe("LINE webhook signature", () => {
	it("accepts the right HMAC and rejects anything else", async () => {
		const secret = "channel-secret";
		const body = '{"events":[]}';
		const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
		const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
		const sig = btoa(String.fromCharCode(...mac));
		expect(await verifyLineSignature(secret, body, sig)).toBe(true);
		expect(await verifyLineSignature(secret, body + " ", sig)).toBe(false);
		expect(await verifyLineSignature(secret, body, null)).toBe(false);
		expect(await verifyLineSignature("", body, sig)).toBe(false);
	});
});

// ---------------- remote VPN command ----------------
import { commandStatusSchema, commandStatusText, encryptForThinkpad, parseVpnCommand } from "../thinkpad-command.server";

describe("LINE vpn command", () => {
	it("parses user + password (password may contain spaces), password only, and bare vpn", () => {
		expect(parseVpnCommand("vpn alice s3cr3t")).toEqual({ user: "alice", password: "s3cr3t" });
		expect(parseVpnCommand("VPN alice pass with  spaces")).toEqual({ user: "alice", password: "pass with  spaces" });
		expect(parseVpnCommand("vpn onlypass")).toEqual({ user: "", password: "onlypass" });
		expect(parseVpnCommand("vpn")).toEqual({ usage: true });
		expect(parseVpnCommand("status")).toBeNull();
		expect(parseVpnCommand("vpnx a b")).toBeNull();
	});

	it("encrypts so only the private key can read it (RSA-OAEP-256)", async () => {
		const kp = (await crypto.subtle.generateKey(
			{ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
			true,
			["encrypt", "decrypt"],
		)) as CryptoKeyPair;
		const jwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
		const enc = await encryptForThinkpad(JSON.stringify(jwk), { u: "alice", p: "s3cr3t" });
		expect(enc).not.toContain("s3cr3t");
		const pt = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, kp.privateKey, Uint8Array.from(atob(enc), (c) => c.charCodeAt(0)));
		expect(JSON.parse(new TextDecoder().decode(pt))).toEqual({ u: "alice", p: "s3cr3t" });
	});

	it("progress reports: number shown big, no host-like detail accepted", () => {
		expect(commandStatusText({ id: "ab12", stage: "need_number", number: "42" }, "x")).toContain("\n42\n");
		expect(commandStatusText({ id: "ab12", stage: "failed", detail: "timeout" }, "https://crd")).toContain("https://crd");
		expect(commandStatusSchema.safeParse({ id: "ab12", stage: "need_number", number: "42" }).success).toBe(true);
		expect(commandStatusSchema.safeParse({ id: "ab12", stage: "failed", detail: "vpn.example.com down" }).success).toBe(false);
		expect(commandStatusSchema.safeParse({ id: "ab12", stage: "need_number", number: "4x" }).success).toBe(false);
		expect(commandStatusSchema.safeParse({ id: "ab12", stage: "hack" }).success).toBe(false);
	});
});
