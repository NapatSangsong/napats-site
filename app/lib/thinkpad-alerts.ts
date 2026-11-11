/**
 * Pure alert state machine for the ThinkPad (no I/O, unit-tested).
 *
 * Two incidents, each pushed once when it starts and once when it clears:
 *  - offline:  no heartbeat for > OFFLINE_ALERT_MS
 *  - degraded: VPN adapter down, or the "KBS QAS API" check failing, on every
 *              heartbeat for > DEGRADED_ALERT_MS (ignored while offline)
 */
import type { Prediction } from "./thinkpad-history";
import type { ThinkpadPayload } from "./thinkpad-schema";
import type { HistoryPoint, StoredRow } from "./thinkpad-store.server";
import { isOnline, type AlertState, type StatusView } from "./thinkpad-status";

export const OFFLINE_ALERT_MS = 10 * 60_000;
export const DEGRADED_ALERT_MS = 10 * 60_000;
export const PAGE_URL = "https://ai.napats.dev/thinkpad";

const isBad = (p: HistoryPoint) => p.vpn_up !== true || p.kbs_ok === false;

const hhmm = (ms: number) =>
	new Date(ms).toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
const mins = (ms: number) => Math.max(1, Math.round(ms / 60_000));

/**
 * @param lastSeen  received_at of the latest thinkpad heartbeat (null = never reported)
 * @param recent    thinkpad heartbeats of the last ~hour, ascending
 */
export interface AlertContext {
	/** house meter on Tuya cloud at the time the offline alert fires (null = unknown) */
	homeMeterOnline?: boolean | null;
	/** latest "Internet" check from the ThinkPad (null/undefined = not configured) */
	internetOk?: boolean | null;
	/** Chrome Remote Desktop link added to messages that need hands on the ThinkPad */
	crdUrl?: string;
}

const crdLine = (url?: string) => (url ? `\nเปิด Chrome Remote Desktop: ${url}` : "");

/** true when this tick would raise the offline incident (caller then looks up the meter) */
export function willRaiseOffline(now: number, lastSeen: number | null, prev: AlertState): boolean {
	return lastSeen != null && now - lastSeen > OFFLINE_ALERT_MS && prev.offline_since == null;
}

function offlineHint(meter: boolean | null | undefined): string {
	if (meter === false) return "มิเตอร์ไฟบ้านก็ offline ด้วย → น่าจะไฟดับหรือเน็ตบ้านล่ม";
	if (meter === true) return "มิเตอร์ไฟบ้านยัง online (บ้านมีไฟ/เน็ต) → ThinkPad ค้าง หลับ ปิด หรือ task หยุด";
	return "เครื่องดับ/หลับ/เน็ตหลุด หรือ task หยุด";
}

export function evaluateAlerts(
	now: number,
	lastSeen: number | null,
	recent: HistoryPoint[],
	prev: AlertState,
	ctx: AlertContext = {},
): { state: AlertState; messages: string[] } {
	const state: AlertState = { ...prev };
	const messages: string[] = [];
	if (lastSeen == null) return { state, messages }; // reporter not set up yet — nothing to say

	// ---- offline ----
	const offline = now - lastSeen > OFFLINE_ALERT_MS;
	if (offline) {
		if (state.offline_since == null) {
			state.offline_since = lastSeen;
			messages.push(
				`🔴 ThinkPad หายไป — ไม่มี heartbeat ตั้งแต่ ${hhmm(lastSeen)} (${mins(now - lastSeen)} นาที)\n${offlineHint(ctx.homeMeterOnline)}\n${PAGE_URL}${crdLine(ctx.crdUrl)}`,
			);
		}
		return { state, messages }; // VPN state is unknowable while offline
	}
	if (state.offline_since != null) {
		messages.push(`✅ ThinkPad กลับมาแล้ว (หายไปราว ${mins(now - state.offline_since)} นาที)\n${PAGE_URL}`);
		state.offline_since = null;
	}

	// ---- degraded (VPN down / KBS QAS API failing) ----
	const n = recent.length;
	if (n === 0) return { state, messages };
	const latest = recent[n - 1];
	if (!isBad(latest)) {
		if (state.degraded_since != null) {
			const what = state.degraded_kind === "vpn" ? "VPN" : "KBS QAS API";
			messages.push(
				`✅ ${what} กลับมาปกติ (ผิดปกติราว ${mins(now - state.degraded_since)} นาที ตั้งแต่ ${hhmm(state.degraded_since)})\n${PAGE_URL}`,
			);
			state.degraded_since = null;
			state.degraded_kind = null;
		}
		return { state, messages };
	}
	if (state.degraded_since != null) return { state, messages }; // already alerted

	let g = n - 1;
	while (g >= 0 && isBad(recent[g])) g--;
	const streakStart = recent[g + 1].t; // g = -1 → bad for the whole window
	if (now - streakStart < DEGRADED_ALERT_MS) return { state, messages };

	const kind = latest.vpn_up !== true ? "vpn" : "kbs";
	state.degraded_since = streakStart;
	state.degraded_kind = kind;
	messages.push(
		kind === "vpn"
			? `🔴 VPN บน ThinkPad หลุด — adapter ของ Cisco ไม่ขึ้นตั้งแต่ ${hhmm(streakStart)} (${mins(now - streakStart)} นาที)\n${ctx.internetOk === false ? "เน็ตบ้านจาก ThinkPad ก็ออกไม่ได้ด้วย → ดูเน็ตบ้านก่อน\n" : ""}ต่อใหม่ผ่าน Chrome Remote Desktop\n${PAGE_URL}${crdLine(ctx.crdUrl)}`
			: `🟠 KBS QAS API เข้าไม่ได้จาก ThinkPad ตั้งแต่ ${hhmm(streakStart)} (${mins(now - streakStart)} นาที) — VPN adapter ยังขึ้นอยู่\n${PAGE_URL}`,
	);
	return { state, messages };
}

