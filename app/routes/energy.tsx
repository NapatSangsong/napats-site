import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { data, redirect } from "react-router";
import type { Route } from "./+types/energy";
import "~/styles/energy.css";
import { BatteryWhatIf } from "~/components/energy/BatteryWhatIf";
import { BillToDate } from "~/components/energy/BillToDate";
import { EnergyChat } from "~/components/energy/EnergyChat";
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
import { calcAll, type CalcResult, ENERGY_CONST as C, touSolarScenario, flatEnergyBaht } from "~/lib/energy-calc";
import { f0, f1, f2, pc, money } from "~/lib/energy-format";
import { ENERGY_PUBLIC, gateCookie, keyHash, requireEnergyAuth, safeEqual } from "~/lib/energy-gate.server";

/** Compact, human-readable snapshot of the dashboard for the AI chat context. */
function buildEnergyContext(calc: CalcResult, live: LiveData | null, measured: boolean): string {
	const { a, f, fc } = calc;
	// Every tariff/solar combo the AI might be asked about — same model as the cards.
	const yield4 = 4 * C.SOLAR_PSH * C.SOLAR_PR; // 4kW kWh/day
	const flatSolar = (yieldKwhD: number, sub: number) => {
		const usable = Math.min(yieldKwhD, f.daytimeLoadD);
		const grid = Math.max(0, f.monthlyKwh - usable * (C.WEEKDAYS_MO + C.WEEKENDS_MO));
		return flatEnergyBaht(grid) + C.FLAT_FIXED + sub;
	};
	const opts: Array<[string, number]> = [
		["Flat (มิเตอร์ปกติ)", f.cost1],
		["TOU เดี่ยว", f.cost2],
		["TOU + Solar 2kW", f.cost3],
		["TOU + Solar 4kW", touSolarScenario(f, yield4, 1399).cost],
		["Flat + Solar 2kW", flatSolar(C.SOLAR_KWH_D, 699)],
		["Flat + Solar 4kW", flatSolar(yield4, 1399)],
	];
	const sc = {
		flat: f.cost1,
		tou: f.cost2,
		tou2: f.cost3,
		tou4: opts[3][1],
		flat2: opts[4][1],
		flat4: opts[5][1],
		cheapest: opts.reduce((b, o) => (o[1] < b[1] ? o : b)),
	};
	const lines = [
		"# สรุปข้อมูลพลังงานบ้าน (ณ ตอนนี้)",
		`ฐานการเงิน: ${measured ? "วัดจริง (realtime)" : `บิล MEA ${f0(f.monthlyKwh)} kWh/เดือน`}`,
		`ใช้ไฟเฉลี่ย ${f2(a.kwhDay)} kWh/วัน · เก็บข้อมูล ${f1(a.spanDays)} วัน (${a.n} จุด) · รวม ${f1(a.total)} kWh`,
		"",
		"## สัดส่วนตามช่วงเวลา (TOU)",
		`Off-peak กลางคืน 22:00–09:00: ${pc(f.nightPct)}% (${f1(a.night)} kWh) @ ${C.TOU_OFF}฿`,
		`Daytime 09:00–17:00 (ช่วงโซลาร์): ${pc(f.daytimePct)}% (${f1(a.daytime)} kWh)`,
		`Evening peak 17:00–22:00: ${pc(f.eveningPct)}% (${f1(a.evening)} kWh)`,
		`On-peak รวม ${f1(f.onKwh)} kWh @ ${C.TOU_ON}฿ · Off-peak รวม ${f1(f.offKwh)} kWh @ ${C.TOU_OFF}฿`,
		"",
		`## เปรียบเทียบค่าไฟรายเดือน (ฐาน ${f0(f.monthlyKwh)} หน่วย/เดือน)`,
		`Flat (มิเตอร์ปกติ): ${money(sc.flat)}`,
		`TOU เดี่ยว: ${money(sc.tou)}`,
		`TOU + Solar 2kW: ${money(sc.tou2)}`,
		`TOU + Solar 4kW: ${money(sc.tou4)}`,
		`Flat + Solar 2kW: ${money(sc.flat2)}`,
		`Flat + Solar 4kW: ${money(sc.flat4)}`,
		`→ ถูกสุด: ${sc.cheapest[0]} ที่ ${money(sc.cheapest[1] as number)}`,
		"",
		"## พารามิเตอร์โมเดล (ใช้คำนวณคอมโบอื่นเองได้ เช่น flat+battery, 6kW ฯลฯ)",
		"- Flat ขั้นบันได: ≤150 @3.2484, 151–400 @4.2218, >400 @4.4217 ฿/kWh, + Ft 0.1623/หน่วย, ×VAT 1.07, + ค่าบริการ 40.9",
		`- TOU: on-peak (จ–ศ 09:00–21:59) 5.81, off-peak 2.99 ฿/kWh, + ค่าบริการ 40.9 · บ้านนี้ on ${f1(f.onKwh)} / off ${f1(f.offKwh)} หน่วย/เดือน`,
		`- โซลาร์ผลิต PSH 5.3 × PR 0.75 = 3.975 kWh/kWp/วัน → 2kW=7.95, 4kW=15.9 · ตัดได้ไม่เกินโหลดกลางวัน ${f2(f.daytimeLoadD)} kWh/วัน`,
		"- ค่า subscription โซลาร์: 2kW=699, 4kW=1399 ฿/เดือน · โซลาร์ตัด on-peak จ–ศ 22วัน + off-peak ส–อา 8วัน (flat ตัดทุกวัน 30)",
		"- โซลาร์ช่วยพีคเย็น 17–22 ไม่ได้ — ต้องมีแบตเตอรี่ (RT eff 0.9) ถึงจะตัดได้",
		"",
		"## โหลด",
		`Baseload ${f2(a.baseloadKw)} kW · โหลดกลางวัน(08–16) ${f2(a.daytimeKwhD)} kWh/วัน · โหลดเย็น(พีค) ${f2(a.eveningKwhD)} kWh/วัน`,
		"",
		"## พยากรณ์สิ้นเดือน",
		`คาดใช้ทั้งเดือน ${f0(fc.totalKwh)} kWh (เหลืออีก ${f0(fc.futureKwh)} kWh) · ค่าไฟคาด TOU ${money(fc.touCost)} / Flat ${money(fc.flatCost)}`,
	];
	if (live) {
		lines.push(
			"",
			"## สถานะสด (live)",
			`กำลังไฟตอนนี้ ${f0(live.power_w)} W · แรงดัน ${f1(live.voltage_v)}V · PF ${f2(live.power_factor)} · มิเตอร์สะสม ${f1(live.meter_kwh)} kWh`,
		);
	}
	return lines.join("\n");
}

