/**
 * Shared chart tooltip for the energy dashboard.
 *
 * Replaces native HTML `title=` / SVG `<title>` (which only fire on desktop
 * mouse-hover and are dead on touch) with a pointer-event-driven floating
 * label that works on BOTH:
 *   - desktop: hover a data element → label follows the cursor, hides on leave
 *   - mobile:  tap a data element → label pins until you tap elsewhere
 *
 * Usage in a chart:
 *   const { tip, point, surface, wrapRef } = useChartTip();
 *   <div ref={wrapRef} style={{ position: "relative" }} {...surface}>
 *     <svg/div …>
 *       {dataElements.map(d => <rect {...point(`label for ${d}`)} … />)}
 *     </…>
 *     <ChartTip tip={tip} />
 *   </div>
 */
import { useCallback, useRef, useState } from "react";

export interface ChartTipState {
	x: number;
	y: number;
	w: number;
	text: string;
	pinned: boolean;
}

export function useChartTip() {
	const [tip, setTip] = useState<ChartTipState | null>(null);
	const wrapRef = useRef<HTMLDivElement | null>(null);

	const at = (clientX: number, clientY: number) => {
		const r = wrapRef.current?.getBoundingClientRect();
		return {
			x: clientX - (r?.left ?? 0),
			y: clientY - (r?.top ?? 0),
			w: r?.width ?? 0,
		};
	};

	/** Spread onto each data element (bar, cell, point hit-area). */
	const point = useCallback(
		(text: string) => ({
			onPointerEnter: (e: React.PointerEvent) => {
				if (e.pointerType !== "mouse") return;
				setTip({ ...at(e.clientX, e.clientY), text, pinned: false });
			},
			onPointerMove: (e: React.PointerEvent) => {
				if (e.pointerType !== "mouse") return;
				setTip((t) => (t?.pinned ? t : { ...at(e.clientX, e.clientY), text, pinned: false }));
			},
			onPointerDown: (e: React.PointerEvent) => {
				// Don't let the surface handler clear it; touch/pen taps pin the label.
				e.stopPropagation();
				setTip({ ...at(e.clientX, e.clientY), text, pinned: e.pointerType !== "mouse" });
			},
		}),
		[],
	);

	/** Spread onto the position:relative wrapper around the plot. */
	const surface = {
		onPointerLeave: () => setTip((t) => (t?.pinned ? t : null)),
		onPointerDown: () => setTip(null), // tap empty area dismisses a pinned label
	};

	return { tip, point, surface, wrapRef };
}

export function ChartTip({ tip }: { tip: ChartTipState | null }) {
	if (!tip) return null;
	// Clamp horizontally so the bubble never spills past the chart edges.
	const left = tip.w ? Math.max(54, Math.min(tip.x, tip.w - 54)) : tip.x;
	// If the point is near the top, flip the bubble below the finger/cursor.
	const below = tip.y < 44;
	return (
		<div
			aria-hidden
			style={{
				position: "absolute",
				left,
				top: tip.y,
				transform: below ? "translate(-50%, 14px)" : "translate(-50%, calc(-100% - 14px))",
				background: "var(--night-2)",
				border: "1px solid var(--line)",
				borderRadius: 8,
				padding: "6px 10px",
				fontFamily: "IBM Plex Mono, monospace",
				fontSize: "0.72rem",
				lineHeight: 1.4,
				color: "var(--ink)",
				whiteSpace: "nowrap",
				pointerEvents: "none",
				zIndex: 30,
				boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
			}}
		>
			{tip.text}
		</div>
	);
}
