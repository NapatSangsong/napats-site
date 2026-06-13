import type { Analysis } from "~/lib/energy-calc";
import { weekdayOf } from "~/lib/energy-calc";
import { dayMonth, f2 } from "~/lib/energy-format";
import { ChartTip, useChartTip } from "./useChartTip";

/** Section 03 — day × hour heatmap. Port of heatmap_html() in v10:
 *  top 20% (r > 0.8) flips to amber, missing cells get diagonal stripes. */
export function Heatmap({ a }: { a: Analysis }) {
	const dates = [...a.daily.keys()].sort((x, y) => x - y);
	const mx = Math.max(...a.dh.values()) || 1;
	const hours = Array.from({ length: 24 }, (_, h) => h);
	const { tip, point, surface, wrapRef } = useChartTip();

	return (
		<section>
			<div className="sec-head">
				<span className="mono">03</span>
				<h2>Heatmap วัน × ชั่วโมง</h2>
			</div>
			<div className="bar-label">
				<b>ความเข้มสี = kWh ต่อชั่วโมง</b>
				<span className="mono">ส้ม = ชั่วโมงที่หนักสุด (top 20%) · ชี้/แตะเพื่อดูตัวเลข</span>
			</div>
			<div ref={wrapRef} style={{ position: "relative" }} {...surface}>
				{dates.map((day) => {
					const we = weekdayOf(day) >= 5;
					return (
						<div className="hrow" key={day}>
							<div className={`hrow-label${we ? " we" : ""}`}>{dayMonth(day)}</div>
							<div className="hcells">
								{hours.map((h) => {
									const v = a.dh.get(day * 24 + h);
									if (v === undefined) {
										return <div key={h} className="hcell hempty" {...point("ไม่มีข้อมูล")} />;
									}
									const r = v / mx;
									const color =
										r > 0.8
											? `rgba(255,180,84,${(0.25 + r * 0.75).toFixed(2)})`
											: `rgba(61,214,195,${(0.08 + r * 0.85).toFixed(2)})`;
									return (
										<div
											key={h}
											className="hcell"
											style={{ background: color }}
											{...point(`${dayMonth(day)} ${String(h).padStart(2, "0")}:00 · ${f2(v)} kWh`)}
										/>
									);
								})}
							</div>
						</div>
					);
				})}
				<div className="hrow">
					<div className="hrow-label" />
					<div className="hcells">
						{hours.map((h) => (
							<div key={h} className="hhour">
								{h % 3 === 0 ? String(h).padStart(2, "0") : ""}
							</div>
						))}
					</div>
				</div>
				<ChartTip tip={tip} />
			</div>
		</section>
	);
}