export const meta: Route.MetaFunction = () => [
	{ title: "Energy Dashboard v10" },
	{ name: "robots", content: "noindex, nofollow" },
	// Match the iOS Safari status/URL bar to the dashboard's darkest navy so the
	// browser chrome blends into the page instead of showing a black band on top.
	{ name: "theme-color", content: "#10172a" },
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

	// Snapshot of the current numbers handed to the AI chat as context.
	const aiContext = useMemo(
		() => (calc ? buildEnergyContext(calc, live, measured) : ""),
		[calc, live, measured],
	);

	// Manual "Sync now": pull latest Tuya logs into the DB on demand
	const [syncing, setSyncing] = useState(false);
	const [syncedAt, setSyncedAt] = useState<number | null>(null);
	// Raw (uncalibrated) last meter from /history — used for live-vs-stored deltas
	// (live.meter_kwh is raw, so liveExtra must compare against this, not calibrated)
	const [rawMeter, setRawMeter] = useState(0);

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

	// Manual sync: hit the cron's Tuya→DB pull + rollup, then re-fetch everything
	const syncNow = useCallback(async () => {
		if (syncing) return;
		setSyncing(true);
		try {
			const res = await fetch("/api/energy/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json", Origin: window.location.origin },
			});
			const body = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean };
			// refresh live + history regardless (sync may have written new rows)
			await fetchLive(LIVE_TIMEOUT_MS);
			const pts = await fetchHistory();
			if (pts) {
				pointsRef.current = pts;
				const result = calcAll(pts, { nowMs: Date.now(), useMeaBaseline: !measuredRef.current });
				if (result) setCalc(result);
			}
			if (body.ok) setSyncedAt(Date.now());
		} finally {
			setSyncing(false);
		}
	}, [syncing, fetchLive, fetchHistory]);

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
							<button
								type="button"
								onClick={syncNow}
								disabled={syncing}
								title="ดึงข้อมูลล่าสุดจากมิเตอร์เข้าระบบทันที (ปกติ cron ทุก 15 นาที)"
								style={{
									appearance: "none",
									border: "1px solid var(--line)",
									background: "var(--night-2)",
									color: syncing ? "var(--ink-dim)" : "var(--ink)",
									borderRadius: 99,
									padding: "5px 14px",
									font: "inherit",
									fontSize: "0.8rem",
									fontWeight: 600,
									cursor: syncing ? "wait" : "pointer",
									display: "inline-flex",
									alignItems: "center",
									gap: 6,
								}}
							>
								<span style={{ display: "inline-block", animation: syncing ? "energy-spin 0.8s linear infinite" : "none" }}>↻</span>
								{syncing ? "กำลังซิงค์…" : "Sync now"}
							</button>
							{syncedAt && !syncing && (
								<span className="mono" style={{ fontSize: "0.72rem", color: "var(--ink-dim)" }}>
									ซิงค์ล่าสุด {new Date(syncedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
								</span>
							)}
							<span className="basis-hint">
								{measured
									? "กำลังสเกลค่าเงินด้วยยอดที่วัดได้จริง — เปลี่ยนตามข้อมูล (ไม่บันทึก รีเฟรชแล้วกลับค่าเริ่มต้น)"
									: "ค่าเริ่มต้น: สเกลค่าเงินด้วยฐานบิล MEA 1,100 kWh/เดือน · กด “วัดจริง” เพื่อดูตามที่ใช้จริง"}
							</span>
						</div>
						{/* ── thesis ── */}
						<div className={sectionCls(0)} style={sectionStyle(0)}>
							<EnergyHeader a={calc.a} f={calc.f} liveOffline={liveOffline} />
						</div>
						{/* ── 1) ตอนนี้ / วันนี้ ── */}
						<div className={sectionCls(1)} style={sectionStyle(1)}>
							<LiveNow live={live} liveOffline={liveOffline} a={calc.a} rawMeter={rawMeter} updatedAt={liveUpdatedAt} />
						</div>
						<div className={sectionCls(2)} style={sectionStyle(2)}>
							<PeriodTally a={calc.a} live={live} rawMeter={rawMeter} />
						</div>
						<div className={sectionCls(3)} style={sectionStyle(3)}>
							<HouseFlow live={live} liveOffline={liveOffline} a={calc.a} rawMeter={rawMeter} />
						</div>
						{/* ── 2) บิล & การตัดสินใจ ── */}
						<div className={sectionCls(4)} style={sectionStyle(4)}>
							<BillToDate a={calc.a} f={calc.f} live={live} />
						</div>
						<div className={sectionCls(5)} style={sectionStyle(5)}>
							<ScenarioCards f={calc.f} />
						</div>
						<div className={sectionCls(6)} style={sectionStyle(6)}>
							<Verdict a={calc.a} f={calc.f} fc={calc.fc} />
						</div>
						<div className={sectionCls(7)} style={sectionStyle(7)}>
							<InstallGauge f={calc.f} />
						</div>
						<div className={sectionCls(8)} style={sectionStyle(8)}>
							<BatteryWhatIf a={calc.a} />
						</div>
						<div className={sectionCls(9)} style={sectionStyle(9)}>
							<SavingsChart sv={calc.sv} fc={calc.fc} />
						</div>
						{/* ── 3) รูปแบบการใช้ไฟ (ทำไม) ── */}
						<div className={sectionCls(10)} style={sectionStyle(10)}>
							<ProfileBars f={calc.f} barsOn={barsOn} />
						</div>
						<div className={sectionCls(11)} style={sectionStyle(11)}>
							<LoadCurve prof={calc.a.prof} sol={calc.sol} />
						</div>
						<div className={sectionCls(12)} style={sectionStyle(12)}>
							<Heatmap a={calc.a} />
						</div>
						<div className={sectionCls(13)} style={sectionStyle(13)}>
							<DailyEnergyChart a={calc.a} />
						</div>
						{/* ── 4) พยากรณ์ ── */}
						<div className={sectionCls(14)} style={sectionStyle(14)}>
							<ForecastChart fc={calc.fc} a={calc.a} />
						</div>
						<div className={sectionCls(15)} style={sectionStyle(15)}>
							<SolarForecast a={calc.a} />
						</div>
						{/* ── 5) วินิจฉัย / เทคนิค ── */}
						<div className={sectionCls(16)} style={sectionStyle(16)}>
							<BaseloadStats a={calc.a} />
						</div>
						<div className={sectionCls(17)} style={sectionStyle(17)}>
							<GridQuality />
						</div>
						<div className={sectionCls(18)} style={sectionStyle(18)}>
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
			{calc && overlayGone && <EnergyChat context={aiContext} />}
		</div>
	);
}
