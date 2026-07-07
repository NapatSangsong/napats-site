import type { Forecast, Savings } from "~/lib/energy-calc";
import { isCycleStartDay } from "~/lib/energy-calc";
import { dayMonth, dayOnly, f1, f2, money } from "~/lib/energy-format";
import { ChartTip, useChartTip } from "./useChartTip";

/** Section 05 — cumulative TOU savings vs the 3,350฿ meter cost.
 *  Exact coordinate port of svg_savings() in dashboard.py v10. */
export function SavingsChart({ sv, fc }: { sv: Savings; fc: Forecast }) {
	const W = 920;
	const H = 220;
	const PL = 56;
	const PB = 26;
	const PT = 14;
	const ser = sv.series;
	const mx = sv.cumEnd * 1.1 || 1;
	const n = ser.length;
	const X = (i: number) => PL + (i * (W - PL - 10)) / Math.max(n - 1, 1);
	const Y = (v: number) => H - PB - (v / mx) * (H - PB - PT);
	const { tip, point, surface, wrapRef } = useChartTip();
	const hitW = (W - PL - 10) / Math.max(n - 1, 1);
	const ptsActual = ser
		.map((s, i) => ({ s, i }))
		.filter(({ s }) => s.kind !== "fc")
		.map(({ s, i }) => `${X(i).toFixed(1)},${Y(s.cum).toFixed(1)}`)
		.join(" ");
	const ptsForecast = ser
		.map((s, i) => ({ s, i }))
		.filter(({ s }) => s.kind === "fc" || s.kind === "today")
		.map(({ s, i }) => `${X(i).toFixed(1)},${Y(s.cum).toFixed(1)}`)
		.join(" ");

	// Install day marker — always index 0 (series starts at install day)
	const installX = X(0);

	// Billing-cycle boundary markers: cycle start (the 2nd) in the series
	const monthMarkers = ser
		.map((s, i) => ({ s, i }))
		.filter(({ s }) => isCycleStartDay(s.day));

	return (
		<section>
			<div className="sec-head">
				<span className="mono">05</span>
				<h2>เงินประหยัดสะสม (TOU ประหยัดกว่า Flat)</h2>
			</div>
			<div className="bar-label">
				<b>TOU ประหยัดกว่า Flat สะสม — นับแต่ติดตั้งมิเตอร์ TOU 19 มิ.ย. 10:30</b>
				<span className="mono">เส้นทึบ = วัดจริง · เส้นประ = forecast</span>
			</div>
			<div ref={wrapRef} style={{ position: "relative" }} {...surface}>
			<svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Cumulative savings">
				<text
					x={PL - 8}
					y={Y(0) + 3}
					fontSize="10"
					fill="#8C9AC0"
					textAnchor="end"
					fontFamily="IBM Plex Mono"
				>
					0
				</text>

				{/* TOU installation date marker */}
				<line x1={installX} x2={installX} y1={PT} y2={H - PB} stroke="#ffb454" strokeWidth="1.5" />
				<text x={installX + 4} y={PT + 10} fontSize="9" fill="#ffb454" fontFamily="IBM Plex Mono">
					ติดตั้ง TOU 19 มิ.ย.
				</text>

				{/* Monthly billing cycle boundaries */}
				{monthMarkers.map(({ s, i }) => (
					<g key={`mb-${s.day}`}>
						<line x1={X(i)} x2={X(i)} y1={PT} y2={H - PB} stroke="#2c3a60" strokeWidth="1" strokeDasharray="3 3" />
						<text x={X(i) + 3} y={H - PB - 4} fontSize="8" fill="#8C9AC0" fontFamily="IBM Plex Mono">
							รอบ {dayMonth(s.day)}
						</text>
					</g>
				))}

				{ptsActual && (
					<polyline points={ptsActual} fill="none" stroke="#5AE08F" strokeWidth="2.5" />
				)}
				{ptsForecast && (
					<polyline
						points={ptsForecast}
						fill="none"
						stroke="#5AE08F"
						strokeWidth="2.5"
						strokeDasharray="6 5"
						opacity="0.75"
					/>
				)}
				{ser.map((s, i) =>
					i % 2 === 0 ? (
						<text
							key={s.day}
							x={X(i)}
							y={H - 8}
							fontSize="10"
							fill="#8C9AC0"
							textAnchor="middle"
							fontFamily="IBM Plex Mono"
						>
							{dayOnly(s.day)}
						</text>
					) : null,
				)}
				{/* invisible per-day hit columns for hover/tap labels */}
				{ser.map((s, i) => (
					<rect
						key={`hit-${s.day}`}
						x={X(i) - hitW / 2}
						y={PT}
						width={hitW}
						height={H - PB - PT}
						fill="transparent"
						style={{ pointerEvents: "all", cursor: "pointer" }}
						{...point(`${dayMonth(s.day)} · สะสม ${money(s.cum)}฿${s.kind === "fc" ? " (คาด)" : ""}`)}
					/>
				))}
			</svg>
			<ChartTip tip={tip} />
			</div>
			<div className="vstats" style={{ marginTop: 24 }}>
				<div className="vstat">
					<span className="mono">{money(sv.cumEnd)} ฿</span>
					<span>ประหยัดสะสมภายใน {dayMonth(fc.forecastEnd)} (TOU เทียบ Flat)</span>
				</div>
				<div className="vstat">
					<span className="mono">{f1(sv.avgD)} ฿/วัน</span>
					<span>อัตราประหยัดเฉลี่ย นับแต่ติดตั้ง (สเกล MEA ×{f2(sv.scaleUp)})</span>
				</div>
			</div>
		</section>
	);
}
