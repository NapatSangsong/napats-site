import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { CalcResult } from "~/lib/energy-calc";
import { traceLines, ENERGY_CONST as C, FLAT_TIERS, CALIBRATION } from "~/lib/energy-calc";
import { timeLabel, f1, f2 } from "~/lib/energy-format";
import type { ApiStats, LiveData } from "~/components/energy/types";

interface Props {
	calc: CalcResult;
	live: LiveData | null;
	stats: ApiStats;
	points: [number, number][];
	solarPr: number;
}

export function DiagnosticsPanel({ calc, live, stats, points, solarPr }: Props) {
	const [open, setOpen] = useState(false);

	const { a, f, fc, sv } = calc;
	const lines = traceLines(a, f, fc, sv, solarPr);

	const completeDays = [...a.dayHours.entries()].filter(([, hrs]) => hrs.size >= 23).length;
	const totalDays = a.daily.size;

	return (
		<div className="edash-diag">
			<div
				className={`edash-diag-header ${open ? "open" : ""}`}
				onClick={() => setOpen((v) => !v)}
				role="button"
				tabIndex={0}
				onKeyDown={(e) => e.key === "Enter" && setOpen((v) => !v)}
				aria-expanded={open}
			>
				<span className="edash-diag-title">⚙ Diagnostics & Nerd Data</span>
				<span style={{ fontSize: "0.72rem", color: "var(--ink-faint)" }}>
					{a.n.toLocaleString()} points · {a.spanDays.toFixed(1)} days · {totalDays} calendar days
				</span>
				<ChevronDown
					size={16}
					className={`edash-diag-chevron ${open ? "open" : ""}`}
				/>
			</div>

			{open && (
				<div className="edash-diag-body">
					{/* Live sensors */}
					{live && (
						<div className="edash-diag-section">
							<h4>Live Sensors</h4>
							<table className="edash-diag-table">
								<tbody>
									<tr><td>Power</td><td className="edash-mono">{Math.round(live.power_w)} W</td></tr>
									<tr><td>Voltage</td><td className="edash-mono">{f1(live.voltage_v)} V</td></tr>
									<tr><td>Current</td><td className="edash-mono">{f2(live.current_a)} A</td></tr>
									<tr><td>Power Factor</td><td className="edash-mono">{f2(live.power_factor)}</td></tr>
									<tr><td>Frequency</td><td className="edash-mono">{f1(live.freq_hz)} Hz</td></tr>
									<tr><td>Meter (raw)</td><td className="edash-mono">{f2(live.meter_kwh)} kWh</td></tr>
									<tr>
										<td>V×I cross-check</td>
										<td className="edash-mono" style={{ color: Math.abs(live.voltage_v * live.current_a * live.power_factor - live.power_w) < live.power_w * 0.1 ? "var(--good)" : "var(--bad)" }}>
											{f1(live.voltage_v * live.current_a * live.power_factor)} W
											{Math.abs(live.voltage_v * live.current_a * live.power_factor - live.power_w) < live.power_w * 0.1 ? " ✓" : " ✗"}
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					)}

					{/* Data quality */}
					<div className="edash-diag-section">
						<h4>Data Quality</h4>
						<table className="edash-diag-table">
							<tbody>
								<tr><td>Points</td><td className="edash-mono">{a.n.toLocaleString()}</td></tr>
								<tr><td>Span</td><td className="edash-mono">{f1(a.spanDays)} days ({timeLabel(a.t0)} → {timeLabel(a.t1)})</td></tr>
								<tr><td>Complete days (≥23h)</td><td className="edash-mono">{completeDays} / {totalDays}</td></tr>
								<tr><td>Skipped (gaps)</td><td className="edash-mono">{f2(a.skipped)} kWh</td></tr>
								<tr><td>Total measured</td><td className="edash-mono">{f2(a.total)} kWh</td></tr>
								<tr><td>Avg kWh/day</td><td className="edash-mono">{f2(a.kwhDay)} kWh</td></tr>
							</tbody>
						</table>
					</div>

					{/* Baseload & battery */}
					<div className="edash-diag-section">
						<h4>Baseload & Battery Sizing</h4>
						<table className="edash-diag-table">
							<tbody>
								<tr><td>Baseload</td><td className="edash-mono">{f2(a.baseloadKw)} kW ({f2(a.baseloadKw * 24)} kWh/day)</td></tr>
								<tr><td>Daytime load</td><td className="edash-mono">{f2(a.daytimeKwhD)} kWh/day (08–16)</td></tr>
								<tr><td>Evening peak</td><td className="edash-mono">{f2(a.eveningKwhD)} kWh/day (17–22)</td></tr>
								<tr><td>Min battery size</td><td className="edash-mono">≥ {f2(a.eveningKwhD / 0.9)} kWh (at RT eff 90%)</td></tr>
							</tbody>
						</table>
					</div>

					{/* API stats */}
					<div className="edash-diag-section">
						<h4>API Stats</h4>
						<table className="edash-diag-table">
							<tbody>
								<tr><td>Live endpoint</td><td className="edash-mono" style={{ wordBreak: "break-all" }}>{stats.liveEndpoint}</td></tr>
								<tr><td>Live fetches</td><td className="edash-mono">{stats.liveFetches} ({stats.liveLatencyMs !== null ? `${stats.liveLatencyMs}ms` : "—"})</td></tr>
								<tr><td>History fetches</td><td className="edash-mono">{stats.historyFetches} ({stats.historyLatencyMs !== null ? `${stats.historyLatencyMs}ms` : "—"})</td></tr>
								<tr><td>History rows</td><td className="edash-mono">{stats.historyRows.toLocaleString()}</td></tr>
								<tr><td>Calibration factor</td><td className="edash-mono">{CALIBRATION.factor} (pre {timeLabel(CALIBRATION.boundaryMs)})</td></tr>
							</tbody>
						</table>
					</div>

					{/* Calculation trace */}
					<div className="edash-diag-section" style={{ gridColumn: "1 / -1" }}>
						<h4>Calculation Trace</h4>
						<div className="edash-trace">
							{lines.map((l, i) => (
								<div key={i}>{l}</div>
							))}
						</div>
					</div>

					{/* Constants */}
					<div className="edash-diag-section">
						<h4>Constants</h4>
						<table className="edash-diag-table">
							<tbody>
								{Object.entries(C).map(([k, v]) => (
									<tr key={k}>
										<td>{k}</td>
										<td className="edash-mono">{String(v)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{/* Hourly profile */}
					<div className="edash-diag-section">
						<h4>Hourly Profile (avg kWh/hr)</h4>
						<table className="edash-diag-table">
							<thead>
								<tr>
									<td style={{ fontWeight: 700 }}>Hour</td>
									<td style={{ fontWeight: 700 }}>All days</td>
									<td style={{ fontWeight: 700 }}>Weekdays</td>
								</tr>
							</thead>
							<tbody>
								{a.prof.map((v, h) => (
									<tr key={h}>
										<td>{String(h).padStart(2, "0")}:00</td>
										<td className="edash-mono">{v.toFixed(4)}</td>
										<td className="edash-mono">{(a.wdProf[h] ?? 0).toFixed(4)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}