// ---------- Windows restart ----------

const RESTART_JUMP_MS = 5 * 60_000;
const two = (h: number) => String(h).padStart(2, "0");

/**
 * Windows Update restart pending → warn once (Windows may restart by itself
 * outside active hours, and the VPN then needs a manual reconnect).
 * Boot time moved → the machine restarted: say so, with the VPN state.
 * Only judged on a fresh heartbeat.
 */
export function evaluateReboot(
	prev: AlertState,
	latest: StoredRow | null,
	now: number,
	crdUrl?: string,
): { state: AlertState; messages: string[] } {
	const state: AlertState = { ...prev };
	const messages: string[] = [];
	if (!latest || latest.source !== "thinkpad" || !isOnline(latest.received_at, now)) return { state, messages };
	const p = latest.payload as ThinkpadPayload;

	const bootAt = latest.received_at - p.uptime_s * 1000;
	if (state.boot_at != null && Math.abs(bootAt - state.boot_at) > RESTART_JUMP_MS) {
		const vpn = p.vpn.up && p.vpn.has_ipv4 ? "VPN ต่ออยู่แล้ว ✅" : "VPN ยังไม่ได้ต่อ → ต่อใหม่ผ่าน Chrome Remote Desktop";
		const vpnUp = p.vpn.up && p.vpn.has_ipv4;
		messages.push(`🔄 ThinkPad เพิ่ง restart เมื่อ ${hhmm(bootAt)}\n${vpn}\n${PAGE_URL}${vpnUp ? "" : crdLine(crdUrl)}`);
	}
	state.boot_at = bootAt;

	const wu = p.windows_update;
	if (wu?.reboot_required) {
		if (state.reboot_pending_since == null) {
			state.reboot_pending_since = now;
			const ah = wu.active_hours;
			const when = ah ? `นอก active hours (${two(ah.end)}:00–${two(ah.start)}:00)` : "เมื่อไรก็ได้";
			messages.push(
				`⚠️ Windows Update บน ThinkPad รอ restart\nWindows อาจ restart เอง${when} แล้ว VPN จะหลุดจนกว่าจะต่อใหม่\nเลื่อนหรือ restart เองตอนสะดวกผ่าน Chrome Remote Desktop\n${PAGE_URL}${crdLine(crdUrl)}`,
			);
		}
	} else if (wu && state.reboot_pending_since != null) {
		state.reboot_pending_since = null;
	}
	return { state, messages };
}

// ---------- VPN session about to end ----------

export const VPN_WARN_BEFORE_MS = 30 * 60_000;

export function evaluateVpnExpiry(prev: AlertState, pred: Prediction, now: number): { state: AlertState; messages: string[] } {
	const state: AlertState = { ...prev };
	const messages: string[] = [];
	if (!pred.consistent || pred.predicted_end == null || pred.current_start == null || pred.typical_ms == null) return { state, messages };
	const left = pred.predicted_end - now;
	if (left > 0 && left <= VPN_WARN_BEFORE_MS && state.vpn_warned_run !== pred.current_start) {
		state.vpn_warned_run = pred.current_start;
		const h = Math.floor(pred.typical_ms / 3600_000);
		const m = Math.round((pred.typical_ms % 3600_000) / 60_000);
		messages.push(
			`⏳ VPN บน ThinkPad น่าจะหลุดราว ${hhmm(pred.predicted_end)} (อีก ~${mins(left)} นาที)\nsession ปกติยาว ~${h} ชม. ${m} นาที (จาก ${pred.n} ครั้งที่ผ่านมา)\n${PAGE_URL}`,
		);
	}
	return { state, messages };
}

// ---------- weekday morning digest ----------

export const DIGEST_HOUR_BKK = 8;

