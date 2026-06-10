import { ENERGY_CONST as C } from "~/lib/energy-calc";
import { f0 } from "~/lib/energy-format";

/** Section 02 — Load Curve 24h + solar production overlay.
 *  Exact coordinate port of svg_load_curve() in dashboard.py v10. */
export function LoadCurve({ prof, sol }: { prof: number[]; sol: number[] }) {
	const W = 920;
	const H = 240;
	const PL = 46;
	const PB = 26;
	const PT = 12;
	const mx = Math.max(...prof, ...sol) * 1.15 || 1;
	const X = (h: number) => PL + (h * (W - PL - 10)) / 23;
	const Y = (v: number) => H - PB - (v / mx) * (H - PB - PT);
	const zones: Array<[number, number, string]> = [
		[0, 9, "#2D5DB0"],
		[9, 17, "#FFB454"],
		[17, 22, "#FF6A5E"],
		[22, 24, "#2D5DB0"],
	];
	const hours = Array.from({ length: 24 }, (_, h) => h);
	const loadPts = hours.map((h) => `${X(h).toFixed(1)},${Y(prof[h]).toFixed(1)}`).join(" ");
	const solPts = hours.map((h) => `${X(h).toFixed(1)},${Y(sol[h]).toFixed(1)}`).join(" ");

	return (
		<section>
			<div className="sec-head">
				<span className="mono">02</span>
				<h2>Load Curve 24 ชม. + โซลาร์</h2>
			</div>
			<div className="bar-label">
				<b>kWh เฉลี่ยรายชั่วโมง (เส้นทึบ) vs ผลิตโซลาร์ 2kW (เส้นประ)</b>
				<span className="mono">พื้นหลัง = โซน TOU</span>
			</div>
			<svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Load curve">
				<defs>
					<linearGradient id="energy-lg" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="#3DD6C3" stopOpacity="0.7" />
						<stop offset="100%" stopColor="#3DD6C3" stopOpacity="0.05" />
					</linearGradient>
				</defs>
				{zones.map(([a, b, color]) => (
					<rect
						key={`${a}-${b}`}
						x={X(a)}
						y={PT}
						width={X(Math.min(b, 23)) - X(a) + ((W - PL - 10) / 23) * (b === 24 ? 1 : 0)}
						height={H - PB - PT}
						fill={color}
						opacity="0.10"
					/>
				))}
				{[mx * 0.25, mx * 0.5, mx * 0.75].map((v) => (
					<g key={v}>
						<text
							x={PL - 8}
							y={Y(v) + 3}
							fontSize="10"
							fill="#8C9AC0"
							textAnchor="end"
							fontFamily="IBM Plex Mono"
						>
							{v.toFixed(1)}
						</text>
						<line x1={PL} y1={Y(v)} x2={W - 10} y2={Y(v)} stroke="#2C3A60" strokeWidth="0.5" />
					</g>
				))}
				<polygon
					points={`${X(0)},${Y(0)} ${loadPts} ${X(23)},${Y(0)}`}
					fill="url(#energy-lg)"
					opacity="0.55"
				/>
				<polyline points={loadPts} fill="none" stroke="#3DD6C3" strokeWidth="2.5" />
				<polyline
					points={solPts}
					fill="none"
					stroke="#FFB454"
					strokeWidth="2.5"
					strokeDasharray="7 5"
				/>
				{hours
					.filter((h) => h % 3 === 0)
					.map((h) => (
						<text
							key={h}
							x={X(h)}
							y={H - 8}
							fontSize="10"
							fill="#8C9AC0"
							textAnchor="middle"
							fontFamily="IBM Plex Mono"
						>
							{String(h).padStart(2, "0")}
						</text>
					))}
			</svg>
			<div className="chart-legend">
				<span>
					<i style={{ background: "#3DD6C3" }} />
					การใช้ไฟจริง
				</span>
				<span>
					<i
						style={{
							background: "repeating-linear-gradient(90deg,#FFB454 0 7px,transparent 7px 12px)",
						}}
					/>
					โซลาร์ 2kW ({f0(C.SOLAR_KWH_D)} kWh/วัน)
				</span>
				<span>
					<i style={{ background: "#2D5DB0", height: 10 }} />
					Off-Peak
				</span>
				<span>
					<i style={{ background: "#FFB454", height: 10, opacity: 0.45 }} />
					Solar Window
				</span>
				<span>
					<i style={{ background: "#FF6A5E", height: 10, opacity: 0.45 }} />
					Evening Peak
				</span>
			</div>
		</section>
	);
}
