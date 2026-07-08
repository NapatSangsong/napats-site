import { useCallback, useEffect, useRef, useState } from "react";
import { calcAll, type CalcResult } from "~/lib/energy-calc";
import type { ApiStats, LiveData } from "~/components/energy/types";

const LIVE_POLL_MS = 30_000;
const HISTORY_POLL_MS = 5 * 60_000;
const LIVE_TIMEOUT_MS = 15_000;
const HISTORY_TIMEOUT_MS = 20_000;

export const SOLAR_PR_BY_CASE = { worst: 0.75, best: 0.85, ideal: 1.0 } as const;
export type SolarCase = keyof typeof SOLAR_PR_BY_CASE;
export const SOLAR_CASE_LABEL: Record<SolarCase, string> = {
	worst: "Worst 0.75",
	best: "Best 0.85",
	ideal: "Ideal 1.0",
};

export type DataStatus = "loading" | "ready" | "error-history" | "error-empty";

const INIT_STATS: ApiStats = {
	liveEndpoint: "/api/energy/live",
	historyEndpoint: "/api/energy/history?days=30",
	liveLatencyMs: null,
	historyLatencyMs: null,
	liveFetches: 0,
	historyFetches: 0,
	historyRows: 0,
	historyFetchedAt: null,
	liveOffline: false,
};

