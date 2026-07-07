import { useEffect } from "react";
import { X } from "lucide-react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ReferenceArea,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { ENERGY_CONST as C, isOnPeakHour, weekdayOf } from "~/lib/energy-calc";
import { f1, f2, money } from "~/lib/energy-format";
import { thDayMonth } from "./derive";
import type { RptTheme } from "./theme";
import { RptTipBox } from "./bits";

interface Props {
	day: number;
	/** 24 BKK hourly kWh buckets — null when the cycle has no hourly data for it */
	hours: number[] | null;
	ct: RptTheme;
	onClose: () => void;
}

const TH_DOW = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"];

/** Hourly drill-down — bottom sheet on phones, inline panel on wide screens */
export function DayDetail({ day, hours, ct, onClose }: Props) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const wd = weekdayOf(day);
	const data = (hours ?? new Array(24).fill(0)).map((kwh, h) => ({
		h,
		kwh,
		on: isOnPeakHour(wd, h),
	}));
	let onK = 0;
	let offK = 0;
	let peakH = 0;
	for (const d of data) {
		if (d.on) onK += d.kwh;
		else offK += d.kwh;
		if (d.kwh > data[peakH].kwh) peakH = d.h;
	}
	const baht = onK * C.TOU_ON + offK * C.TOU_OFF;

	return (
		<>
			<div className="ereport-sheet-backdrop" onClick={onClose} aria-hidden />
			<aside className="ereport-sheet" role="dialog" aria-label={`รายชั่วโมง ${thDayMonth(day)}`}>
				<div className="ereport-sheet-grip" aria-hidden />
				<header className="ereport-sheet-head">
					<div>
						<h3>
							{TH_DOW[wd]} {thDayMonth(day)}
						</h3>
						<p className="ereport-sheet-sub mono">
							{f1(onK + offK)} kWh · ฿{money(baht)} · พีค {String(peakH).padStart(2, "0")}:00 (
							{f2(data[peakH].kwh)} kWh)
						</p>
					</div>
					<button type="button" className="ereport-close" onClick={onClose} aria-label="ปิด">
						<X size={20} />
					</button>
				</header>
				{hours ? (
					<div className="ereport-chart ereport-chart-sheet">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
								<CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
								{wd < 5 && (
									<ReferenceArea x1={9} x2={21} fill={ct.on} fillOpacity={0.07} strokeOpacity={0} />
								)}
								<XAxis
									dataKey="h"
									tick={{ fill: ct.axis, fontSize: 10 }}
									axisLine={{ stroke: ct.grid }}
									tickLine={false}
									ticks={[0, 6, 9, 12, 17, 22]}
								/>
								<YAxis tick={{ fill: ct.axis, fontSize: 10 }} axisLine={false} tickLine={false} />
								<Tooltip
									cursor={{ fill: ct.grid }}
									content={({ active, payload }) => {
										const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
										if (!active || !p) return null;
										return (
											<RptTipBox
												bg={ct.tooltipBg}
												ink={ct.tooltipText}
												title={`${String(p.h).padStart(2, "0")}:00–${String(p.h).padStart(2, "0")}:59`}
												rows={[
													{
														dot: p.on ? ct.on : ct.off,
														text: `${f2(p.kwh)} kWh · ${p.on ? `on-peak ฿${money(p.kwh * C.TOU_ON)}` : `off-peak ฿${money(p.kwh * C.TOU_OFF)}`}`,
													},
												]}
											/>
										);
									}}
								/>
								<Bar dataKey="kwh" radius={[3, 3, 0, 0]} isAnimationActive={false}>
									{data.map((d) => (
										<Cell key={d.h} fill={d.on ? ct.on : ct.off} />
									))}
								</Bar>
							</BarChart>
						</ResponsiveContainer>
					</div>
				) : (
					<p className="ereport-note" style={{ padding: "12px 4px" }}>
						ไม่มีข้อมูลรายชั่วโมงของวันนี้ในรอบที่เลือก
					</p>
				)}
			</aside>
		</>
	);
}
