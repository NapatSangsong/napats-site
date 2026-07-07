import { useEffect, useState } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Legend,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { Analysis } from "~/lib/energy-calc";
import { ENERGY_CONST as C, isOnPeakHour, weekdayOf, dayNumFromYmd } from "~/lib/energy-calc";
import { f2 } from "~/lib/energy-format";
import type { ChartTheme } from "./theme";
import { ChartFrame } from "./ChartFrame";
import { Panel } from "./Panel";

interface SolarDay {
	date: string;
	hours: { hour: number; kwh: number; cloud: number }[];
	kwp: number;
	pr: number;
}

interface Props {
	a: Analysis;
	solarPr: number;
	ct: ChartTheme;
}

export function SolarForecastChart({ a, solarPr, ct }: Props) {
	const [days, setDays] = useState<SolarDay[]>([]);

	useEffect(() => {
		fetch("/api/energy/solar")
			.then((r) => r.json() as Promise<{ ok: boolean; days?: SolarDay[] }>)
			.then((body) => {
				if (body.ok && body.days) setDays(body.days.slice(0, 5));
			})
			.catch(() => {});
	}, []);

	if (!days.length) {
		return (
			<Panel title="Solar Forecast — 5 Days">
				<div className="edash-panel-body" style={{ color: "var(--ink-faint)", fontSize: "0.82rem" }}>
					กำลังโหลดพยากรณ์โซลาร์…
				</div>
			</Panel>
		);
	}

	// Build bar data: produced/load/useful per hour per day
	const barData: { label: string; produced: number; load: number; useful: number }[] = [];
	for (const day of days) {
		const [y, m, d] = day.date.split("-").map(Number);
		const dayN = dayNumFromYmd(y, m, d);
		const wd = weekdayOf(dayN);
		const profile = wd < 5 ? a.wdProf : a.prof;
		const scale = 4 / (day.kwp || 4); // scale to 4kW from API data size
		const prScale = solarPr / (day.pr || 0.75);
		for (let h = 6; h <= 17; h++) {
			const prod = (day.hours[h]?.kwh ?? 0) * scale * prScale;
			const load = profile[h] ?? 0;
			const useful = Math.min(prod, load);
			barData.push({
				label: `${day.date.slice(5)} ${String(h).padStart(2, "0")}`,
				produced: prod,
				load,
				useful,
			});
		}
	}

	const totalUseful = barData.reduce((s, d) => s + d.useful, 0);
	const totalProd = barData.reduce((s, d) => s + d.produced, 0);

	return (
		<Panel
			title="Solar Forecast — 5 Days (4kW @ simulated)"
			legend={[
				{ color: ct.solar, label: "ผลิต (4kW)" },
				{ color: ct.load, label: "โหลดบ้าน" },
				{ color: ct.good, label: `ใช้ได้ ${f2(totalUseful)} kWh` },
			]}
		>
			<div className="edash-panel-body">
				<div style={{ display: "flex", gap: 20, marginBottom: 10, fontSize: "0.78rem", flexWrap: "wrap" }}>
					<span style={{ color: "var(--ink-dim)" }}>
						ผลิตรวม <span className="edash-mono" style={{ color: "var(--sun)", fontWeight: 700 }}>{f2(totalProd)} kWh</span>
					</span>
					<span style={{ color: "var(--ink-dim)" }}>
						ตัดโหลดได้ <span className="edash-mono" style={{ color: "var(--good)", fontWeight: 700 }}>{f2(totalUseful)} kWh</span>
					</span>
					<span style={{ color: "var(--ink-dim)" }}>
						มูลค่า ≈ <span className="edash-mono" style={{ color: "var(--ink)", fontWeight: 700 }}>฿{(totalUseful * C.TOU_ON).toFixed(0)}</span>
					</span>
				</div>
				<ChartFrame size="sm">
					<BarChart data={barData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
						<CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
						<XAxis
							dataKey="label"
							tick={{ fill: ct.axis, fontSize: 9 }}
							axisLine={{ stroke: ct.grid }}
							tickLine={false}
							interval={11}
						/>
						<YAxis
							tick={{ fill: ct.axis, fontSize: 10 }}
							axisLine={false}
							tickLine={false}
							tickFormatter={(v) => v.toFixed(2)}
							width={36}
						/>
						<Tooltip
							formatter={(value, name) => [`${Number(value).toFixed(3)} kWh`, name ?? ""]}
							contentStyle={{
								background: ct.tooltipBg,
								border: `1px solid ${ct.tooltipBorder}`,
								borderRadius: 10,
								color: ct.tooltipText,
								fontSize: 12,
							}}
						/>
						<Bar dataKey="produced" name="ผลิต" fill={ct.solar} fillOpacity={0.7} maxBarSize={14} radius={[2,2,0,0]} />
						<Bar dataKey="load" name="โหลด" fill={ct.load} fillOpacity={0.5} maxBarSize={14} radius={[2,2,0,0]} />
					</BarChart>
				</ChartFrame>
			</div>
		</Panel>
	);
}
