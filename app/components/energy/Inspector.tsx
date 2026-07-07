import { useEffect, useMemo, useState } from "react";
import type { CalcResult } from "~/lib/energy-calc";
import { ENERGY_CONST as C, FLAT_TIERS, traceLines, weekdayOf, dayNum } from "~/lib/energy-calc";
import { f1, f2, money, timeLabel } from "~/lib/energy-format";
import type { ApiStats, LiveData } from "./types";

const OPEN_KEY = "energy-insp-open";
const ACC_KEY = "energy-insp-acc";

const GROUPS = [
	"Data Quality",
	"Live Raw",
	"Hourly Profile",
	"Calculation Trace",
	"Constants",
	"API Status",
] as const;

interface Props {
	calc: CalcResult;
	live: LiveData | null;
	stats: ApiStats;
	points: [number, number][];
	solarPr: number;
}

interface Gap {
	from: number;
	to: number;
	minutes: number;
}

const CONSTANT_ROWS: Array<[string, string, string]> = [
	[
		"FLAT_TIERS",
		FLAT_TIERS.map(([, r]) => r).join(" / ") + " ฿/kWh",
		"MEA ขั้นบันได 1.1.2: ≤150 / 151–400 / >400 หน่วย (ก่อน Ft + VAT)",
	],
	["FT_RATE", `${C.FT_RATE} ฿/kWh`, "ค่า Ft งวด พ.ค.–ส.ค. 2569 — กกพ. ปรับทุก 4 เดือน"],
	["FLAT_FIXED", `${C.FLAT_FIXED} ฿/เดือน`, "ค่าบริการ Type 1.1.2: 38.22 + VAT 7%"],
	["TOU_ON", `${C.TOU_ON} ฿/kWh`, "MEA TOU จ–ศ 09:00–22:00"],
	["TOU_OFF", `${C.TOU_OFF} ฿/kWh`, "MEA TOU นอกเวลา + ส–อา ทั้งวัน"],
	["TOU_FIXED", `${C.TOU_FIXED} ฿/เดือน`, "ค่าบริการ Type 1.2: 38.22 + VAT 7%"],
	["SOLAR_4K_KWP", `${C.SOLAR_4K_KWP} kWp`, "ขนาดระบบโซลาร์ที่ติดจริง 21 ก.ค. 2569"],
	["SOLAR_4K_SUB", `${C.SOLAR_4K_SUB} ฿/เดือน`, "ค่า subscription โซลาร์ 4kW"],
	["WEEKDAYS_MO", `${C.WEEKDAYS_MO} วัน`, "วันธรรมดา/เดือน (โซลาร์ตัด On-Peak)"],
	["WEEKENDS_MO", `${C.WEEKENDS_MO} วัน`, "เสาร์–อาทิตย์/เดือน (โซลาร์ตัด Off-Peak)"],
	["MEA_MONTHLY_KWH", `${C.MEA_MONTHLY_KWH} kWh`, "ฐานบิลทั้งบ้านจาก MEA"],
	["SCALE", `${C.SCALE}`, "หน่วยดิบ forward_energy_total → kWh"],
	["MAX_GAP_MS", "2 ชม.", "delta ข้าม gap ยาวกว่านี้ไม่เข้าโปรไฟล์"],
];

function bucketOf(h: number): string {
	if (h >= 9 && h < 17) return "Daytime";
	if (h >= 17 && h < 22) return "Evening";
	return "Night";
}

/** Section 09 — Technical Inspector. Everything here reads from the SAME
 *  calc objects that render the charts (single source of truth). */
