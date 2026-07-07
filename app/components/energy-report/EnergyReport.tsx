import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cycleCosts, dayNum } from "~/lib/energy-calc";
import { useDashboardTheme } from "~/hooks/useDashboardTheme";
import { RPT_DARK, RPT_LIGHT } from "./theme";
import { RptPanel } from "./bits";
import { MonthSwitcher } from "./MonthSwitcher";
import { SummaryTiles } from "./SummaryTiles";
import { DailyBreakdownChart } from "./DailyBreakdownChart";
import { TouSplitCard } from "./TouSplitCard";
import { SolarPlanCard } from "./SolarPlanCard";
import { MonthCompareChart } from "./MonthCompareChart";
import { DayDetail } from "./DayDetail";
import { listCycles, paceVsPrev, rowsInCycle, ymOfCycle } from "./derive";
import type { ReportPayload, ReportResult } from "./types";

/** Loader-failure shell — theme-aware retry card, no data required */
function ReportError({ error }: { error: string }) {
	const { theme, toggle } = useDashboardTheme();
	return (
		<div className="ereport-root" data-theme={theme}>
			<header className="ereport-top">
				<div className="ereport-brand">
					<span className="ereport-brand-dot" aria-hidden />
					Energy Report
					<span className="ereport-brand-sub">ตัดรอบทุกวันที่ 2</span>
				</div>
				<button type="button" className="ereport-theme" onClick={toggle} aria-label="สลับธีม">
					{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
				</button>
			</header>
			<div className="ereport-error" role="alert" style={{ marginTop: 24 }}>
				เชื่อมต่อฐานข้อมูลไม่ได้ — {error}{" "}
				<button type="button" onClick={() => window.location.reload()}>ลองใหม่</button>
			</div>
		</div>
	);
}

/**
 * /energy/report — one billing cycle (ตัดวันที่ 2) at a time. SSR gives the
 * initial cycle; month switches fetch /api/energy/report?ym= and are cached
 * client-side. Swipe (touch) or ←/→ (keyboard) to change cycles.
 */
export function EnergyReport({ initial }: { initial: ReportResult }) {
	if (!initial.ok) return <ReportError error={initial.error} />;
	return <EnergyReportReady initial={initial} />;
}

function EnergyReportReady({ initial }: { initial: ReportPayload }) {
	const { theme, toggle } = useDashboardTheme();
	const ct = theme === "dark" ? RPT_DARK : RPT_LIGHT;

	const [data, setData] = useState<ReportPayload>(initial);
	const [loading, setLoading] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [selDay, setSelDay] = useState<number | null>(null);
	const cacheRef = useRef(new Map<string, ReportPayload>([[ymOfCycle(initial.cycle), initial]]));

	// "now" is pinned to the SSR fetch instant — identical on server + client (no hydration drift)
	const nowDay = dayNum(initial.fetchedAt);
	const cycles = useMemo(() => listCycles(initial.daily, initial.fetchedAt), [initial]);
	const idx = cycles.findIndex((c) => c.startDay === data.cycle.startDay);

	const goto = useCallback(
		async (ym: string) => {
			setErr(null);
			setSelDay(null);
			const cached = cacheRef.current.get(ym);
			if (cached) {
				setData(cached);
				window.history.replaceState(null, "", `?ym=${ym}`);
				return;
			}
			setLoading(true);
			try {
				const res = await fetch(`/api/energy/report?ym=${ym}`, {
					signal: AbortSignal.timeout(20_000),
				});
				const body = (await res.json()) as ReportPayload | { ok: false; error?: string };
				if (!res.ok || !body.ok) throw new Error(("error" in body && body.error) || "โหลดไม่สำเร็จ");
				cacheRef.current.set(ym, body);
				setData(body);
				window.history.replaceState(null, "", `?ym=${ym}`);
			} catch (e) {
				setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
			} finally {
				setLoading(false);
			}
		},
		[],
	);

	const canPrev = idx > 0;
	const canNext = idx >= 0 && idx < cycles.length - 1;
	const prev = useCallback(() => {
		if (idx > 0) void goto(ymOfCycle(cycles[idx - 1]));
	}, [idx, cycles, goto]);
	const next = useCallback(() => {
		if (idx >= 0 && idx < cycles.length - 1) void goto(ymOfCycle(cycles[idx + 1]));
	}, [idx, cycles, goto]);

	// keyboard ← / → (skip when the day sheet is open — Esc handles that)
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (selDay != null) return;
			if (e.key === "ArrowLeft") prev();
			else if (e.key === "ArrowRight") next();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [prev, next, selDay]);

	// horizontal swipe → prev/next cycle
	const touchRef = useRef<{ x: number; y: number } | null>(null);
	const onTouchStart = (e: React.TouchEvent) => {
		touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
	};
	const onTouchEnd = (e: React.TouchEvent) => {
		const t0 = touchRef.current;
		touchRef.current = null;
		if (!t0 || selDay != null) return;
		const dx = e.changedTouches[0].clientX - t0.x;
		const dy = e.changedTouches[0].clientY - t0.y;
		if (Math.abs(dx) > 64 && Math.abs(dx) > 2 * Math.abs(dy)) {
			if (dx < 0) next();
			else prev();
		}
	};

	// derived for the selected cycle
	const rows = useMemo(() => rowsInCycle(data.daily, data.cycle), [data]);
	const costs = useMemo(() => cycleCosts(rows, data.cycle), [rows, data.cycle]);
	const isCurrent = nowDay >= data.cycle.startDay && nowDay <= data.cycle.endDay;
	const pace = useMemo(
		() => paceVsPrev(data.daily, data.cycle, idx > 0 ? cycles[idx - 1] : null, nowDay),
		[data, idx, cycles, nowDay],
	);
	const hourlyByDay = useMemo(() => new Map(data.hourly.map((h) => [h.day, h.kwh])), [data]);

	return (
		<div className="ereport-root" data-theme={theme} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
			<header className="ereport-top">
				<div className="ereport-brand">
					<span className="ereport-brand-dot" aria-hidden />
					Energy Report
					<span className="ereport-brand-sub">ตัดรอบทุกวันที่ 2</span>
				</div>
				<button
					type="button"
					className="ereport-theme"
					onClick={toggle}
					aria-label={theme === "dark" ? "โหมดสว่าง" : "โหมดมืด"}
				>
					{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
				</button>
			</header>

			<MonthSwitcher
				cycle={data.cycle}
				canPrev={canPrev}
				canNext={canNext}
				onPrev={prev}
				onNext={next}
				loading={loading}
				progress={
					isCurrent
						? {
								elapsed: nowDay - data.cycle.startDay + 1,
								len: data.cycle.endDay - data.cycle.startDay + 1,
							}
						: null
				}
			/>

			{err && (
				<div className="ereport-error" role="alert">
					{err} — <button type="button" onClick={() => goto(ymOfCycle(data.cycle))}>ลองใหม่</button>
				</div>
			)}

			<main className={`ereport-body${loading ? " is-loading" : ""}`}>
				<SummaryTiles
					rows={rows}
					cycle={data.cycle}
					costs={costs}
					outlook={data.outlook}
					pace={pace}
					isCurrent={isCurrent}
				/>

				<div className="ereport-grid">
					<RptPanel
						title="รายวัน — แตะแท่งเพื่อดูรายชั่วโมง"
						className="ereport-p-daily"
						legend={[
							{ color: ct.on, label: "On-peak" },
							{ color: ct.off, label: "Off-peak" },
						]}
					>
						<DailyBreakdownChart
							rows={rows}
							cycle={data.cycle}
							nowDay={nowDay}
							ct={ct}
							onSelectDay={setSelDay}
						/>
					</RptPanel>

					<RptPanel title="สัดส่วน TOU รอบนี้" className="ereport-p-split">
						<TouSplitCard totals={costs.totals} ct={ct} />
					</RptPanel>

					<RptPanel title="แผนโซลาร์ 4kW" className="ereport-p-solar">
						<SolarPlanCard
							rows={rows}
							allDaily={data.daily}
							cycle={data.cycle}
							costs={costs}
							nowDay={nowDay}
						/>
					</RptPanel>

					<RptPanel title="เทียบทุกรอบบิล — แตะเพื่อเปิดรอบนั้น" className="ereport-p-compare">
						<MonthCompareChart
							daily={data.daily}
							cycles={cycles}
							selectedYm={ymOfCycle(data.cycle)}
							nowDay={nowDay}
							ct={ct}
							onSelect={(ym) => void goto(ym)}
						/>
					</RptPanel>
				</div>

				<footer className="ereport-foot">
					มิเตอร์วัดไฟที่ซื้อจากกริดเท่านั้น · ตัวเลขผ่าน calibration แล้ว · TOU on-peak จ–ศ
					09:00–21:59 · รอบบิลตัดทุกวันที่ 2
				</footer>
			</main>

			{selDay != null && (
				<DayDetail
					day={selDay}
					hours={hourlyByDay.get(selDay) ?? null}
					ct={ct}
					onClose={() => setSelDay(null)}
				/>
			)}
		</div>
	);
}