export function useEnergyData() {
	const [calc, setCalc] = useState<CalcResult | null>(null);
	const [live, setLive] = useState<LiveData | null>(null);
	const [liveOffline, setLiveOffline] = useState(false);
	const [liveUpdatedAt, setLiveUpdatedAt] = useState<number | null>(null);
	const [rawMeter, setRawMeter] = useState(0);
	const [status, setStatus] = useState<DataStatus>("loading");
	const [stats, setStats] = useState<ApiStats>(INIT_STATS);
	// default: measured/realtime basis (meter is calibrated to the MEA bill now)
	const [measured, setMeasuredState] = useState(true);
	const [solarCase, setSolarCaseState] = useState<SolarCase>("worst");
	const [syncing, setSyncing] = useState(false);
	const [syncedAt, setSyncedAt] = useState<number | null>(null);

	const pointsRef = useRef<[number, number][]>([]);
	const measuredRef = useRef(true);
	const solarCaseRef = useRef<SolarCase>("worst");

	const fetchLive = useCallback(async (timeoutMs: number): Promise<boolean> => {
		const started = Date.now();
		try {
			const res = await fetch("/api/energy/live", { signal: AbortSignal.timeout(timeoutMs) });
			const body = (await res.json()) as { ok: boolean; live?: LiveData };
			const latency = Date.now() - started;
			if (!body.ok || !body.live) throw new Error("live not ok");
			setLive(body.live);
			setLiveOffline(false);
			setLiveUpdatedAt(Date.now());
			setStats((s) => ({ ...s, liveLatencyMs: latency, liveFetches: s.liveFetches + 1, liveOffline: false }));
			return true;
		} catch {
			setLiveOffline(true);
			setStats((s) => ({
				...s,
				liveLatencyMs: Date.now() - started,
				liveFetches: s.liveFetches + 1,
				liveOffline: true,
			}));
			return false;
		}
	}, []);

	const fetchHistory = useCallback(async (): Promise<[number, number][] | null> => {
		const started = Date.now();
		try {
			const res = await fetch("/api/energy/history?days=30", {
				signal: AbortSignal.timeout(HISTORY_TIMEOUT_MS),
			});
			const body = (await res.json()) as {
				ok: boolean;
				points?: [number, number][];
				rawLastMeter?: number;
			};
			if (!body.ok || !body.points) throw new Error("history not ok");
			setRawMeter(typeof body.rawLastMeter === "number" ? body.rawLastMeter : 0);
			setStats((s) => ({
				...s,
				historyLatencyMs: Date.now() - started,
				historyFetches: s.historyFetches + 1,
				historyRows: body.points?.length ?? 0,
				historyFetchedAt: Date.now(),
			}));
			return body.points;
		} catch {
			setStats((s) => ({
				...s,
				historyLatencyMs: Date.now() - started,
				historyFetches: s.historyFetches + 1,
			}));
			return null;
		}
	}, []);

	const setMeasured = useCallback(
		(next: boolean) => {
			measuredRef.current = next;
			setMeasuredState(next);
			const pts = pointsRef.current;
			if (pts.length >= 2) {
				const result = calcAll(pts, {
					nowMs: Date.now(),
					useMeaBaseline: !next,
					solarPr: SOLAR_PR_BY_CASE[solarCaseRef.current],
				});
				if (result) setCalc(result);
			}
		},
		[],
	);

	const setSolarCase = useCallback(
		(next: SolarCase) => {
			solarCaseRef.current = next;
			setSolarCaseState(next);
			const pts = pointsRef.current;
			if (pts.length >= 2) {
				const result = calcAll(pts, {
					nowMs: Date.now(),
					useMeaBaseline: !measuredRef.current,
					solarPr: SOLAR_PR_BY_CASE[next],
				});
				if (result) setCalc(result);
			}
		},
		[],
	);

	const syncNow = useCallback(async () => {
		if (syncing) return;
		setSyncing(true);
		try {
			await fetch("/api/energy/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json", Origin: window.location.origin },
			});
			await fetchLive(LIVE_TIMEOUT_MS);
			const pts = await fetchHistory();
			if (pts) {
				pointsRef.current = pts;
				const result = calcAll(pts, {
					nowMs: Date.now(),
					useMeaBaseline: !measuredRef.current,
					solarPr: SOLAR_PR_BY_CASE[solarCaseRef.current],
				});
				if (result) setCalc(result);
			}
			setSyncedAt(Date.now());
		} finally {
			setSyncing(false);
		}
	}, [syncing, fetchLive, fetchHistory]);

	// Initial load sequence
	useEffect(() => {
		let cancelled = false;
		(async () => {
			const livePromise = fetchLive(LIVE_TIMEOUT_MS);
			const historyPromise = fetchHistory();
			await livePromise;
			if (cancelled) return;
			const pts = await historyPromise;
			if (cancelled) return;
			if (!pts) {
				setStatus("error-history");
				return;
			}
			pointsRef.current = pts;
			await new Promise((r) => setTimeout(r, 30));
			if (cancelled) return;
			const result = calcAll(pts, {
				nowMs: Date.now(),
				useMeaBaseline: !measuredRef.current,
				solarPr: SOLAR_PR_BY_CASE[solarCaseRef.current],
			});
			if (!result) {
				setStatus("error-empty");
				return;
			}
			setCalc(result);
			setStatus("ready");
		})();
		return () => { cancelled = true; };
	}, [fetchLive, fetchHistory]);

	// Polling: live 30s, history 5min — pause while tab hidden
	useEffect(() => {
		if (status !== "ready") return;
		const liveTimer = window.setInterval(() => {
			if (!document.hidden) void fetchLive(10_000);
		}, LIVE_POLL_MS);
		const histTimer = window.setInterval(() => {
			if (document.hidden) return;
			void fetchHistory().then((pts) => {
				if (!pts) return;
				pointsRef.current = pts;
				const result = calcAll(pts, {
					nowMs: Date.now(),
					useMeaBaseline: !measuredRef.current,
					solarPr: SOLAR_PR_BY_CASE[solarCaseRef.current],
				});
				if (result) setCalc(result);
			});
		}, HISTORY_POLL_MS);
		const onVisible = () => { if (!document.hidden) void fetchLive(10_000); };
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			window.clearInterval(liveTimer);
			window.clearInterval(histTimer);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [status, fetchLive, fetchHistory]);

	return {
		calc,
		live,
		liveOffline,
		liveUpdatedAt,
		rawMeter,
		points: pointsRef.current,
		stats,
		status,
		measured,
		setMeasured,
		solarCase,
		setSolarCase,
		solarPr: SOLAR_PR_BY_CASE[solarCase],
		syncing,
		syncedAt,
		syncNow,
	};
}
