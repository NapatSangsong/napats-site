import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "~/styles/pull-to-refresh.css";

/**
 * Pull-to-refresh for the installed mobile pages (/energy, /thinkpad). An iOS home-screen
 * app (standalone) has no native pull-to-refresh, and Chrome's would just reload the HTML.
 * This calls `onRefresh`, which fetches fresh data, and holds the spinner until it settles.
 *
 * It only starts at the very top of the page and only for a clearly vertical drag, so
 * horizontal scrollers (the 7-day strip) keep working. The content follows the finger with
 * rubber-band resistance. Releasing past THRESHOLD refreshes; anything less springs back.
 * Colours come from the host page's tokens (--card, --ink/--text, --line, --muted).
 */
const THRESHOLD = 70;
const MAX_PULL = 120;
const MIN_SPIN_MS = 600;

type Phase = "idle" | "pulling" | "armed" | "refreshing" | "done";

export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown>; children: React.ReactNode }) {
	const [dist, setDist] = useState(0);
	const [phase, setPhase] = useState<Phase>("idle");
	const g = useRef({ startX: 0, startY: 0, tracking: false, vertical: false, dist: 0, busy: false });
	const refreshRef = useRef(onRefresh);
	refreshRef.current = onRefresh;

	useEffect(() => {
		// stop Chrome's own pull-to-refresh/bounce from racing ours
		const html = document.documentElement;
		const prev = html.style.overscrollBehaviorY;
		html.style.overscrollBehaviorY = "contain";

		const onStart = (e: TouchEvent) => {
			const s = g.current;
			if (s.busy || e.touches.length !== 1 || window.scrollY > 0) return;
			s.startX = e.touches[0].clientX;
			s.startY = e.touches[0].clientY;
			s.tracking = true;
			s.vertical = false;
			s.dist = 0;
		};
		const onMove = (e: TouchEvent) => {
			const s = g.current;
			if (!s.tracking) return;
			const dx = e.touches[0].clientX - s.startX;
			const dy = e.touches[0].clientY - s.startY;
			if (!s.vertical) {
				if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) return void (s.tracking = false); // horizontal swipe
				if (dy < 6) return; // scrolling up, or not decided yet
				if (window.scrollY > 0) return void (s.tracking = false);
				s.vertical = true;
			}
			e.preventDefault(); // we own this gesture now: no native bounce/scroll
			s.dist = Math.min(MAX_PULL, Math.max(0, dy) * 0.5);
			setDist(s.dist);
			setPhase(s.dist >= THRESHOLD ? "armed" : "pulling");
		};
		const onEnd = async () => {
			const s = g.current;
			if (!s.tracking) return;
			s.tracking = false;
			if (!s.vertical) return;
			if (s.dist < THRESHOLD) {
				setDist(0);
				setPhase("idle");
				return;
			}
			s.busy = true;
			setDist(THRESHOLD * 0.75);
			setPhase("refreshing");
			const started = Date.now();
			try {
				await refreshRef.current();
			} finally {
				const wait = MIN_SPIN_MS - (Date.now() - started);
				if (wait > 0) await new Promise((r) => setTimeout(r, wait));
				setPhase("done");
				setDist(0);
				s.busy = false;
				setTimeout(() => setPhase((p) => (p === "done" ? "idle" : p)), 1200);
			}
		};

		window.addEventListener("touchstart", onStart, { passive: true });
		window.addEventListener("touchmove", onMove, { passive: false });
		window.addEventListener("touchend", onEnd);
		window.addEventListener("touchcancel", onEnd);
		return () => {
			html.style.overscrollBehaviorY = prev;
			window.removeEventListener("touchstart", onStart);
			window.removeEventListener("touchmove", onMove);
			window.removeEventListener("touchend", onEnd);
			window.removeEventListener("touchcancel", onEnd);
		};
	}, []);

	const dragging = phase === "pulling" || phase === "armed";
	const progress = Math.min(1, dist / THRESHOLD);
	const label =
		phase === "armed" ? "ปล่อยเพื่อรีเฟรช" : phase === "refreshing" ? "กำลังดึงข้อมูลใหม่…" : phase === "done" ? "อัปเดตแล้ว" : "ดึงลงเพื่อรีเฟรช";

	return (
		<>
			<div
				className={`ptr-indicator ${phase}`}
				style={{ transform: `translate(-50%, ${dist - 52}px)`, opacity: phase === "idle" ? 0 : Math.max(0.25, progress) }}
				aria-hidden={phase === "idle"}
			>
				<span className="ptr-icon" style={dragging ? { transform: `rotate(${progress * 270}deg)` } : undefined}>
					<RefreshCw size={18} strokeWidth={2.4} />
				</span>
				<span className="ptr-label">{label}</span>
			</div>
			<span className="ptr-sr" role="status" aria-live="polite">
				{phase === "refreshing" ? "กำลังรีเฟรช" : phase === "done" ? "อัปเดตแล้ว" : ""}
			</span>
			<div className={`ptr-content ${dragging ? "dragging" : ""}`} style={dist ? { transform: `translateY(${dist}px)` } : undefined}>
				{children}
			</div>
		</>
	);
}
