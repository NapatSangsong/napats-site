import { AlertTriangle, Clock } from "lucide-react";
import { useDashboardTheme } from "~/hooks/useDashboardTheme";
import { useEnergyData } from "~/hooks/useEnergyData";
import { TopBar } from "./TopBar";
import { KpiRow } from "./KpiRow";
import { LoadVsSolarChart } from "./LoadVsSolarChart";
import { ScenarioBars } from "./ScenarioBars";
import { SavingsAreaChart } from "./SavingsAreaChart";
import { ForecastBars } from "./ForecastBars";
import { TouSplitChart } from "./TouSplitChart";
import { DailyEnergyBars } from "./DailyEnergyBars";
import { UsageHeatmap } from "./UsageHeatmap";
import { SolarForecastChart } from "./SolarForecastChart";
import { CumulativeEnergyChart } from "./CumulativeEnergyChart";
import { DiagnosticsPanel } from "./DiagnosticsPanel";

function Skeleton() {
	return (
		<div className="edash-body">
			<div className="edash-kpi-row">
				{Array.from({ length: 6 }).map((_, i) => (
					<div key={i} className="edash-skeleton-kpi">
						<div className="edash-skel" style={{ height: 12, width: "60%" }} />
						<div className="edash-skel" style={{ height: 32, width: "80%" }} />
						<div className="edash-skel" style={{ height: 10, width: "50%" }} />
					</div>
				))}
			</div>
			<div className="edash-charts">
				{[8, 4, 6, 6, 4, 8, 12].map((span, i) => (
					<div key={i} style={{ gridColumn: `span ${span}` }}>
						<div
							className="edash-panel edash-skel"
							style={{ height: "clamp(200px,28vh,300px)" }}
						/>
					</div>
				))}
			</div>
		</div>
	);
}

function ErrorCard({ message, sub, onRetry }: { message: string; sub: string; onRetry?: () => void }) {
	return (
		<div className="edash-body">
			<div className="edash-error-card">
				<AlertTriangle size={32} style={{ color: "var(--bad)", marginBottom: 12 }} />
				<h3>{message}</h3>
				<p>{sub}</p>
				{onRetry && (
					<button type="button" className="edash-icon-btn" onClick={onRetry}>
						ลองอีกครั้ง
					</button>
				)}
			</div>
		</div>
	);
}

export function EnergyDashboard() {
	const { theme, toggle: toggleTheme, chartTheme: ct } = useDashboardTheme();
	const {
		calc,
		live,
		liveOffline,
		liveUpdatedAt,
		rawMeter,
		points,
		stats,
		status,
		measured,
		setMeasured,
		solarCase,
		setSolarCase,
		solarPr,
		syncing,
		syncedAt,
		syncNow,
	} = useEnergyData();

	return (
		<div className="edash-root" data-theme={theme}>
			<TopBar
				theme={theme}
				onToggleTheme={toggleTheme}
				liveOffline={liveOffline}
				liveUpdatedAt={liveUpdatedAt}
				powerW={live?.power_w ?? null}
				measured={measured}
				onSetMeasured={setMeasured}
				solarCase={solarCase}
				onSetSolarCase={setSolarCase}
				syncing={syncing}
				syncedAt={syncedAt}
				onSync={syncNow}
			/>

			{status === "loading" && <Skeleton />}

			{status === "error-history" && (
				<ErrorCard
					message="โหลดประวัติจากคลังข้อมูลไม่สำเร็จ"
					sub="ลองรีเฟรชหน้าอีกครั้ง — ถ้ายังไม่หาย ตรวจ log ของ Worker / Supabase"
					onRetry={() => window.location.reload()}
				/>
			)}

			{status === "error-empty" && (
				<ErrorCard
					message="ยังไม่มีข้อมูลในคลัง"
					sub="cron ดูดข้อมูลจาก Tuya ทุก 15 นาที — รอรอบแรกสักครู่แล้วรีเฟรชใหม่ค่ะ"
				/>
			)}

			{status === "ready" && calc && (
				<div className="edash-body">
					{/* KPI row */}
					<KpiRow calc={calc} live={live} liveOffline={liveOffline} solarPr={solarPr} />

					{/* Charts grid */}
					<div className="edash-charts">
						{/* Load vs Solar — wide */}
						<div className="edash-p-load">
							<LoadVsSolarChart prof={calc.a.prof} sol={calc.sol} a={calc.a} ct={ct} />
						</div>

						{/* Scenario bars */}
						<div className="edash-p-scen">
							<ScenarioBars f={calc.f} a={calc.a} solarPr={solarPr} ct={ct} />
						</div>

						{/* Cumulative savings */}
						<div className="edash-p-save">
							<SavingsAreaChart sv={calc.sv} fc={calc.fc} ct={ct} />
						</div>

						{/* Forecast */}
						<div className="edash-p-fore">
							<ForecastBars fc={calc.fc} outlook={calc.outlook} cycle={calc.cycle} ct={ct} />
						</div>

						{/* TOU split donut */}
						<div className="edash-p-tou">
							<TouSplitChart f={calc.f} a={calc.a} ct={ct} />
						</div>

						{/* Daily energy bars */}
						<div className="edash-p-daily">
							<DailyEnergyBars a={calc.a} ct={ct} />
						</div>

						{/* Cumulative energy — 5 days vs previous */}
						<div className="edash-p-heat">
							<CumulativeEnergyChart a={calc.a} ct={ct} />
						</div>

						{/* Heatmap */}
						<div className="edash-p-heat">
							<UsageHeatmap a={calc.a} ct={ct} />
						</div>

						{/* Solar forecast */}
						<div className="edash-p-solar">
							<SolarForecastChart a={calc.a} solarPr={solarPr} ct={ct} />
						</div>
					</div>

					{/* Nerd / diagnostics */}
					<DiagnosticsPanel
						calc={calc}
						live={live}
						stats={stats}
						points={points}
						solarPr={solarPr}
					/>

					{/* Footer */}
					<div className="edash-footer">
						<Clock size={12} />
						<span>Data pipeline: /api/energy/live (30s) · /api/energy/history (5min)</span>
						<span style={{ opacity: 0.5 }}>·</span>
						<span>Stats: {stats.liveFetches} live fetches · {stats.historyRows.toLocaleString()} rows</span>
					</div>
				</div>
			)}
		</div>
	);
}
