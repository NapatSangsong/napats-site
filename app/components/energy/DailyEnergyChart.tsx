import { useMemo, useState } from "react";
import type { Analysis } from "~/lib/energy-calc";
import { dayNum, dayNumFromYmd, hourOf } from "~/lib/energy-calc";
import { f2 } from "~/lib/energy-format";
import { ChartTip, useChartTip } from "./useChartTip";

/** Section — Tuya-style energy explorer (Day / Month / Year).
 *  Mirrors the Smart Meter app "Forward Energy" curve: a smooth blue line
 *  over a flat magenta "Reverse Energy" baseline, with a date selector and a
 *  pulsing dot on the live (most-recent) bucket. Reuses a.dh / a.daily — no
 *  recomputation, all BKK-time via the shared helpers. */

type Mode = "day" | "month" | "year";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86400 * 1000;

/** BKK calendar parts for a dayNum (UTC getters on day*DAY_MS = BKK date). */
function partsOfDay(day: number): { y: number; m: number; d: number } {
	const dt = new Date(day * DAY_MS);
	return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}
const daysInMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

interface Series {
	values: number[]; // bucket totals (kWh)
	xLabels: Array<{ i: number; text: string }>; // axis ticks
	periodLabel: string; // selector caption
	unit: string; // "ชม." | "วัน" | "เดือน"
	currentIdx: number | null; // pulsing live bucket, else null
	start: number; // period start dayNum (for nav bounds)
	end: number; // period end dayNum
	/** trend overlay (dashed): null entries = no data for that bucket */
	overlay: (number | null)[] | null;
	overlayLabel: string | null;
}

/** Catmull-Rom → cubic bézier: smooth curve through every point. */
function smoothPath(pts: Array<{ x: number; y: number }>): string {
	if (pts.length === 0) return "";
	if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
	let d = `M ${pts[0].x},${pts[0].y}`;
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[i - 1] ?? pts[i];
		const p1 = pts[i];
		const p2 = pts[i + 1];
		const p3 = pts[i + 2] ?? p2;
		const cp1x = p1.x + (p2.x - p0.x) / 6;
		const cp1y = p1.y + (p2.y - p0.y) / 6;
		const cp2x = p2.x - (p3.x - p1.x) / 6;
		const cp2y = p2.y - (p3.y - p1.y) / 6;
		d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
	}
	return d;
}

