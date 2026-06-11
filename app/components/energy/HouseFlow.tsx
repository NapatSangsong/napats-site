import { useEffect, useState } from "react";
import type { Analysis } from "~/lib/energy-calc";
import { ENERGY_CONST, dayNum, hourOf, weekdayOf } from "~/lib/energy-calc";
import { f1, f2, money } from "~/lib/energy-format";
import type { LiveData } from "./types";

/** fixed star field (deterministic — no hydration drift) */
const STARS: Array<[number, number, number]> = [
	[210, 60, 1.4],
	[330, 40, 1],
	[420, 78, 1.6],
	[486, 44, 1.1],
	[700, 56, 1.3],
	[770, 100, 1],
	[860, 130, 1.5],
	[160, 150, 1.1],
];

interface Weather {
	ok: boolean;
	tempC: number | null;
	feelsC: number | null;
	humidity: number | null;
	code: number | null;
	cloudPct: number | null;
	isDay: boolean;
	precipProb: number | null;
}

/** WMO weather code → emoji + Thai label (night variants for clear/partly). */
function wmo(code: number | null, isDay: boolean): { icon: string; label: string } {
	if (code == null) return { icon: "🌡️", label: "—" };
	if (code === 0) return { icon: isDay ? "☀️" : "🌙", label: "ท้องฟ้าแจ่มใส" };
	if (code <= 2) return { icon: isDay ? "🌤️" : "🌙", label: "มีเมฆบางส่วน" };
	if (code === 3) return { icon: "☁️", label: "เมฆมาก" };
	if (code <= 48) return { icon: "🌫️", label: "หมอก" };
	if (code <= 57) return { icon: "🌦️", label: "ฝนปรอย" };
	if (code <= 67) return { icon: "🌧️", label: "ฝนตก" };
	if (code <= 82) return { icon: "🌧️", label: "ฝนซู่" };
	if (code <= 99) return { icon: "⛈️", label: "ฝนฟ้าคะนอง" };
	return { icon: "🌡️", label: "—" };
}

/** Section — House energy flow (Atmoce-inspired, theme-native line art).
 *  Blue pulses run grid → house at a speed set by the real live wattage; the
 *  windows glow brighter with load. No fabricated solar production — the sun is
 *  a nod to the 2 kW recommendation, all numbers come straight from `live`. */
