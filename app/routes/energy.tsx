import { useCallback, useEffect, useRef, useState } from "react";
import { data, redirect } from "react-router";
import type { Route } from "./+types/energy";
import "~/styles/energy.css";
import { BatteryWhatIf } from "~/components/energy/BatteryWhatIf";
import { Inspector } from "~/components/energy/Inspector";
import { DailyEnergyChart } from "~/components/energy/DailyEnergyChart";
import { HouseFlow } from "~/components/energy/HouseFlow";
import { InstallGauge } from "~/components/energy/InstallGauge";
import { LiveNow } from "~/components/energy/LiveNow";
import { LoadCurve } from "~/components/energy/LoadCurve";
import { LoadingOverlay, type StepState } from "~/components/energy/LoadingOverlay";
import { PeriodTally } from "~/components/energy/PeriodTally";
import { EnergyHeader, ProfileBars } from "~/components/energy/ProfileBars";
import { SavingsChart } from "~/components/energy/SavingsChart";
import { ScenarioCards, BaseloadStats } from "~/components/energy/ScenarioCards";
import { SolarForecast } from "~/components/energy/SolarForecast";
import { Verdict } from "~/components/energy/Verdict";
import { ForecastChart } from "~/components/energy/ForecastChart";
import { GridQuality } from "~/components/energy/GridQuality";
import { Heatmap } from "~/components/energy/Heatmap";
import type { ApiStats, LiveData } from "~/components/energy/types";
import { calcAll, type CalcResult } from "~/lib/energy-calc";
import { ENERGY_PUBLIC, gateCookie, keyHash, requireEnergyAuth, safeEqual } from "~/lib/energy-gate.server";

export const meta: Route.MetaFunction = () => [
	{ title: "Energy Dashboard v10" },
	{ name: "robots", content: "noindex, nofollow" },
];

export const links: Route.LinksFunction = () => [
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
	},
];

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	if (ENERGY_PUBLIC) return null; // public mode — anyone can view, no key
	const key = new URL(request.url).searchParams.get("key");
	if (key !== null) {
		// correct key → set cookie and drop ?key= from the URL; wrong key → 404
		if (env.ENERGY_PAGE_KEY && safeEqual(key, env.ENERGY_PAGE_KEY)) {
			throw redirect("/energy", { headers: { "Set-Cookie": gateCookie(await keyHash(env)) } });
		}
		throw data(null, { status: 404 });
	}
	await requireEnergyAuth(request, env);
	return null;
}

const LIVE_POLL_MS = 30_000;
const HISTORY_POLL_MS = 5 * 60_000;
const LIVE_TIMEOUT_MS = 15_000;
const HISTORY_TIMEOUT_MS = 20_000;

const SECTION_STAGGER_MS = 80;