export function Inspector({ calc, live, stats, points, solarPr }: Props) {
	const { a, f, fc, sv } = calc;
	const [open, setOpen] = useState(false);
	const [acc, setAcc] = useState<Record<string, boolean>>({});
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		try {
			setOpen(localStorage.getItem(OPEN_KEY) === "1");
			const saved = localStorage.getItem(ACC_KEY);
			if (saved) setAcc(JSON.parse(saved));
		} catch {
			/* localStorage unavailable */
		}
	}, []);

	const toggleOpen = () => {
		const next = !open;
		setOpen(next);
		try {
			localStorage.setItem(OPEN_KEY, next ? "1" : "0");
		} catch {
			/* ignore */
		}
	};

	const toggleAcc = (name: string) => {
		const next = { ...acc, [name]: !acc[name] };
		setAcc(next);
		try {
			localStorage.setItem(ACC_KEY, JSON.stringify(next));
		} catch {
			/* ignore */
		}
	};

	const quality = useMemo(() => {
		const gaps: Gap[] = [];
		let negativeDeltas = 0;
		for (let i = 1; i < points.length; i++) {
			const dt = points[i][0] - points[i - 1][0];
			if (dt > 30 * 60_000) {
				gaps.push({ from: points[i - 1][0], to: points[i][0], minutes: Math.round(dt / 60_000) });
			}
			if (points[i][1] < points[i - 1][1]) negativeDeltas++;
		}
		let completeDays = 0;
		for (const hrs of a.dayHours.values()) if (hrs.size >= 23) completeDays++;
		return { gaps, negativeDeltas, completeDays, totalDays: a.dayHours.size };
	}, [points, a]);

	const hourlyRows = useMemo(() => {
		return Array.from({ length: 24 }, (_, h) => {
			let daysSeen = 0;
			for (const day of a.daily.keys()) if (a.dh.has(day * 24 + h)) daysSeen++;
			return { h, kwh: a.prof[h], wdKwh: a.wdProf[h], daysSeen };
		});
	}, [a]);

	// V × I × PF ≈ P cross-check (±10%)
	const crossCheck = useMemo(() => {
		if (!live) return null;
		const est = live.voltage_v * live.current_a * (live.power_factor / 100);
		const dev = live.power_w ? Math.abs(est - live.power_w) / live.power_w : 0;
		return { est, dev, ok: dev <= 0.1 };
	}, [live]);

	const trace = useMemo(() => traceLines(a, f, fc, sv, solarPr), [a, f, fc, sv, solarPr]);

	const copyAll = async () => {
		const payload = {
			generated_at: new Date().toISOString(),
			data_quality: {
				points: a.n,
				span_days: a.spanDays,
				first: timeLabel(a.t0),
				last: timeLabel(a.t1),
				complete_days: quality.completeDays,
				total_days: quality.totalDays,
				gaps_over_30min: quality.gaps.map((g) => ({
					from: timeLabel(g.from),
					to: timeLabel(g.to),
					minutes: g.minutes,
				})),
				skipped_kwh: a.skipped,
				negative_deltas: quality.negativeDeltas,
			},
			live_raw: live,
			cross_check: crossCheck,
			hourly_profile: hourlyRows,
			finance: f,
			forecast: { ...fc, days: fc.days.length },
			savings: { ...sv, series: sv.series.length },
			calculation_trace: trace,
			constants: C,
			api_status: stats,
		};
		try {
			await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			/* clipboard denied */
		}
	};

	const lastSyncAgeMin = Math.round((Date.now() - a.t1) / 60_000);

	const bodies: Record<(typeof GROUPS)[number], React.ReactNode> = {
		"Data Quality": (
			<table>
				<tbody>
					<tr>
						<td>จำนวนจุด</td>
						<td className="num">{a.n}</td>
					</tr>
					<tr>
						<td>ช่วงเวลา</td>
						<td className="num">
							{timeLabel(a.t0)} → {timeLabel(a.t1)} ({f2(a.spanDays)} วัน)
						</td>
					</tr>
					<tr>
						<td>วันครบ (≥23 ชม.) / ทั้งหมด</td>
						<td className="num">
							{quality.completeDays} / {quality.totalDays}
						</td>
					</tr>
					<tr>
						<td>skipped kWh (gap &gt; 2 ชม.)</td>
						<td className="num">{f2(a.skipped)} kWh</td>
					</tr>
					<tr>
						<td>delta ติดลบ (มิเตอร์ reset)</td>
						<td className="num">{quality.negativeDeltas}</td>
					</tr>
					<tr>
						<td>ข้อมูลล่าสุดเมื่อ</td>
						<td className="num">{lastSyncAgeMin} นาทีก่อน (cron ทุก 15 นาที)</td>
					</tr>
					<tr>
						<th>gaps &gt; 30 นาที ({quality.gaps.length})</th>
						<th />
					</tr>
					{quality.gaps.slice(0, 20).map((g) => (
						<tr key={g.from}>
							<td>
								{timeLabel(g.from)} → {timeLabel(g.to)}
							</td>
							<td className="num">{g.minutes} นาที</td>
						</tr>
					))}
					{quality.gaps.length > 20 && (
						<tr>
							<td colSpan={2}>… อีก {quality.gaps.length - 20} ช่วง (ดูทั้งหมดใน Copy JSON)</td>
						</tr>
					)}
				</tbody>
			</table>
		),
		"Live Raw": live ? (
			<div>
				<table>
					<thead>
						<tr>
							<th>code</th>
							<th>raw</th>
							<th>scaled</th>
						</tr>
					</thead>
					<tbody>
						{(
							[
								["power_a", `${f1(live.power_w)} W`],
								["voltage_a", `${f1(live.voltage_v)} V`],
								["current_a", `${live.current_a.toFixed(3)} A`],
								["power_factor", `${f1(live.power_factor)} %`],
								["freq", `${f2(live.freq_hz)} Hz`],
								["forward_energy_total", `${f2(live.meter_kwh)} kWh`],
							] as const
						).map(([code, scaled]) => (
							<tr key={code}>
								<td>{code}</td>
								<td className="num">
									{String(live.raw.find((p) => p.code === code)?.value ?? "—")}
								</td>
								<td className="num">{scaled}</td>
							</tr>
						))}
					</tbody>
				</table>
				{crossCheck && (
					<div style={{ marginTop: 10 }}>
						cross-check V×I×PF = {f1(live.voltage_v)}×{live.current_a.toFixed(3)}×
						{f1(live.power_factor)}% = {f1(crossCheck.est)} W vs P = {f1(live.power_w)} W{" "}
						<span className={crossCheck.ok ? "ok" : "bad"}>
							{crossCheck.ok ? "✓" : "✗"} (Δ {(crossCheck.dev * 100).toFixed(1)}%)
						</span>
					</div>
				)}
				<div style={{ marginTop: 10, wordBreak: "break-all" }}>
					raw: {JSON.stringify(live.raw)}
				</div>
			</div>
		) : (
			<div className="bad">live offline — ไม่มีข้อมูล realtime ในรอบนี้</div>
		),
		"Hourly Profile": (
			<table>
				<thead>
					<tr>
						<th>ชม.</th>
						<th>kWh เฉลี่ย</th>
						<th>จ–ศ</th>
						<th>วันที่เห็น</th>
						<th>bucket</th>
						<th>TOU</th>
					</tr>
				</thead>
				<tbody>
					{hourlyRows.map((r) => (
						<tr key={r.h}>
							<td>{String(r.h).padStart(2, "0")}:00</td>
							<td className="num">{r.kwh.toFixed(3)}</td>
							<td className="num">{r.wdKwh.toFixed(3)}</td>
							<td className="num">{r.daysSeen}</td>
							<td>{bucketOf(r.h)}</td>
							<td>{r.h >= 9 && r.h < 22 ? "On (จ–ศ)" : "Off"}</td>
						</tr>
					))}
				</tbody>
			</table>
		),
		"Calculation Trace": (
			<div>
				{trace.map((line) => (
					<div className="trace-line" key={line}>
						{line}
					</div>
				))}
			</div>
		),
		Constants: (
			<table>
				<thead>
					<tr>
						<th>ค่าคงที่</th>
						<th>ค่า</th>
						<th>ที่มา</th>
					</tr>
				</thead>
				<tbody>
					{CONSTANT_ROWS.map(([k, v, src]) => (
						<tr key={k}>
							<td>{k}</td>
							<td className="num">{v}</td>
							<td>{src}</td>
						</tr>
					))}
				</tbody>
			</table>
		),
		"API Status": (
			<div>
				<table>
					<tbody>
						<tr>
							<td>live endpoint</td>
							<td className="num">{stats.liveEndpoint}</td>
						</tr>
						<tr>
							<td>live latency / fetches</td>
							<td className="num">
								{stats.liveLatencyMs != null ? `${stats.liveLatencyMs} ms` : "—"} ·{" "}
								{stats.liveFetches} ครั้ง · {stats.liveOffline ? "offline" : "ok"}
							</td>
						</tr>
						<tr>
							<td>history endpoint</td>
							<td className="num">{stats.historyEndpoint}</td>
						</tr>
						<tr>
							<td>history latency / fetches</td>
							<td className="num">
								{stats.historyLatencyMs != null ? `${stats.historyLatencyMs} ms` : "—"} ·{" "}
								{stats.historyFetches} ครั้ง · {stats.historyRows} แถว
							</td>
						</tr>
						<tr>
							<td>history fetched at</td>
							<td className="num">
								{stats.historyFetchedAt ? timeLabel(stats.historyFetchedAt) : "—"}
							</td>
						</tr>
					</tbody>
				</table>
				<button type="button" className="copy-btn" onClick={copyAll}>
					{copied ? "คัดลอกแล้ว ✓" : "Copy ทั้งหมดเป็น JSON"}
				</button>
			</div>
		),
	};

	return (
		<section>
			<button type="button" className="insp-toggle" onClick={toggleOpen} aria-expanded={open}>
				🔧 Technical Details
				<span className={`chev${open ? " open" : ""}`}>▾</span>
			</button>
			<div className={`insp-panel${open ? " open" : ""}`}>
				<div className="insp-body">
					{GROUPS.map((g) => (
						<div className="acc" key={g}>
							<button
								type="button"
								className="acc-head"
								onClick={() => toggleAcc(g)}
								aria-expanded={!!acc[g]}
							>
								{g}
								<span className={`chev${acc[g] ? " open" : ""}`}>▾</span>
							</button>
							{acc[g] && <div className="acc-body">{bodies[g]}</div>}
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
