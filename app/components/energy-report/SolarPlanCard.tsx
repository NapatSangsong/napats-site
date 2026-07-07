import { Sun } from "lucide-react";
import {
	type BillingCycle,
	type CycleCosts,
	ENERGY_CONST as C,
	SOLAR_INSTALL_DAY,
	cycleCosts,
} from "~/lib/energy-calc";
import { f0, f1, money, pc } from "~/lib/energy-format";
import { dayEnergyBaht, thDayMonth } from "./derive";
import type { ReportDailyRow } from "./types";

interface Props {
	/** rows of the SELECTED cycle */
	rows: ReportDailyRow[];
	/** ALL history — pre-install baseline for the realized estimate */
	allDaily: ReportDailyRow[];
	cycle: BillingCycle;
	costs: CycleCosts;
	nowDay: number;
	solarPr?: number;
}

/**
 * โซลาร์ 4kW (ติดจริง 21 ก.ค. 2569):
 *  - ก่อนติด → what-if projection over the whole cycle (model)
 *  - รอบคร่อมวันติด → what-if for the pre-install part + measured before/after
 *  - หลังติด → measured import drop vs pre-install baseline (honest estimate —
 *    the meter can't see solar directly, only reduced grid import)
 */
export function SolarPlanCard({ rows, allDaily, cycle, costs, nowDay, solarPr = C.SOLAR_PR }: Props) {
	const yieldD = C.SOLAR_4K_KWP * C.SOLAR_PSH * solarPr;
	const phase =
		cycle.endDay < SOLAR_INSTALL_DAY ? "pre" : cycle.startDay > SOLAR_INSTALL_DAY ? "post" : "straddle";

	// what-if: solar active the whole cycle (projection)
	const whatIf = cycleCosts(rows, cycle, { solarActiveFromDay: -Infinity, solarPr });
	const projSave = costs.tou - whatIf.touSolar4k;

	// measured baseline: avg import ฿/วัน over the last 28 days BEFORE install
	const preRows = allDaily.filter((r) => r.day < SOLAR_INSTALL_DAY).slice(-28);
	const postRows = allDaily.filter((r) => r.day >= SOLAR_INSTALL_DAY && r.day >= cycle.startDay && r.day <= cycle.endDay);
	const avgBaht = (xs: ReportDailyRow[]) =>
		xs.length ? xs.reduce((s, r) => s + dayEnergyBaht(r), 0) / xs.length : null;
	const avgKwh = (xs: ReportDailyRow[]) =>
		xs.length ? xs.reduce((s, r) => s + r.totalKwh, 0) / xs.length : null;
	const preB = avgBaht(preRows);
	const postB = avgBaht(postRows);
	const preK = avgKwh(preRows);
	const postK = avgKwh(postRows);
	const measuredDrop = preB != null && postB != null ? preB - postB : null;
	const subPerDay = C.SOLAR_4K_SUB / 30;

	const daysToInstall = SOLAR_INSTALL_DAY - nowDay;

	return (
		<div className="ereport-solar">
			<div className="ereport-solar-head">
				<Sun size={16} />
				<b>โซลาร์ 4kW</b>
				<span className="ereport-solar-badge">
					{phase === "pre"
						? daysToInstall > 0
							? `ติดตั้ง ${thDayMonth(SOLAR_INSTALL_DAY)} · อีก ${daysToInstall} วัน`
							: `ติดตั้ง ${thDayMonth(SOLAR_INSTALL_DAY)}`
						: phase === "straddle"
							? `ติดกลางรอบ (${thDayMonth(SOLAR_INSTALL_DAY)})`
							: "ติดตั้งแล้ว"}
				</span>
			</div>

			{phase !== "post" && (
				<div className="ereport-solar-block">
					<span className="ereport-solar-k mono">−฿{money(Math.max(0, projSave))}</span>
					<span>
						ถ้ามีโซลาร์ทั้งรอบ (จำลอง): จ่าย ~฿{money(whatIf.touSolar4k)} · หักแดด{" "}
						{f0(whatIf.offsetKwh4k)} หน่วย ({f1(yieldD)} หน่วย/วัน @PR {Math.round(solarPr * 100)}
						%) · รวม sub ฿{f0(C.SOLAR_4K_SUB)}/ด.
					</span>
				</div>
			)}

			{phase !== "pre" &&
				(postRows.length > 0 && measuredDrop != null && preK != null && postK != null ? (
					<div className="ereport-solar-block">
						<span className={`ereport-solar-k mono ${measuredDrop - subPerDay > 0 ? "pos" : "neg"}`}>
							{measuredDrop - subPerDay > 0 ? "−" : "+"}฿
							{money(Math.abs((measuredDrop - subPerDay) * postRows.length))}
						</span>
						<span>
							วัดจริงหลังติด ({postRows.length} วัน): นำเข้าจากกริดเฉลี่ย {f1(postK)} kWh/วัน เทียบก่อนติด{" "}
							{f1(preK)} → {postK <= preK ? "ลดลง" : "เพิ่มขึ้น"} {pc(Math.abs(1 - postK / preK))}% ≈ ฿
							{money(Math.abs(measuredDrop))}/วัน (หัก sub {money(subPerDay)}/วันแล้ว) · เป็นค่าประมาณ —
							มิเตอร์เห็นเฉพาะไฟที่ซื้อจากกริด
						</span>
					</div>
				) : (
					<div className="ereport-solar-block">
						<span className="ereport-solar-k mono">รอข้อมูล</span>
						<span>หลังติดตั้ง จะเทียบการนำเข้าจากกริดจริง ก่อน/หลัง เพื่อประเมินเงินที่ประหยัด</span>
					</div>
				))}

			{phase === "straddle" && (
				<p className="ereport-note">
					รอบนี้คร่อมวันติดตั้ง — ครึ่งแรกเป็นตัวเลขจำลอง ครึ่งหลังเป็นการวัดจริง (เส้นเขียว
					"ติดโซลาร์" ในกราฟรายวัน)
				</p>
			)}
		</div>
	);
}
