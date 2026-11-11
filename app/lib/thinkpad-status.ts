/**
 * Pure status math for /thinkpad — no I/O, unit-tested.
 * All times are ms epoch on the SERVER clock (received_at), so a drifting
 * reporter clock can't make a dead machine look alive.
 */
import { latencySeries, predictVpnEnd, stats, type LatencyRow, type LatencySeries, type Prediction, type Run, type Stats } from "./thinkpad-history";
import type { MacPayload, ThinkpadPayload } from "./thinkpad-schema";
import type { HistoryPoint, StoredRow } from "./thinkpad-store.server";

export const ONLINE_MS = 3 * 60_000; // no heartbeat for longer than this = offline
export const BUCKET_MS = 5 * 60_000; // history bar resolution
export const WINDOW_MS = 24 * 3600_000; // history bar span
export const BUCKETS = WINDOW_MS / BUCKET_MS; // 288

export function isOnline(receivedAt: number | null | undefined, now: number): boolean {
	return receivedAt != null && now - receivedAt <= ONLINE_MS;
}

const good = (p: HistoryPoint) => p.vpn_up === true;

/**
 * Start of the current unbroken "VPN up" run: walk back from the latest
 * heartbeat while each earlier one also had VPN up and no gap exceeded
 * ONLINE_MS. `truncated` = the run reaches the start of the queried window,
 * so the real start is earlier than we can see.
 */
export function vpnSince(
	history: HistoryPoint[],
	now: number,
	windowStart: number,
): { since: number; truncated: boolean } | null {
	const n = history.length;
	if (n === 0) return null;
	const last = history[n - 1];
	if (!isOnline(last.t, now) || !good(last)) return null;
	let i = n - 1;
	while (i > 0 && good(history[i - 1]) && history[i].t - history[i - 1].t <= ONLINE_MS) i--;
	return { since: history[i].t, truncated: i === 0 && history[0].t - windowStart <= ONLINE_MS };
}

/** off = no heartbeat in the slot; ok = all heartbeats VPN up; novpn = none; mixed = some */
export type BucketState = "off" | "ok" | "novpn" | "mixed";

export function timelineStart(now: number): number {
	return Math.ceil(now / BUCKET_MS) * BUCKET_MS - WINDOW_MS;
}

export function timeline(history: HistoryPoint[], now: number): { start: number; bucketMs: number; states: BucketState[] } {
	const start = timelineStart(now);
	const total = new Array<number>(BUCKETS).fill(0);
	const up = new Array<number>(BUCKETS).fill(0);
	for (const p of history) {
		const i = Math.floor((p.t - start) / BUCKET_MS);
		if (i < 0 || i >= BUCKETS) continue;
		total[i]++;
		if (good(p)) up[i]++;
	}
	const states = total.map<BucketState>((t, i) => (t === 0 ? "off" : up[i] === t ? "ok" : up[i] === 0 ? "novpn" : "mixed"));
	return { start, bucketMs: BUCKET_MS, states };
}

export interface AlertState {
	/** last heartbeat time when the "ThinkPad gone" incident was raised */
	offline_since: number | null;
	/** first bad heartbeat of the "VPN down / KBS fail" incident */
	degraded_since: number | null;
	degraded_kind: "vpn" | "kbs" | null;
	/** first time a Windows Update restart was seen pending */
	reboot_pending_since: number | null;
	/** last known boot time (received_at − uptime), to spot restarts */
	boot_at: number | null;
	/** start of the VPN run we already sent the "session ending soon" warning for */
	vpn_warned_run: number | null;
}

export const EMPTY_ALERT_STATE: AlertState = {
	offline_since: null,
	degraded_since: null,
	degraded_kind: null,
	reboot_pending_since: null,
	boot_at: null,
	vpn_warned_run: null,
};

export interface StatusView {
	now: number;
	thinkpad: null | {
		online: boolean;
		last_seen: number;
		data: ThinkpadPayload;
		/** sleep on AC isn't "Never" (or couldn't be read) */
		sleep_warning: boolean;
		vpn_since: { since: number; truncated: boolean } | null;
	};
	mac: null | {
		reporting: boolean;
		last_seen: number;
		data: MacPayload;
	};
	timeline: { start: number; bucketMs: number; states: BucketState[] };
	alerts: AlertState;
	history: {
		stats: Stats | null;
		prediction: Prediction;
		latency: LatencySeries;
	};
	/** house meter on Tuya cloud — only looked up while the ThinkPad is offline */
	home_meter_online?: boolean | null;
}

export function buildView(args: {
	now: number;
	thinkpad: StoredRow | null;
	mac: StoredRow | null;
	history: HistoryPoint[];
	alerts: AlertState | null;
	runs?: Run[];
	latency?: LatencyRow[];
	homeMeterOnline?: boolean | null;
}): StatusView {
	const { now, thinkpad, mac, history } = args;
	const start = timelineStart(now);
	let tp: StatusView["thinkpad"] = null;
	if (thinkpad) {
		const data = thinkpad.payload as ThinkpadPayload;
		tp = {
			online: isOnline(thinkpad.received_at, now),
			last_seen: thinkpad.received_at,
			data,
			sleep_warning: data.power.sleep_ac_s !== 0,
			vpn_since: vpnSince(history, now, start),
		};
	}
	return {
		now,
		thinkpad: tp,
		mac: mac
			? { reporting: isOnline(mac.received_at, now), last_seen: mac.received_at, data: mac.payload as MacPayload }
			: null,
		timeline: timeline(history, now),
		alerts: { ...EMPTY_ALERT_STATE, ...(args.alerts ?? {}) },
		history: {
			stats: stats(args.runs ?? [], now),
			prediction: predictVpnEnd(args.runs ?? [], now),
			latency: latencySeries(args.latency ?? [], now),
		},
		...(args.homeMeterOnline !== undefined ? { home_meter_online: args.homeMeterOnline } : {}),
	};
}
