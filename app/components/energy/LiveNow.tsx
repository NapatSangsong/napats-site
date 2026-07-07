import type { Analysis } from "~/lib/energy-calc";
import { CALIBRATION, ENERGY_CONST, dayNum } from "~/lib/energy-calc";
import { clockLabel, f1, f2 } from "~/lib/energy-format";
import type { LiveData } from "./types";

interface Props {
	live: LiveData | null;
	liveOffline: boolean;
	a: Analysis;
	/** raw (uncalibrated) last stored meter — live.meter_kwh is raw too */
	rawMeter: number;
	/** wall-clock of the latest live fetch */
	updatedAt: number | null;
}

/** Section 00 — Live Now: realtime shadow properties + today's kWh */
export function LiveNow({ live, liveOffline, a, rawMeter, updatedAt }: Props) {
	const today = dayNum(Date.now());
	const todayBase = a.daily.get(today) ?? 0;
	// live meter beyond the last synced point counts toward today only if the
	// gap is within the profile rule (≤2h), mirroring analyze(). Compare against
	// the RAW last meter — both live.meter_kwh and rawMeter are uncalibrated —
	// then scale the delta like any post-boundary consumption.
	const liveExtra =
		live && live.ts - a.t1 <= ENERGY_CONST.MAX_GAP_MS
			? Math.max(0, live.meter_kwh - rawMeter) * CALIBRATION.factorAfter
			: 0;
	const todayKwh = todayBase + liveExtra;
	const dash = "—";

	return (
		<section>
			<div className="sec-head">
				<span className="mono">00</span>
				<h2>Live Now</h2>
				{liveOffline && <span className="badge-off">live offline</span>}
			</div>
			<div className="card">
				<div className="live-head">
					<span className={`pulse${liveOffline ? " off" : ""}`} />
					<span className="tag">Power ขณะนี้</span>
					<span className="live-updated" style={{ marginLeft: "auto" }}>
						{updatedAt ? `อัปเดต ${clockLabel(updatedAt)}` : "รอข้อมูล…"}
					</span>
				</div>
				<div className="live-power">
					{live ? f1(live.power_w) : dash}
					<small>W</small>
				</div>
			</div>
			<div className="vstats" style={{ marginTop: 16 }}>
				<div className="vstat">
					<span className="mono">{live ? `${f1(live.voltage_v)} V` : dash}</span>
					<span>Voltage</span>
				</div>
				<div className="vstat">
					<span className="mono">{live ? `${live.current_a.toFixed(3)} A` : dash}</span>
					<span>Current</span>
				</div>
				<div className="vstat">
					<span className="mono">{live ? `${f1(live.power_factor)} %` : dash}</span>
					<span>Power Factor</span>
				</div>
				<div className="vstat">
					<span className="mono">{live ? `${f2(live.freq_hz)} Hz` : dash}</span>
					<span>Frequency</span>
				</div>
				<div className="vstat">
					<span className="mono">{live ? `${f2(live.meter_kwh)} kWh` : `${f2(rawMeter)} kWh`}</span>
					<span>เลขมิเตอร์สะสม{live ? "" : " (ล่าสุดในคลัง)"}</span>
				</div>
				<div className="vstat">
					<span className="mono">{f2(todayKwh)} kWh</span>
					<span>ใช้ไปวันนี้</span>
				</div>
			</div>
		</section>
	);
}
