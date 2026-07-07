import { useEffect, useState } from "react";
import type { Analysis } from "~/lib/energy-calc";
import { ENERGY_CONST, dayNumFromYmd, weekdayOf } from "~/lib/energy-calc";
import { f1, f2, money } from "~/lib/energy-format";
import { ChartTip, useChartTip } from "./useChartTip";

interface SolarHour {
	hour: number;
	kwh: number;
	cloud: number;
}
interface SolarDay {
	date: string;
	totalKwh: number;
	peakHour: number;
	peakKw: number;
	hours: SolarHour[];
}
interface SolarResp {
	ok: boolean;
	kwp: number;
	pr: number;
	days: SolarDay[];
}

const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

/** "วันนี้ / พรุ่งนี้ / มะรืน" then weekday for the rest. */
function dayLabel(date: string, idx: number): string {
	if (idx === 0) return "วันนี้";
	if (idx === 1) return "พรุ่งนี้";
	if (idx === 2) return "มะรืน";
	const [y, m, d] = date.split("-").map(Number);
	return DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Section — SIMULATED 4 kWp rooftop-solar production forecast (the system
 *  installed 21 ก.ค. 2569). A weather-driven preview of how much it makes,
 *  hour by hour, for the next few days. */
export function SolarForecast({ a, solarPr }: { a: Analysis; solarPr: number }) {
	const [data, setData] = useState<SolarResp | null>(null);
	const [sel, setSel] = useState(1); // default พรุ่งนี้
	const kw = 4; // ระบบที่ติดจริง 4kW (ไม่มีตัวเลือก 2kW แล้ว)
	const { tip, point, surface, wrapRef } = useChartTip();

	useEffect(() => {
		let alive = true;
		fetch("/api/energy/solar")
			.then((r) => r.json() as Promise<SolarResp>)
			.then((j) => {
				if (alive && j.ok) setData(j);
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, []);

	const head = (
		<div className="sec-head house-head">
			<span className="mono">☀︎</span>
			<h2>จำลองผลิตไฟ โซลาร์รูฟ {kw}kW</h2>
			<div className="house-badges">
				<span className="solar-sim">พรีวิว · ยังไม่ติดจริง</span>
			</div>
		</div>
	);

	if (!data || data.days.length === 0) {
		return (
			<section>
				{head}
				<p className="sub">กำลังโหลดพยากรณ์การผลิต…</p>
			</section>
		);
	}

	// API returns production for a data.kwp (=2) kW reference at PR data.pr — scale
	// linearly by kW, and rescale PR (server PR → the chosen best/worst/ideal case).
	const scale = (data.kwp > 0 ? kw / data.kwp : 1) * (data.pr > 0 ? solarPr / data.pr : 1);
	const idx = Math.min(sel, data.days.length - 1);
	const raw = data.days[idx];
	const day = {
		...raw,
		totalKwh: raw.totalKwh * scale,
		peakKw: raw.peakKw != null ? raw.peakKw * scale : raw.peakKw,
		hours: raw.hours.map((h) => ({ ...h, kwh: h.kwh * scale })),
	};
	const hrs = day.hours.filter((h) => h.hour >= 6 && h.hour <= 18);

	// ---- on-peak offset: how much of the solar the 4kW system could actually
	// cancel against this house's typical hourly load (no export, so only the
	// concurrent min(solar, load) is useful). ฿ saved at the TOU rate per hour.
	const [yy, mm, dd] = day.date.split("-").map(Number);
	const wd = weekdayOf(dayNumFromYmd(yy, mm, dd));
	const prof = wd < 5 ? a.wdProf : a.prof;
	let onPeakUseful = 0;
	let offPeakUseful = 0;
	let eveningSolar = 0;
	for (const h of day.hours) {
		const useful = Math.min(h.kwh, prof[h.hour] ?? 0);
		if (wd < 5 && h.hour >= 9 && h.hour < 22) onPeakUseful += useful;
		else offPeakUseful += useful;
		if (h.hour >= 17 && h.hour < 22) eveningSolar += h.kwh;
	}
	const selfUse = onPeakUseful + offPeakUseful;
	const waste = Math.max(0, day.totalKwh - selfUse);
	const util = day.totalKwh > 0 ? selfUse / day.totalKwh : 0;
	const saveBaht = onPeakUseful * ENERGY_CONST.TOU_ON + offPeakUseful * ENERGY_CONST.TOU_OFF;
	const verdict =
		util < 0.55
			? `${kw}kW ใหญ่กว่าโหลดกลางวัน — ส่วนเกินถูกทิ้ง (ยังไม่ขายคืน) ลองขนาดเล็กลง ย้ายโหลดมากลางวัน หรือเพิ่มแบตเตอรี่`
			: util < 0.85
				? `${kw}kW พอเหมาะกับโหลดกลางวัน ใช้ได้เกือบหมด`
				: `โหลดกลางวันสูงกว่าที่ ${kw}kW ผลิต — ใช้หมดทุกหน่วย ขยายขนาดได้อีก`;

	// ---- grouped bars: solar produced vs house's typical load, per hour ----
	const W = 920;
	const Hh = 230;
	const PL = 42;
	const PR = 12;
	const PB = 26;
	const PT = 12;
	const n = hrs.length || 1;
	const loadOf = (hour: number) => prof[hour] ?? 0;
	const mx = Math.max(...hrs.map((h) => Math.max(h.kwh, loadOf(h.hour))), 0.1) * 1.18;
	const slot = (W - PL - PR) / n;
	const pad = slot * 0.16;
	const bw = Math.max(2, (slot - pad * 2) / 2 - 1.5);
	const Xprod = (i: number) => PL + i * slot + pad;
	const Xload = (i: number) => PL + i * slot + pad + bw + 3;
	const Xmid = (i: number) => PL + i * slot + slot / 2;
	const Y = (v: number) => Hh - PB - (v / mx) * (Hh - PB - PT);
	const grid = [mx * 0.25, mx * 0.5, mx * 0.75];

	return (
		<section>
			{head}

			<div className="solar-note">
				🔌 ภาพจำลอง — <b>ยังไม่ได้ติดตั้ง/ต่อเข้าบ้าน</b> ขณะนี้ใช้ไฟการไฟฟ้า 100% · ดูไว้ว่าถ้าติดโซลาร์ {kw}kW จะผลิตได้เท่าไหร่
			</div>

			<div className="solar-days">
				{data.days.map((d, i) => (
					<button
						key={d.date}
						type="button"
						className={`solar-day${i === idx ? " on" : ""}`}
						onClick={() => setSel(i)}
					>
						<span className="d-name">{dayLabel(d.date, i)}</span>
						<span className="d-kwh mono">{f1(d.totalKwh * scale)}</span>
						<span className="d-unit">kWh</span>
					</button>
				))}
			</div>

			<div className="bar-label">
				<b>ผลิต vs ใช้จริง รายชั่วโมง — {dayLabel(day.date, idx)}</b>
				<span className="mono">
					รวม {f2(day.totalKwh)} kWh · พีค ~{String(day.peakHour).padStart(2, "0")}:00
				</span>
			</div>

			<div ref={wrapRef} style={{ position: "relative" }} {...surface}>
			<svg viewBox={`0 0 ${W} ${Hh}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Solar hourly forecast">
				<defs>
					<linearGradient id="solar-bar" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="#ffd98a" />
						<stop offset="100%" stopColor="#f09a2e" />
					</linearGradient>
					<linearGradient id="load-bar" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="#5fe6d4" />
						<stop offset="100%" stopColor="#2aa595" />
					</linearGradient>
				</defs>
				{grid.map((v) => (
					<g key={v}>
						<text x={PL - 8} y={Y(v) + 3} fontSize="10" fill="#8C9AC0" textAnchor="end" fontFamily="IBM Plex Mono">
							{v.toFixed(1)}
						</text>
						<line x1={PL} y1={Y(v)} x2={W - PR} y2={Y(v)} stroke="#2C3A60" strokeWidth="0.5" />
					</g>
				))}
				{hrs.map((h, i) => {
					const isPeak = h.hour === day.peakHour;
					const sTop = Y(h.kwh);
					const ld = loadOf(h.hour);
					const lTop = Y(ld);
					return (
						<g key={h.hour}>
							<rect
								x={Xprod(i)}
								y={sTop}
								width={bw}
								height={Math.max(0, Hh - PB - sTop)}
								rx="2"
								fill={isPeak ? "#ffb454" : "url(#solar-bar)"}
								opacity={h.kwh > 0 ? 1 : 0.15}
								style={{ cursor: "pointer" }}
								{...point(`${String(h.hour).padStart(2, "0")}:00 · ผลิต ${f2(h.kwh)} kWh · เมฆ ${h.cloud}%`)}
							/>
							<rect
								x={Xload(i)}
								y={lTop}
								width={bw}
								height={Math.max(0, Hh - PB - lTop)}
								rx="2"
								fill="url(#load-bar)"
								opacity={ld > 0 ? 0.92 : 0.12}
								style={{ cursor: "pointer" }}
								{...point(`${String(h.hour).padStart(2, "0")}:00 · ใช้จริง ${f2(ld)} kWh`)}
							/>
						</g>
					);
				})}
				{hrs.map((h, i) =>
					h.hour % 3 === 0 ? (
						<text
							key={h.hour}
							x={Xmid(i)}
							y={Hh - 8}
							fontSize="10"
							fill="#8C9AC0"
							textAnchor="middle"
							fontFamily="IBM Plex Mono"
						>
							{String(h.hour).padStart(2, "0")}
						</text>
					) : null,
				)}
			</svg>
			<ChartTip tip={tip} />
			</div>

			<div className="chart-legend">
				<span>
					<i style={{ background: "#ffb454" }} />
					ผลิต (โซลาร์ {kw}kW)
				</span>
				<span>
					<i style={{ background: "#3dd6c3" }} />
					ใช้จริง (เฉลี่ย/ชม.)
				</span>
			</div>

			<div className="solar-stats">
				<div className="house-chip">
					<span className="mono lead" style={{ color: "#ffb454" }}>
						{f2(day.totalKwh)}
						<small> kWh</small>
					</span>
					<span>ผลิตได้ทั้งวัน</span>
				</div>
				<div className="house-chip">
					<span className="mono">
						~{day.peakKw != null ? f2(day.peakKw) : "—"}
						<small> kWh</small>
					</span>
					<span>พีคชั่วโมง ~{String(day.peakHour).padStart(2, "0")}:00</span>
				</div>
				<div className="house-chip">
					<span className="mono">
						{kw}
						<small> kW</small>
					</span>
					<span>ขนาดระบบ (PR {solarPr})</span>
				</div>
			</div>

			<div className="solar-offset">
				<div className="so-head">
					<span>☀️→⚡ หักล้างค่าไฟได้ (ประเมินจากโหลดบ้านจริง)</span>
				</div>
				<div className="so-grid">
					<div className="so-item">
						<b className="mono peak">{f2(onPeakUseful)}</b>
						<span>หักล้าง On-Peak (kWh)</span>
					</div>
					<div className="so-item">
						<b className="mono good">฿{money(saveBaht)}</b>
						<span>ประหยัด/วัน (โดยประมาณ)</span>
					</div>
					<div className="so-item">
						<b className="mono">{Math.round(util * 100)}%</b>
						<span>ใช้เอง · ทิ้ง {f1(waste)} kWh</span>
					</div>
				</div>
				<p className="so-note">
					พีคเย็น 17–22 น. โซลาร์ช่วยได้แค่ <b>{f2(eveningSolar)} kWh</b> (แดดหมดแล้ว) — ถ้าจะกินพีคเย็นต้องมีแบตเตอรี่
				</p>
				<p className="so-verdict">📐 {verdict}</p>
			</div>

			<details className="solar-method">
				<summary>วิธีคำนวณค่าพยากรณ์การผลิต</summary>
				<div>
					<p>
						ใช้พยากรณ์ <b>ความเข้มแสงอาทิตย์ (GHI)</b> รายชั่วโมงจาก Open-Meteo ที่พิกัดบางใหญ่ แล้วประเมินกำลังผลิตด้วยสูตร:
					</p>
					<p className="mono formula">
						kWh/ชม. = GHI(W/m²) ÷ 1000 × {kw} kW × PR {solarPr}
					</p>
					<ul>
						<li>1000 W/m² = สภาวะมาตรฐาน STC</li>
						<li>PR {solarPr} = Performance Ratio (รวมการสูญเสียจาก inverter · ความร้อน · ฝุ่น)</li>
						<li>“ใช้จริง” = โปรไฟล์โหลดเฉลี่ยต่อชั่วโมงจากมิเตอร์จริง · หักล้าง = Σ min(ผลิต, โหลด)</li>
						<li>วันแดดจัด ~8 kWh/วัน (สอดคล้องสมมติฐานเดิมของแดชบอร์ด)</li>
					</ul>
					<p className="dim">อัปเดตทุกชั่วโมง · เป็นค่าประมาณจากพยากรณ์อากาศ ไม่ใช่การผลิตจริง (ยังไม่ได้ติดตั้ง)</p>
				</div>
			</details>
		</section>
	);
}