export function HouseFlow({
	live,
	liveOffline,
	a,
}: {
	live: LiveData | null;
	liveOffline: boolean;
	a: Analysis;
}) {
	// today's kWh — same rule as LiveNow (live meter counts only within the gap)
	const today = dayNum(Date.now());
	const liveExtra =
		live && live.ts - a.t1 <= ENERGY_CONST.MAX_GAP_MS
			? Math.max(0, live.meter_kwh - a.lastMeter)
			: 0;
	const todayKwh = (a.daily.get(today) ?? 0) + liveExtra;

	const w = live?.power_w ?? 0;
	// 0.15 floor keeps a faint glow at idle; ~250 W reads as "fully lit"
	const intensity = Math.max(0.15, Math.min(1, w / 250));
	const flowing = !!live && !liveOffline;
	const flowDur = `${(5.2 - 2.6 * intensity).toFixed(2)}s`;
	const dash = "—";

	// day/night by Bangkok hour — windows glow harder after dark
	const hour = hourOf(Date.now());
	const isDay = hour >= 6 && hour < 18;

	// TOU tariff state (MEA Type 1.2): on-peak = weekday 09:00–21:59, else off-peak.
	// Evening peak (17:00–21:59) is the demand window the house lights up hardest.
	const wd = weekdayOf(dayNum(Date.now()));
	const isOnPeak = wd < 5 && hour >= 9 && hour < 22;
	const isEveningPeak = hour >= 17 && hour < 22;
	const rate = isOnPeak ? ENERGY_CONST.TOU_ON : ENERGY_CONST.TOU_OFF;
	const tariffClass = isEveningPeak ? "peak" : isOnPeak ? "on" : "off";
	const tariffLabel = isEveningPeak ? "Evening Peak" : isOnPeak ? "TOU On-Peak" : "Off-Peak";
	// units used in the CURRENT TOU block — the contiguous run of same-class hours
	// today up to now (so it resets at each boundary, e.g. ~0 just after 22:00),
	// not the whole day's off-peak which would mix in the overnight 00:00–09:00.
	const classOf = (h: number) => (wd < 5 && h >= 9 && h < 22 ? "on" : "off");
	let blockStart = hour;
	while (blockStart > 0 && classOf(blockStart - 1) === classOf(hour)) blockStart--;
	let periodKwh = liveExtra;
	for (let h = blockStart; h <= hour; h++) periodKwh += a.dh.get(today * 24 + h) ?? 0;

	// brightness: real load + a boost during the costly peak windows
	const peakBoost = isEveningPeak ? 0.45 : isOnPeak ? 0.22 : 0;
	const winGlow = Math.max(0.15, Math.min(1, (isDay ? 0.32 : 0.5) + intensity * 0.35 + peakBoost));

	// tiny weather widget — refreshes every 10 min while the tab is visible
	const [wx, setWx] = useState<Weather | null>(null);
	useEffect(() => {
		let alive = true;
		const load = () =>
			fetch("/api/energy/weather")
				.then((r) => r.json() as Promise<Weather>)
				.then((j) => {
					if (alive && j.ok) setWx(j);
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

	// panels "generate" (glow) only while the sun is up; clearer sky = stronger
	const producing = wx ? wx.isDay : isDay;
	const solarGlow = producing ? Math.max(0.25, 1 - (wx?.cloudPct ?? 30) / 130) : 0;

	const WIRE = "M132,104 C 300,86 430,150 556,150";

	return (
		<section>
			<div className="sec-head house-head">
				<span className="mono">⌂</span>
				<h2>บ้านกับการไหลของไฟ</h2>
				<div className="house-badges">
					<span className="house-tod">{isDay ? "☀️ กลางวัน" : "🌙 กลางคืน"}</span>
					<span className={`house-tariff ${tariffClass}`} title={`ใช้ในช่วง ${tariffLabel} ปัจจุบัน (ตั้งแต่เริ่มช่วงราคานี้)`}>
						⚡ {tariffLabel} · <b>{f2(periodKwh)}</b> หน่วย · ฿{money(rate)}/kWh
					</span>
					{liveOffline && <span className="badge-off">live offline</span>}
				</div>
			</div>

			<div
				className={`house-wrap${flowing ? "" : " paused"}${isDay ? " day" : " night"}${isEveningPeak ? " peak" : ""}`}
				style={{ ["--glow" as string]: winGlow, ["--flow" as string]: flowDur }}
			>
				{wx &&
					wx.tempC != null &&
					(() => {
						const c = wmo(wx.code, wx.isDay);
						const solar =
							wx.isDay && wx.cloudPct != null
								? wx.cloudPct < 30
									? "ดี"
									: wx.cloudPct < 70
										? "ปานกลาง"
										: "ต่ำ"
								: null;
						return (
							<div
								className="house-weather"
								title={`${c.label} · บางใหญ่${wx.feelsC != null ? ` · รู้สึก ${f1(wx.feelsC)}°` : ""}${wx.cloudPct != null ? ` · เมฆ ${Math.round(wx.cloudPct)}%` : ""}`}
							>
								<span className="wx-temp">
									{c.icon} {Math.round(wx.tempC)}°
								</span>
								<span className="wx-sub">
									{wx.precipProb != null && <>☔ {wx.precipProb}%</>}
									{solar && <> · 🔆 {solar}</>}
								</span>
							</div>
						);
					})()}
				<svg viewBox="0 0 920 300" style={{ width: "100%", height: "auto" }} role="img" aria-label="House energy flow">
					<defs>
						<linearGradient id="house-body" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="#1e2a4a" />
							<stop offset="100%" stopColor="#141d36" />
						</linearGradient>
						<radialGradient id="house-win" cx="50%" cy="45%" r="65%">
							<stop offset="0%" stopColor="#ffd98a" />
							<stop offset="100%" stopColor="#ffb454" />
						</radialGradient>
						<linearGradient id="sky-day" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="#26365e" />
							<stop offset="100%" stopColor="#18223e" />
						</linearGradient>
						<linearGradient id="sky-night" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="#0c1430" />
							<stop offset="100%" stopColor="#0a0f22" />
						</linearGradient>
					</defs>

					{/* sky backdrop — tints the whole scene day vs night */}
					<rect x="20" y="16" width="880" height="248" rx="16" fill={`url(#sky-${isDay ? "day" : "night"})`} />

					{/* ground */}
					<line x1="40" y1="250" x2="880" y2="250" stroke="#2c3a60" strokeWidth="1" />

					{isDay ? (
						/* sun — solar potential, dashed rays */
						<g className="house-sun">
							<circle cx="828" cy="74" r="20" fill="#ffb454" opacity="0.95" />
							{Array.from({ length: 8 }, (_, i) => {
								const ang = (i * Math.PI) / 4;
								return (
									<line
										key={i}
										x1={828 + Math.cos(ang) * 28}
										y1={74 + Math.sin(ang) * 28}
										x2={828 + Math.cos(ang) * 38}
										y2={74 + Math.sin(ang) * 38}
										stroke="#ffb454"
										strokeWidth="2"
										strokeLinecap="round"
										opacity="0.7"
									/>
								);
							})}
						</g>
					) : (
						/* moon + stars */
						<g>
							{STARS.map(([x, y, r], i) => (
								<circle key={i} className="house-star" cx={x} cy={y} r={r} fill="#cdd6ef" style={{ animationDelay: `${i * 0.4}s` }} />
							))}
							<g className="house-moon">
								<circle cx="828" cy="74" r="20" fill="#cdd6ef" />
								<circle cx="836" cy="68" r="20" fill={isDay ? "#26365e" : "#0c1430"} />
								<circle cx="818" cy="80" r="2.4" fill="#aab6da" opacity="0.6" />
								<circle cx="824" cy="86" r="1.6" fill="#aab6da" opacity="0.5" />
							</g>
						</g>
					)}

					{/* utility pole */}
					<g stroke="#3a4a74" strokeWidth="3" strokeLinecap="round">
						<line x1="132" y1="250" x2="132" y2="92" />
						<line x1="110" y1="110" x2="154" y2="110" />
						<line x1="114" y1="100" x2="120" y2="100" />
						<line x1="144" y1="100" x2="150" y2="100" />
					</g>

					{/* service wire grid → house */}
					<path d={WIRE} fill="none" stroke="#2c3a60" strokeWidth="2.5" />
					{/* animated energy pulses (CSS offset-path on the same curve) */}
					<g className="house-flow">
						<circle className="house-pulse" r="4.5" fill="#4DA3FF" />
						<circle className="house-pulse" r="4.5" fill="#4DA3FF" style={{ animationDelay: "calc(var(--flow) * -0.33)" }} />
						<circle className="house-pulse" r="4.5" fill="#4DA3FF" style={{ animationDelay: "calc(var(--flow) * -0.66)" }} />
					</g>

					{/* house */}
					<g>
						<polygon points="540,152 654,90 768,152" fill="#26345a" stroke="#3a4a74" strokeWidth="2" strokeLinejoin="round" />
						{/* rooftop solar 2kW — physically there, but NOT wired to the house.
						    Glows while the sun is up (producing), idle/dark at night. */}
						<g
							className={producing ? "solar-panels active" : "solar-panels"}
							style={{ ["--solar-glow" as string]: solarGlow }}
							opacity="0.92"
						>
							<title>โซลาร์รูฟ 2kW (จำลอง · ยังไม่ต่อสายเข้าบ้าน)</title>
							<polygon points="672,100 740,137 748,150 680,113" fill="#1b3a6b" stroke="#4f74b3" strokeWidth="1.5" strokeLinejoin="round" />
							<line x1="694.4" y1="112.2" x2="702.4" y2="125.2" stroke="#4f74b3" strokeWidth="1" />
							<line x1="716.9" y1="124.4" x2="724.9" y2="137.4" stroke="#4f74b3" strokeWidth="1" />
							<line x1="676" y1="106.5" x2="744" y2="143.5" stroke="#4f74b3" strokeWidth="0.8" opacity="0.55" />
						</g>
						<rect x="556" y="150" width="196" height="100" rx="3" fill="url(#house-body)" stroke="#3a4a74" strokeWidth="2" />
						{/* door */}
						<rect x="586" y="202" width="34" height="48" rx="2" fill="#1a2440" stroke="#3a4a74" strokeWidth="1.5" />
						<circle cx="613" cy="226" r="2" fill="#8c9ac0" />
						{/* glowing windows */}
						<rect className="house-win" x="652" y="176" width="40" height="34" rx="3" fill="url(#house-win)" />
						<rect className="house-win" x="704" y="176" width="40" height="34" rx="3" fill="url(#house-win)" style={{ animationDelay: "0.6s" }} />
						{/* connection node (grid → house, the real supply) */}
						<circle cx="556" cy="150" r="4" fill="#4DA3FF" />
						{/* solar NOT wired to house: dashed stub + ✕ at the roof/wall junction */}
						<g stroke="#ff6a5e" strokeWidth="1.5" opacity="0.9" strokeLinecap="round">
							<title>โซลาร์ยังไม่ต่อสายเข้าบ้าน — ใช้ไฟการไฟฟ้า 100%</title>
							<line x1="714" y1="149" x2="714" y2="158" strokeDasharray="3 3" />
							<line x1="709" y1="160" x2="719" y2="170" />
							<line x1="719" y1="160" x2="709" y2="170" />
						</g>
					</g>
				</svg>

				<div className="house-stats">
					<div className="house-chip">
						<span className="mono lead">{live ? f1(w) : dash}<small> W</small></span>
						<span>โหลดขณะนี้</span>
					</div>
					<div className="house-chip">
						<span className="mono">{f2(todayKwh)}<small> kWh</small></span>
						<span>ใช้ไปวันนี้</span>
					</div>
					<div className="house-chip">
						<span className="mono">{live ? `${f1(live.voltage_v)} V` : dash}</span>
						<span>แรงดันไฟ</span>
					</div>
				</div>
			</div>
		</section>
	);
}