export function DailyEnergyChart({ a }: { a: Analysis }) {
	const minDay = dayNum(a.t0);
	const maxDay = dayNum(a.t1);
	const latestHour = hourOf(a.t1);

	const [mode, setMode] = useState<Mode>("day");
	const [anchor, setAnchor] = useState<number>(maxDay); // a dayNum inside the period
	const { tip, point, surface, wrapRef } = useChartTip();

	const s: Series = useMemo(() => {
		if (mode === "day") {
			const values = Array.from({ length: 24 }, (_, h) => a.dh.get(anchor * 24 + h) ?? 0);
			const { y, m, d } = partsOfDay(anchor);
			// week-over-week ghost: same weekday last week, when we have that day
			const lastWeek = anchor - 7;
			const hasLastWeek = a.daily.has(lastWeek);
			return {
				values,
				xLabels: [0, 6, 12, 18, 23].map((i) => ({ i, text: `${String(i).padStart(2, "0")}:00` })),
				periodLabel: `${y}/${String(m + 1).padStart(2, "0")}/${String(d).padStart(2, "0")}`,
				unit: "ชม.",
				currentIdx: anchor === maxDay ? latestHour : null,
				start: anchor,
				end: anchor,
				overlay: hasLastWeek
					? Array.from({ length: 24 }, (_, h) => a.dh.get(lastWeek * 24 + h) ?? 0)
					: null,
				overlayLabel: hasLastWeek ? "สัปดาห์ก่อน (วันเดียวกัน)" : null,
			};
		}
		if (mode === "month") {
			const { y, m } = partsOfDay(anchor);
			const first = dayNumFromYmd(y, m + 1, 1);
			const n = daysInMonth(y, m);
			const values = Array.from({ length: n }, (_, i) => a.daily.get(first + i) ?? 0);
			const ticks = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
			// 7-day moving average over days that actually have data (≤ today)
			const ma7: (number | null)[] = Array.from({ length: n }, (_, i) => {
				const day = first + i;
				if (day > maxDay) return null;
				let sum = 0;
				let cnt = 0;
				for (let dd = day - 6; dd <= day; dd++) {
					const v = a.daily.get(dd);
					if (v != null) {
						sum += v;
						cnt++;
					}
				}
				return cnt > 0 ? sum / cnt : null;
			});
			const hasMa = ma7.some((v) => v != null);
			return {
				values,
				xLabels: [...new Set(ticks)].map((i) => ({ i, text: String(i + 1) })),
				periodLabel: `${MONTHS[m]} ${y}`,
				unit: "วัน",
				currentIdx: maxDay >= first && maxDay < first + n ? maxDay - first : null,
				start: first,
				end: first + n - 1,
				overlay: hasMa ? ma7 : null,
				overlayLabel: hasMa ? "ค่าเฉลี่ยเคลื่อนที่ 7 วัน" : null,
			};
		}
		// year: 12 monthly totals
		const { y } = partsOfDay(anchor);
		const values = MONTHS.map((_, m0) => {
			const first = dayNumFromYmd(y, m0 + 1, 1);
			const last = dayNumFromYmd(y, m0 + 2, 0);
			let sum = 0;
			for (let d = first; d <= last; d++) sum += a.daily.get(d) ?? 0;
			return sum;
		});
		const { m: curM } = partsOfDay(maxDay);
		return {
			values,
			xLabels: [0, 3, 6, 9, 11].map((i) => ({ i, text: MONTHS[i] })),
			periodLabel: String(y),
			unit: "เดือน",
			currentIdx: partsOfDay(maxDay).y === y ? curM : null,
			start: dayNumFromYmd(y, 1, 1),
			end: dayNumFromYmd(y, 12, 31),
			overlay: null,
			overlayLabel: null,
		};
	}, [mode, anchor, a, maxDay, latestHour]);

	const canPrev = s.start > minDay;
	const canNext = s.end < maxDay;
	const step = (dir: -1 | 1) => {
		const target = dir < 0 ? s.start - 1 : s.end + 1;
		setAnchor(Math.min(maxDay, Math.max(minDay, target)));
	};
	const switchMode = (next: Mode) => {
		setMode(next);
		setAnchor((cur) => Math.min(maxDay, Math.max(minDay, cur))); // keep current period
	};

	const total = s.values.reduce((acc, v) => acc + v, 0);

	// ---- SVG geometry (matches LoadCurve scale) ----
	const W = 920;
	const H = 240;
	const PL = 46;
	const PR = 12;
	const PB = 26;
	const PT = 12;
	const n = s.values.length;
	const overlayMax = s.overlay ? Math.max(...s.overlay.map((v) => v ?? 0)) : 0;
	const mx = Math.max(...s.values, overlayMax, 0) * 1.2 || 1;
	const X = (i: number) => PL + (i * (W - PL - PR)) / Math.max(1, n - 1);
	const Y = (v: number) => H - PB - (v / mx) * (H - PB - PT);
	const baseY = Y(0);

	const pts = s.values.map((v, i) => ({ x: X(i), y: Y(v) }));
	const linePath = smoothPath(pts);
	const areaPath = pts.length
		? `${linePath} L ${X(n - 1).toFixed(1)},${baseY.toFixed(1)} L ${X(0).toFixed(1)},${baseY.toFixed(1)} Z`
		: "";
	// trend overlay path — only over the contiguous non-null prefix/segments
	const overlayPath = s.overlay
		? smoothPath(
				s.overlay
					.map((v, i) => (v == null ? null : { x: X(i), y: Y(v) }))
					.filter((p): p is { x: number; y: number } => p != null),
			)
		: "";
	const gridVals = [mx * 0.25, mx * 0.5, mx * 0.75];
	const cur = s.currentIdx != null ? pts[s.currentIdx] : null;
	const hitW = (W - PL - PR) / Math.max(1, n - 1);
	const xText = (i: number) =>
		mode === "day"
			? `${String(i).padStart(2, "0")}:00`
			: mode === "month"
				? `วันที่ ${i + 1}`
				: (MONTHS[i] ?? String(i + 1));

	const MODES: Array<[Mode, string]> = [
		["day", "วัน"],
		["month", "เดือน"],
		["year", "ปี"],
	];

	return (
		<section>
			<div className="sec-head">
				<span className="mono">⚡</span>
				<h2>พลังงานสะสม (Forward Energy)</h2>
			</div>

			<div className="de-top">
				<div className="de-seg" role="tablist" aria-label="ช่วงเวลา">
					{MODES.map(([m, label]) => (
						<button
							key={m}
							type="button"
							role="tab"
							aria-selected={mode === m}
							className={mode === m ? "on" : ""}
							onClick={() => switchMode(m)}
						>
							{label}
						</button>
					))}
				</div>
				<div className="de-totals">
					<span className="de-fwd">
						<i /> Forward <b className="mono">{f2(total)}</b> kWh
					</span>
					<span className="de-rev">
						<i /> Reverse <b className="mono">0.00</b> kWh
					</span>
				</div>
			</div>

			<div ref={wrapRef} style={{ position: "relative" }} {...surface}>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				style={{ width: "100%", height: "auto" }}
				role="img"
				aria-label={`Forward energy ${s.periodLabel}`}
			>
				<defs>
					<linearGradient id="de-fill" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="#4DA3FF" stopOpacity="0.45" />
						<stop offset="100%" stopColor="#4DA3FF" stopOpacity="0.02" />
					</linearGradient>
				</defs>

				{gridVals.map((v) => (
					<g key={v}>
						<text
							x={PL - 8}
							y={Y(v) + 3}
							fontSize="10"
							fill="#8C9AC0"
							textAnchor="end"
							fontFamily="IBM Plex Mono"
						>
							{v.toFixed(2)}
						</text>
						<line x1={PL} y1={Y(v)} x2={W - PR} y2={Y(v)} stroke="#2C3A60" strokeWidth="0.5" />
					</g>
				))}

				{areaPath && <path d={areaPath} fill="url(#de-fill)" />}
				{/* trend overlay (ghost) — drawn under the main line */}
				{overlayPath && (
					<path d={overlayPath} fill="none" stroke="#3DD6C3" strokeWidth="2" strokeDasharray="6 5" opacity="0.75" />
				)}
				{/* Reverse Energy — flat baseline (no solar export) */}
				<line x1={PL} y1={baseY} x2={W - PR} y2={baseY} stroke="#E0529C" strokeWidth="2" />
				{linePath && <path d={linePath} fill="none" stroke="#4DA3FF" strokeWidth="2.5" />}

				{cur && (
					<g className="de-pulse">
						<circle cx={cur.x} cy={cur.y} r="9" fill="#4DA3FF" opacity="0.25" className="de-pulse-ring" />
						<circle cx={cur.x} cy={cur.y} r="3.5" fill="#4DA3FF" stroke="#0B1224" strokeWidth="1.5" />
					</g>
				)}

				{s.xLabels.map(({ i, text }) => (
					<text
						key={i}
						x={X(i)}
						y={H - 8}
						fontSize="10"
						fill="#8C9AC0"
						textAnchor="middle"
						fontFamily="IBM Plex Mono"
					>
						{text}
					</text>
				))}
				{/* invisible per-bucket hit columns for hover/tap labels */}
				{s.values.map((v, i) => (
					<rect
						key={`hit-${i}`}
						x={X(i) - hitW / 2}
						y={PT}
						width={hitW}
						height={H - PB - PT}
						fill="transparent"
						style={{ pointerEvents: "all", cursor: "pointer" }}
						{...point(
							`${xText(i)} · ${f2(v)} kWh${
								s.overlay && s.overlay[i] != null ? ` · ${s.overlayLabel}: ${f2(s.overlay[i] as number)}` : ""
							}`,
						)}
					/>
				))}
			</svg>
			<ChartTip tip={tip} />
			</div>

			{s.overlayLabel && (
				<div className="chart-legend">
					<span>
						<i style={{ background: "#4DA3FF" }} />
						{mode === "day" ? "วันที่เลือก" : "รายวัน"}
					</span>
					<span>
						<i style={{ background: "repeating-linear-gradient(90deg,#3DD6C3 0 6px,transparent 6px 11px)" }} />
						{s.overlayLabel}
					</span>
				</div>
			)}

			<div className="de-nav">
				<button type="button" onClick={() => step(-1)} disabled={!canPrev} aria-label="ก่อนหน้า">
					‹
				</button>
				<span className="mono">{s.periodLabel}</span>
				<button type="button" onClick={() => step(1)} disabled={!canNext} aria-label="ถัดไป">
					›
				</button>
			</div>
		</section>
	);
}
