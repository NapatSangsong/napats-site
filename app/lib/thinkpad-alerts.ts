/**
 * Pure alert state machine for the ThinkPad (no I/O, unit-tested).
 *
 * Two incidents, each pushed once when it starts and once when it clears:
 *  - offline:  no heartbeat for > OFFLINE_ALERT_MS
 *  - degraded: VPN adapter down, or the "KBS QAS API" check failing, on every
 *              heartbeat for > DEGRADED_ALERT_MS (ignored while offline)
 */
import type { HistoryPoint } from "./thinkpad-store.server";
import type { AlertState } from "./thinkpad-status";

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
export function evaluateAlerts(
	now: number,
	lastSeen: number | null,
	recent: HistoryPoint[],
	prev: AlertState,
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
				`🔴 ThinkPad หายไป — ไม่มี heartbeat ตั้งแต่ ${hhmm(lastSeen)} (${mins(now - lastSeen)} นาที)\nเครื่องดับ/หลับ/เน็ตหลุด หรือ task หยุด\n${PAGE_URL}`,
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
			? `🔴 VPN บน ThinkPad หลุด — adapter ของ Cisco ไม่ขึ้นตั้งแต่ ${hhmm(streakStart)} (${mins(now - streakStart)} นาที)\nต่อใหม่ผ่าน Chrome Remote Desktop\n${PAGE_URL}`
			: `🟠 KBS QAS API เข้าไม่ได้จาก ThinkPad ตั้งแต่ ${hhmm(streakStart)} (${mins(now - streakStart)} นาที) — VPN adapter ยังขึ้นอยู่\n${PAGE_URL}`,
	);
	return { state, messages };
}