/** Mon–Fri, 08:00–08:59 Bangkok */
export function isDigestTime(now: number): boolean {
	const bkk = new Date(now + 7 * 3600_000);
	const wd = bkk.getUTCDay();
	return wd >= 1 && wd <= 5 && bkk.getUTCHours() === DIGEST_HOUR_BKK;
}

export function digestKey(now: number): string {
	return `thinkpad:digest:${new Date(now + 7 * 3600_000).toISOString().slice(0, 10)}`;
}

/** weekday digest ("digest") or the reply to a LINE "status" command ("status") */
export function buildDigest(v: StatusView, kind: "digest" | "status" = "digest"): string {
	const lines: string[] = [];
	const tp = v.thinkpad;
	const head = kind === "digest" ? "☀️ เช้านี้" : `📟 ตอนนี้ (${hhmm(v.now)})`;
	if (!tp) return `${head} ThinkPad ยังไม่เคยรายงาน\n${PAGE_URL}`;
	if (!tp.online) {
		lines.push(`${head} ThinkPad ออฟไลน์ ❌ (เห็นล่าสุด ${hhmm(tp.last_seen)})`);
		if (v.home_meter_online === false) lines.push("· มิเตอร์ไฟบ้านก็ offline → น่าจะไฟดับหรือเน็ตบ้านล่ม");
		else if (v.home_meter_online === true) lines.push("· มิเตอร์ไฟบ้านยัง online → ปัญหาอยู่ที่ ThinkPad");
	} else {
		const vpnOk = tp.data.vpn.up && tp.data.vpn.has_ipv4;
		const fails = tp.data.checks.filter((c) => !c.ok).map((c) => c.label);
		lines.push(
			vpnOk && fails.length === 0 ? `${head}พร้อมทำงาน ✅` : `${head}ยังไม่พร้อม ⚠️`,
			vpnOk
				? `· VPN ต่ออยู่${tp.vpn_since ? ` ตั้งแต่ ${hhmm(tp.vpn_since.since)}${tp.vpn_since.truncated ? "+" : ""}` : ""}`
				: "· VPN ไม่ได้ต่อ → ต่อผ่าน Chrome Remote Desktop",
			fails.length ? `· เข้าไม่ได้: ${fails.join(", ")}` : `· ระบบภายในเข้าได้ครบ ${tp.data.checks.length} ระบบ`,
		);
		if (tp.data.windows_update?.reboot_required) lines.push("· ⚠️ Windows Update รอ restart อยู่");
		const h = tp.data.health;
		if (h?.disk_free_pct != null && h.disk_free_pct < DISK_LOW_PCT) lines.push(`· 💾 ดิสก์เหลือ ${h.disk_free_pct.toFixed(0)}%`);
		const pred = v.history.prediction;
		if (pred.predicted_end && pred.predicted_end > v.now) lines.push(`· VPN น่าจะหลุดราว ${hhmm(pred.predicted_end)}`);
	}
	const st = v.history.stats;
	if (st) lines.push(`· 7 วัน: online ${st.online_pct.toFixed(0)}% · VPN ${st.vpn_pct.toFixed(0)}% · VPN หลุด ${st.vpn_drops} ครั้ง`);
	if (v.mac) lines.push(`· Mac: ${v.mac.reporting ? "รายงานอยู่" : "ไม่ได้รายงาน"}`);
	lines.push(PAGE_URL);
	if (!tp.online || !(tp.data.vpn.up && tp.data.vpn.has_ipv4)) lines.push(`เปิด Chrome Remote Desktop: ${v.crd_url}`);
	return lines.join("\n");
}

// ---------- machine health ----------

export const DISK_LOW_PCT = 10;
const DISK_OK_PCT = 12; // hysteresis so a disk hovering at 10 % doesn't flap

export function evaluateHealth(prev: AlertState, latest: StoredRow | null, now: number): { state: AlertState; messages: string[] } {
	const state: AlertState = { ...prev };
	const messages: string[] = [];
	if (!latest || latest.source !== "thinkpad" || !isOnline(latest.received_at, now)) return { state, messages };
	const h = (latest.payload as ThinkpadPayload).health;
	if (!h || h.disk_free_pct == null) return { state, messages };
	if (h.disk_free_pct < DISK_LOW_PCT && state.disk_low_since == null) {
		state.disk_low_since = now;
		messages.push(
			`💾 ดิสก์ ThinkPad เหลือ ${h.disk_free_pct.toFixed(0)}%${h.disk_free_gb != null ? ` (${h.disk_free_gb.toFixed(0)} GB)` : ""}\nถ้าเต็ม Windows Update และ VPN อาจมีปัญหา — ลบไฟล์ที่ไม่ใช้ออกบ้าง\n${PAGE_URL}`,
		);
	} else if (h.disk_free_pct >= DISK_OK_PCT && state.disk_low_since != null) {
		state.disk_low_since = null;
	}
	return { state, messages };
}