export default function EnergyPage() {
	const [steps, setSteps] = useState<StepState[]>(["wait", "wait", "wait", "wait"]);
	const [overlayFading, setOverlayFading] = useState(false);
	const [overlayGone, setOverlayGone] = useState(false);
	const [live, setLive] = useState<LiveData | null>(null);
	const [liveOffline, setLiveOffline] = useState(false);
	const [liveUpdatedAt, setLiveUpdatedAt] = useState<number | null>(null);
	const [calc, setCalc] = useState<CalcResult | null>(null);
	const [fatal, setFatal] = useState<"history" | "empty" | null>(null);
	const [revealed, setRevealed] = useState(false);
	const [barsOn, setBarsOn] = useState(false);
	const [stats, setStats] = useState<ApiStats>({
		liveEndpoint: "/api/energy/live",
		historyEndpoint: "/api/energy/history?days=30",
		liveLatencyMs: null,
		historyLatencyMs: null,
		liveFetches: 0,
		historyFetches: 0,
		historyRows: 0,
		historyFetchedAt: null,
		liveOffline: false,
	});
	const pointsRef = useRef<[number, number][]>([]);
	const reducedRef = useRef(false);
	// finance basis: false = MEA bill baseline (default), true = measured/realtime.
	// Ephemeral (not persisted) — resets to default on reload, by design.
	const [measured, setMeasured] = useState(false);
	const measuredRef = useRef(false);
	const setBasis = useCallback((next: boolean) => {
		measuredRef.current = next;
		setMeasured(next);
		const pts = pointsRef.current;
		if (pts.length >= 2) {
			const result = calcAll(pts, { nowMs: Date.now(), useMeaBaseline: !next });
			if (result) setCalc(result);
		}
	}, []);

	const setStep = useCallback((i: number, st: StepState) => {
		setSteps((prev) => prev.map((s, j) => (j === i ? st : s)));
	}, []);

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
			setStats((s) => ({
				...s,
				liveLatencyMs: latency,
				liveFetches: s.liveFetches + 1,
				liveOffline: false,
			}));
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
			const body = (await res.json()) as { ok: boolean; points?: [number, number][] };
			if (!body.ok || !body.points) throw new Error("history not ok");
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

	// initial loading sequence — steps tick with the real pipeline
	useEffect(() => {
		reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		let cancelled = false;

		const finishOverlay = () => {
			if (reducedRef.current) {
				setOverlayGone(true);
				setRevealed(true);
				setBarsOn(true);
				return;
			}
			setRevealed(true);
			setOverlayFading(true);
			window.setTimeout(() => !cancelled && setOverlayGone(true), 400);
			// bars animate 0 → value once sections are mounted
			requestAnimationFrame(() => requestAnimationFrame(() => !cancelled && setBarsOn(true)));
		};

		(async () => {
			setStep(0, "run");
			const livePromise = fetchLive(LIVE_TIMEOUT_MS);
			const historyPromise = fetchHistory();
			const liveOk = await livePromise;
			if (cancelled) return;
			setStep(0, liveOk ? "done" : "fail");
			setStep(1, "run");
			const pts = await historyPromise;
			if (cancelled) return;
			if (!pts) {
				setStep(1, "fail");
				setFatal("history");
				setOverlayGone(true);
				return;
			}
			pointsRef.current = pts;
			setStep(1, "done");
			setStep(2, "run");
			// yield a frame so the step state is visible before sync calc work
			await new Promise((r) => setTimeout(r, 30));
			if (cancelled) return;
			const result = calcAll(pts, { nowMs: Date.now(), useMeaBaseline: !measuredRef.current });
			if (!result) {
				setStep(2, "fail");
				setFatal("empty");
				setOverlayGone(true);
				return;
			}
			setStep(2, "done");
			setStep(3, "run");
			setCalc(result);
			requestAnimationFrame(() => {
				if (cancelled) return;
				setStep(3, "done");
				finishOverlay();
			});
		})();
		return () => {
			cancelled = true;
		};
	}, [fetchLive, fetchHistory, setStep]);

	// polling: live 30s, history 5min; paused while the tab is hidden
	useEffect(() => {
		if (!calc) return;
		const liveTimer = window.setInterval(() => {
			if (!document.hidden) void fetchLive(10_000);
		}, LIVE_POLL_MS);
		const histTimer = window.setInterval(() => {
			if (document.hidden) return;
			void fetchHistory().then((pts) => {
				if (!pts) return;
				pointsRef.current = pts;
				const result = calcAll(pts, { nowMs: Date.now(), useMeaBaseline: !measuredRef.current });
				if (result) setCalc(result);
			});
		}, HISTORY_POLL_MS);
		const onVisible = () => {
			if (!document.hidden) void fetchLive(10_000);
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			window.clearInterval(liveTimer);
			window.clearInterval(histTimer);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [calc !== null, fetchLive, fetchHistory]); // eslint-disable-line react-hooks/exhaustive-deps

	const sectionCls = (i: number) =>
		revealed ? "reveal in" : "reveal";
	const sectionStyle = (i: number) =>
		reducedRef.current ? undefined : { transitionDelay: `${i * SECTION_STAGGER_MS}ms` };

	return (
		<div className="energy-root">
			{!overlayGone && <LoadingOverlay steps={steps} fading={overlayFading} />}
			<div className="wrap">
				{fatal === "history" && (
					<div className="card empty-card" style={{ marginTop: 96 }}>
						<div className="big-ico">⚠️</div>
						<h3>โหลดประวัติจากคลังข้อมูลไม่สำเร็จ</h3>
						<p className="sub" style={{ marginTop: 8 }}>
							ลองรีเฟรชหน้าอีกครั้ง — ถ้ายังไม่หาย ตรวจ log ของ Worker / Supabase
						</p>
					</div>
				)}
				{fatal === "empty" && (
					<div className="card empty-card" style={{ marginTop: 96 }}>
						<div className="big-ico">🕐</div>
						<h3>ยังไม่มีข้อมูลในคลัง</h3>
						<p className="sub" style={{ marginTop: 8 }}>
							cron ดูดข้อมูลจาก Tuya ทุก 15 นาที — รอรอบแรกสักครู่แล้วรีเฟรชใหม่ค่ะ
						</p>
					</div>
				)}
				{calc && (
					<>
						<div className="basis-bar">
							<span className="basis-label">ฐานข้อมูลการเงิน</span>
							<div className="basis-seg" role="tablist" aria-label="ฐานข้อมูลการเงิน">
								<button
									type="button"
									role="tab"
									aria-selected={!measured}
									className={!measured ? "on" : ""}
									onClick={() => measured && setBasis(false)}
								>
									บิล MEA (1,100)
								</button>
								<button
									type="button"
									role="tab"
									aria-selected={measured}
									className={measured ? "on" : ""}
									onClick={() => !measured && setBasis(true)}
								>
									วัดจริง (realtime)
								</button>
							</div>
							<span className="basis-hint">
								{measured
									? "กำลังสเกลค่าเงินด้วยยอดที่วัดได้จริง — เปลี่ยนตามข้อมูล (ไม่บันทึก รีเฟรชแล้วกลับค่าเริ่มต้น)"
									: "ค่าเริ่มต้น: สเกลค่าเงินด้วยฐานบิล MEA 1,100 kWh/เดือน · กด “วัดจริง” เพื่อดูตามที่ใช้จริง"}
							</span>
						</div>
						<div className={sectionCls(0)} style={sectionStyle(0)}>
							<EnergyHeader a={calc.a} f={calc.f} liveOffline={liveOffline} />
						</div>
						<div className={sectionCls(1)} style={sectionStyle(1)}>
							<LiveNow live={live} liveOffline={liveOffline} a={calc.a} updatedAt={liveUpdatedAt} />
						</div>
						<div className={sectionCls(2)} style={sectionStyle(2)}>
							<PeriodTally a={calc.a} live={live} />
						</div>
						<div className={sectionCls(3)} style={sectionStyle(3)}>
							<HouseFlow live={live} liveOffline={liveOffline} a={calc.a} />
						</div>
						<div className={sectionCls(4)} style={sectionStyle(4)}>
							<SolarForecast a={calc.a} />
						</div>
						<div className={sectionCls(5)} style={sectionStyle(5)}>
							<DailyEnergyChart a={calc.a} />
						</div>
						<div className={sectionCls(6)} style={sectionStyle(6)}>
							<GridQuality />
						</div>
						<div className={sectionCls(7)} style={sectionStyle(7)}>
							<ProfileBars f={calc.f} barsOn={barsOn} />
						</div>
						<div className={sectionCls(8)} style={sectionStyle(8)}>
							<LoadCurve prof={calc.a.prof} sol={calc.sol} />
						</div>
						<div className={sectionCls(9)} style={sectionStyle(9)}>
							<Heatmap a={calc.a} />
						</div>
						<div className={sectionCls(10)} style={sectionStyle(10)}>
							<ForecastChart fc={calc.fc} a={calc.a} />
						</div>
						<div className={sectionCls(11)} style={sectionStyle(11)}>
							<SavingsChart sv={calc.sv} fc={calc.fc} />
						</div>
						<div className={sectionCls(12)} style={sectionStyle(12)}>
							<BaseloadStats a={calc.a} />
						</div>
						<div className={sectionCls(13)} style={sectionStyle(13)}>
							<ScenarioCards f={calc.f} />
						</div>
						<div className={sectionCls(14)} style={sectionStyle(14)}>
							<InstallGauge f={calc.f} />
						</div>
						<div className={sectionCls(15)} style={sectionStyle(15)}>
							<BatteryWhatIf a={calc.a} />
						</div>
						<div className={sectionCls(16)} style={sectionStyle(16)}>
							<Verdict a={calc.a} f={calc.f} fc={calc.fc} />
						</div>
						<div className={sectionCls(17)} style={sectionStyle(17)}>
							<Inspector
								calc={calc}
								live={live}
								stats={stats}
								points={pointsRef.current}
							/>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
