import { useEffect, useState } from "react";
import { hourOf, minuteOf } from "~/lib/energy-calc";
import { f1, f2 } from "~/lib/energy-format";

interface GridSample {
	ts: number;
	v: number;
	w: number;
	f: number;
}
interface GridDaily {
	day: number;
	date: string;
	totalKwh: number;
	vmin: number | null;
	vmax: number | null;
	samples: number;
}
interface GridResp {
	ok: boolean;
	samples: GridSample[];
	daily: GridDaily[];
}

/** MEA LV nominal 220 V — caution beyond ±5%, out-of-range beyond ±10%. */
const NOMINAL = 220;
const CAUTION_LO = NOMINAL * 0.95; // 209
const CAUTION_HI = NOMINAL * 1.05; // 231
const RANGE_LO = NOMINAL * 0.9; // 198
const RANGE_HI = NOMINAL * 1.1; // 242

const hhmm = (ts: number) =>
	`${String(hourOf(ts)).padStart(2, "0")}:${String(minuteOf(ts)).padStart(2, "0")}`;

/** Section — grid quality: voltage curve (48 h) with MEA bands + daily
 *  min/max ranges. Samples land every 15 min from the cron; the panel shows a
 *  collecting state until there is enough to plot. */
export function GridQuality() {
	const [data, setData] = useState<GridResp | null>(null);

	useEffect(() => {
		let alive = true;
		const load = () =>
			fetch("/api/energy/grid")
				.then((r) => r.json() as Promise<GridResp>)
				.then((j) => {
					if (alive && j.ok) setData(j);
				})
				.catch(() => {});
		load();
		const t = window.setInterval(() => {
			if (!document.hidden) load();
		}, 10 * 60_000);
		return () => {
			alive = false;
			window.clearInterval(t);
		};
	}, []);

	const head = (
		<div className="sec-head">
			<span className="mono">∿</span>
			<h2>คุณภาพไฟจากการไฟฟ้า (Grid)</h2>
		</div>
	);

	const samples = data?.samples ?? [];
	if (!data || samples.length < 2) {
		return (
			<section>
				{head}
				<div className="card empty-card">
					<div className="big-ico">🔌</div>
					<h3>กำลังเก็บตัวอย่างแรงดัน/ความถี่</h3>
					<p className="sub" style={{ marginTop: 8 }}>
						ระบบบันทึกจากมิเตอร์ทุก 15 นาที — มีกราฟให้ดูหลังสะสมไม่กี่ชั่วโมง
					</p>
				</div>
			</section>
		);
	}

	const latest = samples[samples.length - 1];
	let vlo = Infinity;
	let vhi = -Infinity;
	for (const s of samples) {
		if (s.v < vlo) vlo = s.v;
		if (s.v > vhi) vhi = s.v;
	}
	const anyOut = vlo < RANGE_LO || vhi > RANGE_HI;
	const anyCaution = !anyOut && (vlo < CAUTION_LO || vhi > CAUTION_HI);
	const status = anyOut ? "ผิดปกติ" : anyCaution ? "เฝ้าระวัง" : "ปกติ";
	const statusCls = anyOut ? "bad" : anyCaution ? "warn" : "good";

	// ---- 48h voltage chart ----
	const W = 920;
	const H = 230;
	const PL = 46;
	const PR = 12;
	const PB = 26;
	const PT = 12;
	const t0 = samples[0].ts;
	const t1 = latest.ts;
	const span = Math.max(1, t1 - t0);
	const yLo = Math.min(RANGE_LO - 4, Math.floor(vlo) - 2);
	const yHi = Math.max(RANGE_HI + 4, Math.ceil(vhi) + 2);
	const X = (ts: number) => PL + ((ts - t0) / span) * (W - PL - PR);
	const Y = (v: number) => H - PB - ((v - yLo) / (yHi - yLo)) * (H - PB - PT);
	const linePts = samples.map((s) => `${X(s.ts).toFixed(1)},${Y(s.v).toFixed(1)}`).join(" ");
	const band = (lo: number, hi: number) => ({ y: Y(hi), h: Math.max(0, Y(lo) - Y(hi)) });
	const cautionBand = band(CAUTION_LO, CAUTION_HI);
	const rangeBand = band(RANGE_LO, RANGE_HI);
	// x ticks: ~6 evenly spaced
	const ticks = Array.from({ length: 6 }, (_, i) => t0 + (span * i) / 5);

	// ---- daily min/max ranges (last 14 days with voltage data) ----
	const dayRanges = (data.daily ?? []).filter((d) => d.vmin != null && d.vmax != null).slice(-14);

	return (
		<section>
			{head}

			<div className="house-stats" style={{ marginBottom: 14 }}>
				<div className="house-chip">
					<span className="mono lead">{f1(latest.v)}<small> V</small></span>
					<span>
						แรงดันล่าสุด · <b className={`gq-${statusCls}`}>{status}</b>
					</span>
				</div>
				<div className="house-chip">
					<span className="mono">
						{f1(vlo)}–{f1(vhi)}<small> V</small>
					</span>
					<span>ช่วง 48 ชม.</span>
				</div>
				<div className="house-chip">
					<span className="mono">{f2(latest.f)}<small> Hz</small></span>
					<span>ความถี่ล่าสุด</span>
				</div>
			</div>

			<div className="bar-label">
				<b>แรงดันไฟ 48 ชม.</b>
				<span className="mono">เกณฑ์ 220V · เหลือง ±5% · แดง ±10%</span>
			</div>
			<svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Voltage 48h">
				{/* out-of-range zones (red) above/below ±10% */}
				<rect x={PL} y={PT} width={W - PL - PR} height={Math.max(0, rangeBand.y - PT)} fill="#FF6A5E" opacity="0.08" />
				<rect
					x={PL}
					y={rangeBand.y + rangeBand.h}
					width={W - PL - PR}
					height={Math.max(0, H - PB - (rangeBand.y + rangeBand.h))}
					fill="#FF6A5E"
					opacity="0.08"
				/>
				{/* caution band edges ±5% */}
				<rect x={PL} y={cautionBand.y} width={W - PL - PR} height={cautionBand.h} fill="#5AE08F" opacity="0.05" />
				{[
					[RANGE_LO, "#FF6A5E"],
					[CAUTION_LO, "#FFB454"],
					[CAUTION_HI, "#FFB454"],
					[RANGE_HI, "#FF6A5E"],
				].map(([v, c]) => (
					<g key={v as number}>
						<line x1={PL} y1={Y(v as number)} x2={W - PR} y2={Y(v as number)} stroke={c as string} strokeWidth="0.8" strokeDasharray="4 4" opacity="0.6" />
						<text x={PL - 8} y={Y(v as number) + 3} fontSize="10" fill="#8C9AC0" textAnchor="end" fontFamily="IBM Plex Mono">
							{v as number}
						</text>
					</g>
				))}
				{/* nominal */}
				<line x1={PL} y1={Y(NOMINAL)} x2={W - PR} y2={Y(NOMINAL)} stroke="#8C9AC0" strokeWidth="0.6" strokeDasharray="2 4" opacity="0.7" />
				<polyline points={linePts} fill="none" stroke="#4DA3FF" strokeWidth="2" />
				<circle cx={X(latest.ts)} cy={Y(latest.v)} r="3.5" fill="#4DA3FF" stroke="#0B1224" strokeWidth="1.5" />
				{ticks.map((ts, i) => (
					<text key={i} x={X(ts)} y={H - 8} fontSize="10" fill="#8C9AC0" textAnchor="middle" fontFamily="IBM Plex Mono">
						{hhmm(ts)}
					</text>
				))}
			</svg>

			{dayRanges.length >= 2 && (
				<>
					<div className="bar-label" style={{ marginTop: 18 }}>
						<b>ช่วงแรงดันรายวัน (ต่ำสุด–สูงสุด)</b>
						<span className="mono">{dayRanges.length} วันล่าสุด</span>
					</div>
					<svg viewBox={`0 0 ${W} 170`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Daily voltage range">
						{(() => {
							const PB2 = 24;
							const PT2 = 10;
							const Y2 = (v: number) => 170 - PB2 - ((v - yLo) / (yHi - yLo)) * (170 - PB2 - PT2);
							const slot = (W - PL - PR) / dayRanges.length;
							return (
								<>
									{[CAUTION_LO, CAUTION_HI].map((v) => (
										<line key={v} x1={PL} y1={Y2(v)} x2={W - PR} y2={Y2(v)} stroke="#FFB454" strokeWidth="0.6" strokeDasharray="4 4" opacity="0.5" />
									))}
									{dayRanges.map((d, i) => {
										const x = PL + i * slot + slot / 2;
										const out = (d.vmin ?? NOMINAL) < RANGE_LO || (d.vmax ?? NOMINAL) > RANGE_HI;
										const color = out ? "#FF6A5E" : "#3DD6C3";
										return (
											<g key={d.day}>
												<line x1={x} y1={Y2(d.vmax ?? NOMINAL)} x2={x} y2={Y2(d.vmin ?? NOMINAL)} stroke={color} strokeWidth="4" strokeLinecap="round" opacity="0.85">
													<title>{`${d.date} · ${f1(d.vmin ?? 0)}–${f1(d.vmax ?? 0)} V (${d.samples} จุด)`}</title>
												</line>
												<text x={x} y={170 - 8} fontSize="9" fill="#8C9AC0" textAnchor="middle" fontFamily="IBM Plex Mono">
													{d.date.slice(8)}
												</text>
											</g>
										);
									})}
								</>
							);
						})()}
					</svg>
				</>
			)}

			<p className="pt-note">
				เก็บจากมิเตอร์ทุก 15 นาที · เกณฑ์อ้างอิง 220V (เฝ้าระวังเกิน ±5% · ผิดปกติเกิน ±10%) — ไฟตก/ไฟเกินบ่อยช่วงไหนจะเห็นจากกราฟนี้
			</p>
		</section>
	);
}
