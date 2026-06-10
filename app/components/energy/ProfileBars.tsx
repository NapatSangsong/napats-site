import type { Analysis, Finance } from "~/lib/energy-calc";
import { ENERGY_CONST as C } from "~/lib/energy-calc";
import { f0, f1, f2, pc } from "~/lib/energy-format";

function Fill({ cls, w, on }: { cls: string; w: number; on: boolean }) {
	return <div className={`fill ${cls}`} style={{ width: on ? `${w}%` : "0%" }} />;
}

/** Header (eyebrow, headline, TOU strip) — text/format identical to v10 */
export function EnergyHeader({
	a,
	f,
	liveOffline,
}: {
	a: Analysis;
	f: Finance;
	liveOffline: boolean;
}) {
	const nightShare = (1 - f.day0816Pct) * 100;
	const headline = `บ้านนี้ใช้ไฟกลางคืน ${Math.round(nightShare)}% — ${
		f.viable ? "TOU + Solar คือคำตอบ" : "TOU คือคำตอบ (โซลาร์รอก่อน)"
	}`;
	return (
		<header>
			<div className="eyebrow">
				Energy Dashboard · v10 · Real Data + Forecast
				{liveOffline && <span className="badge-off">live offline</span>}
			</div>
			<h1>{headline}</h1>
			<div className="sub">
				วัดจริงจาก Tuya <span className="mono">{f2(a.kwhDay)} kWh/วัน</span> ({f1(a.spanDays)} วัน,{" "}
				{a.n} จุด) · ฐานการเงิน <span className="mono">{f0(f.monthlyKwh)} kWh/เดือน</span> (บิล
				MEA)
			</div>
			<div className="strip">
				<div className="zone z-night" style={{ width: `${pc(f.nightPct)}%` }}>
					<small>
						OFF-PEAK {f2(C.TOU_OFF)}฿ · Night {pc(f.nightPct)}%
					</small>
				</div>
				<div className="zone z-solar" style={{ width: `${pc(f.daytimePct)}%` }}>
					<small>
						ON-PEAK {f2(C.TOU_ON)}฿ + SOLAR · {pc(f.daytimePct)}%
					</small>
				</div>
				<div className="zone z-eve" style={{ width: `${pc(f.eveningPct)}%` }}>
					<small>EVENING PEAK · {pc(f.eveningPct)}%</small>
				</div>
			</div>
			<div className="ticks">
				<span>Night 22:00–09:00</span>
				<span>Daytime 09:00–17:00</span>
				<span>Evening 17:00–22:00</span>
			</div>
		</header>
	);
}

/** Section 01 — โปรไฟล์การใช้ไฟ (Day/Night + TOU split bars) */
export function ProfileBars({ f, barsOn }: { f: Finance; barsOn: boolean }) {
	const n1608 = (1 - f.day0816Pct) * 100;
	return (
		<section>
			<div className="sec-head">
				<span className="mono">01</span>
				<h2>โปรไฟล์การใช้ไฟ (จากข้อมูลจริง)</h2>
			</div>
			<div className="grid2">
				<div>
					<div className="bar-label" style={{ marginBottom: 14 }}>
						<b>Day vs Night</b>
						<span className="mono">มุมโซลาร์ 08–16 / 16–08</span>
					</div>
					<div className="bargroup">
						<div className="bar-label">
							<span>Day 08–16</span>
							<span className="mono">{pc(f.day0816Pct)}%</span>
						</div>
						<div className="track">
							<Fill cls="f-sun" w={f.day0816Pct * 100} on={barsOn} />
						</div>
					</div>
					<div className="bargroup">
						<div className="bar-label">
							<span>Night 16–08</span>
							<span className="mono">{f1(n1608)}%</span>
						</div>
						<div className="track">
							<Fill cls="f-night" w={n1608} on={barsOn} />
						</div>
					</div>
				</div>
				<div>
					<div className="bar-label" style={{ marginBottom: 14 }}>
						<b>TOU Split</b>
						<span className="mono">On จ–ศ 09–22 / Off + ส–อา</span>
					</div>
					<div className="bargroup">
						<div className="bar-label">
							<span>
								On-Peak <span className="mono">{f2(C.TOU_ON)}฿</span>
							</span>
							<span className="mono">
								{pc(f.onPct)}% · {f0(f.onKwh)} kWh
							</span>
						</div>
						<div className="track">
							<Fill cls="f-peak" w={f.onPct * 100} on={barsOn} />
						</div>
					</div>
					<div className="bargroup">
						<div className="bar-label">
							<span>
								Off-Peak <span className="mono">{f2(C.TOU_OFF)}฿</span>
							</span>
							<span className="mono">
								{pc(f.offPct)}% · {f0(f.offKwh)} kWh
							</span>
						</div>
						<div className="track">
							<Fill cls="f-off" w={f.offPct * 100} on={barsOn} />
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
