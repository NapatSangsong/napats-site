import { House, Sun, UtilityPole } from "lucide-react";
import { watts } from "./format";

/**
 * Live power flow: solar → home, grid → home, solar → grid (export).
 * Each connector animates only while power flows, faster with more power. Under
 * prefers-reduced-motion the dashes stay still (CSS).
 */
export function Flow({ solarW, gridW, homeW }: { solarW: number; gridW: number; homeW: number }) {
	const importW = Math.max(0, gridW);
	const exportW = Math.max(0, -gridW);
	const solarToHome = Math.max(0, Math.min(solarW, homeW));

	return (
		<div className="ev-flow" role="img" aria-label={`ตอนนี้ โซลาร์ ${solarW} วัตต์, บ้านใช้ ${homeW} วัตต์, ${gridW >= 0 ? "ซื้อจากการไฟฟ้า" : "ขายคืน"} ${Math.abs(gridW)} วัตต์`}>
			<svg viewBox="0 0 300 200" preserveAspectRatio="none" aria-hidden="true">
				<Wire d="M150 46 C150 110, 230 110, 238 150" w={solarToHome} cls="solar" />
				<Wire d="M62 150 C110 150, 190 150, 238 150" w={importW} cls="import" />
				<Wire d="M150 46 C150 110, 70 110, 62 150" w={exportW} cls="export" />
			</svg>
			<Node cls="solar" pos="top" icon={<Sun size={20} strokeWidth={2.2} />} label="โซลาร์" w={solarW} />
			<Node
				cls="import"
				pos="left"
				icon={<UtilityPole size={20} strokeWidth={2.2} />}
				label={exportW > 0 ? "ขายคืน" : "การไฟฟ้า"}
				w={exportW > 0 ? exportW : importW}
			/>
			<Node cls="home" pos="right" icon={<House size={20} strokeWidth={2.2} />} label="บ้าน" w={homeW} />
		</div>
	);
}

function Wire({ d, w, cls }: { d: string; w: number; cls: string }) {
	const on = w >= 20;
	// 4 kW → 0.6 s per dash cycle, 100 W → ~3 s
	const dur = on ? Math.max(0.6, Math.min(3.2, 2400 / w)) : 0;
	return (
		<g className={`ev-wire ${cls} ${on ? "on" : ""}`}>
			<path d={d} className="track" />
			{on && <path d={d} className="dash" style={{ animationDuration: `${dur}s` }} />}
		</g>
	);
}

function Node({ cls, pos, icon, label, w }: { cls: string; pos: string; icon: React.ReactNode; label: string; w: number }) {
	const v = watts(w);
	return (
		<div className={`ev-node ${pos} ${cls}`}>
			<span className="ev-node-icon">{icon}</span>
			<span className="ev-node-val">
				{v.value}
				<small>{v.unit}</small>
			</span>
			<span className="ev-node-label">{label}</span>
		</div>
	);
}
