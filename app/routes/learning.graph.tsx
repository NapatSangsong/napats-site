/**
 * Knowledge Graph — force-directed visualization of course relationships.
 * Canvas-based with pan/zoom interaction.
 * Includes "Knowledge Entropy" visualization based on Ebbinghaus forgetting curve.
 */
import { useRef, useEffect, useCallback, useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/learning.graph";
import { createServiceClient } from "~/lib/supabase.server";
import { useTheme } from "./learning";
import { TopBar } from "~/components/learning/TopBar";
import { Tracked, FilmDot, Rule, TrackedButton } from "~/components/learning/primitives";

// ── Types ───────────────────────────────────────────────────

interface CourseNode {
	id: string;
	title: string;
	slug: string;
	cover_monogram: string;
	difficulty: string;
	tags: string[];
	progress: number;
	entropy: number;
	daysSinceReview: number | null;
	// simulation state
	x: number;
	y: number;
	vx: number;
	vy: number;
}

interface Edge {
	from_course_id: string;
	to_course_id: string;
	relationship: string;
	strength: number;
}

// ── Loader ──────────────────────────────────────────────────

export async function loader({ context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	const supabase = createServiceClient(env);

	const [coursesRes, relsRes] = await Promise.all([
		supabase
			.from("courses")
			.select("id, title, slug, cover_monogram, difficulty, tags, lessons(id, lesson_progress(status))")
			.eq("archived", false),
		supabase
			.from("course_relationships")
			.select("from_course_id, to_course_id, relationship, strength"),
	]);

	const rawCourses = (coursesRes.data ?? []) as Array<{
		id: string;
		title: string;
		slug: string;
		cover_monogram: string;
		difficulty: string;
		tags: string[];
		lessons?: { id: string; lesson_progress?: { status: string }[] }[];
	}>;
	// Calculate progress from lessons
	const courses = rawCourses.map((c) => {
		const total = c.lessons?.length || 0;
		const completed = c.lessons?.filter(
			(l) => l.lesson_progress?.some((p) => p.status === "completed"),
		).length || 0;
		return { ...c, progress: total > 0 ? Math.round((completed / total) * 100) : 0 };
	});

	// Fetch lesson progress and review schedule data for entropy calculation
	const courseIds = courses.map((c) => c.id);

	const [lessonProgressRes, reviewScheduleRes] = await Promise.all([
		courseIds.length > 0
			? supabase
					.from("lesson_progress")
					.select("course_id, last_accessed_at, completed_at")
					.in("course_id", courseIds)
			: Promise.resolve({ data: [] }),
		courseIds.length > 0
			? supabase
					.from("review_schedule")
					.select("course_id, completed_at")
					.in("course_id", courseIds)
					.not("completed_at", "is", null)
					.order("completed_at", { ascending: false })
			: Promise.resolve({ data: [] }),
	]);

	const lessonProgress = (lessonProgressRes.data ?? []) as Array<{
		course_id: string;
		last_accessed_at: string | null;
		completed_at: string | null;
	}>;

	const reviewSchedule = (reviewScheduleRes.data ?? []) as Array<{
		course_id: string;
		completed_at: string | null;
	}>;

	// Build a map of course_id -> most recent activity timestamp and review count
	const now = Date.now();
	const courseActivityMap = new Map<
		string,
		{ mostRecentMs: number; reviewCount: number }
	>();

	for (const lp of lessonProgress) {
		const ts = lp.last_accessed_at || lp.completed_at;
		if (!ts) continue;
		const ms = new Date(ts).getTime();
		const existing = courseActivityMap.get(lp.course_id);
		if (!existing || ms > existing.mostRecentMs) {
			courseActivityMap.set(lp.course_id, {
				mostRecentMs: ms,
				reviewCount: existing?.reviewCount ?? 0,
			});
		}
	}

	for (const rs of reviewSchedule) {
		if (!rs.completed_at) continue;
		const ms = new Date(rs.completed_at).getTime();
		const existing = courseActivityMap.get(rs.course_id);
		if (existing) {
			existing.reviewCount += 1;
			if (ms > existing.mostRecentMs) {
				existing.mostRecentMs = ms;
			}
		} else {
			courseActivityMap.set(rs.course_id, {
				mostRecentMs: ms,
				reviewCount: 1,
			});
		}
	}

	// Calculate entropy for each course using Ebbinghaus forgetting curve
	// retention = e^(-t/S) where t = days since last review, S = stability factor
	const coursesWithEntropy = courses.map((c) => {
		const activity = courseActivityMap.get(c.id);

		if (!activity) {
			// Never accessed
			return { ...c, entropy: 1, daysSinceReview: null as number | null };
		}

		const daysSince = (now - activity.mostRecentMs) / (1000 * 60 * 60 * 24);
		// Stability factor: starts at 7 days, doubles with each review (capped)
		const S = Math.min(7 * Math.pow(2, activity.reviewCount), 180);
		const retention = Math.exp(-daysSince / S);
		const entropy = Math.max(0, Math.min(1, 1 - retention));

		return {
			...c,
			entropy,
			daysSinceReview: Math.round(daysSince),
		};
	});

	return {
		courses: coursesWithEntropy,
		edges: (relsRes.data ?? []) as Edge[],
	};
}

// ── Helpers ─────────────────────────────────────────────────

function nodeRadius(difficulty: string): number {
	switch (difficulty) {
		case "beginner":
			return 22;
		case "intermediate":
			return 30;
		case "advanced":
			return 38;
		default:
			return 26;
	}
}

/** Parse a hex color string to {r, g, b} */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
	if (!m) return null;
	return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

/** Blend a color toward a desaturated gray based on entropy (0-1) */
function blendToGray(hexColor: string, entropy: number): string {
	const rgb = hexToRgb(hexColor);
	if (!rgb) return hexColor;
	// Target gray: luminance-preserving
	const gray = Math.round(rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114);
	const factor = entropy * 0.7; // max 70% desaturation
	const r = Math.round(rgb.r + (gray - rgb.r) * factor);
	const g = Math.round(rgb.g + (gray - rgb.g) * factor);
	const b = Math.round(rgb.b + (gray - rgb.b) * factor);
	return `rgb(${r},${g},${b})`;
}

/** Blend an rgba() color string toward gray */
function blendRgbaToGray(rgbaColor: string, entropy: number): string {
	// Parse rgba(r,g,b,a) or rgb(r,g,b)
	const m = rgbaColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/);
	if (!m) {
		// Try hex
		if (rgbaColor.startsWith("#")) return blendToGray(rgbaColor, entropy);
		return rgbaColor;
	}
	const r = parseInt(m[1]);
	const g = parseInt(m[2]);
	const b = parseInt(m[3]);
	const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
	const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
	const factor = entropy * 0.7;
	const nr = Math.round(r + (gray - r) * factor);
	const ng = Math.round(g + (gray - g) * factor);
	const nb = Math.round(b + (gray - b) * factor);
	if (a < 1) return `rgba(${nr},${ng},${nb},${a})`;
	return `rgb(${nr},${ng},${nb})`;
}

/** Desaturate any color string toward gray based on entropy */
function desaturateColor(color: string, entropy: number): string {
	if (color.startsWith("#")) return blendToGray(color, entropy);
	if (color.startsWith("rgb")) return blendRgbaToGray(color, entropy);
	return color;
}

// ── Component ───────────────────────────────────────────────

export default function KnowledgeGraph({ loaderData }: Route.ComponentProps) {
	const { theme, t, toggleTheme } = useTheme();
	const navigate = useNavigate();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const { courses, edges } = loaderData;

	// Simulation state kept in refs to avoid re-renders
	const nodesRef = useRef<CourseNode[]>([]);
	const iterRef = useRef(0);
	const rafRef = useRef<number>(0);
	const frameRef = useRef(0);

	// Camera state
	const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
	const dragRef = useRef<{ active: boolean; startX: number; startY: number; camStartX: number; camStartY: number }>({
		active: false,
		startX: 0,
		startY: 0,
		camStartX: 0,
		camStartY: 0,
	});

	// Hover state — stored as ID string
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const hoveredRef = useRef<string | null>(null);

	// Rebuild button
	const [rebuilding, setRebuilding] = useState(false);

	// Non-passive wheel listener (React onWheel is passive by default)
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const factor = e.deltaY > 0 ? 0.92 : 1.08;
			cameraRef.current.zoom = Math.max(0.2, Math.min(4, cameraRef.current.zoom * factor));
		};
		canvas.addEventListener("wheel", onWheel, { passive: false });
		return () => canvas.removeEventListener("wheel", onWheel);
	}, []);

	// ── Initialize nodes ────────────────────────────────────
	useEffect(() => {
		const angle = (2 * Math.PI) / Math.max(courses.length, 1);
		const spread = Math.min(courses.length * 30, 300);
		nodesRef.current = courses.map((c, i) => ({
			...c,
			x: Math.cos(angle * i) * spread + (Math.random() - 0.5) * 40,
			y: Math.sin(angle * i) * spread + (Math.random() - 0.5) * 40,
			vx: 0,
			vy: 0,
		}));
		iterRef.current = 0;
	}, [courses]);

	// ── Force simulation step ───────────────────────────────
	const simulate = useCallback(() => {
		const nodes = nodesRef.current;
		const REPULSION = 8000;
		const SPRING_K = 0.005;
		const SPRING_REST = 160;
		const DAMPING = 0.88;
		const CENTER_GRAVITY = 0.01;

		// Reset forces
		for (const n of nodes) {
			n.vx *= DAMPING;
			n.vy *= DAMPING;
		}

		// Repulsion between all pairs
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				const dx = nodes[i].x - nodes[j].x;
				const dy = nodes[i].y - nodes[j].y;
				const dist2 = dx * dx + dy * dy + 1;
				const dist = Math.sqrt(dist2);
				const force = REPULSION / dist2;
				const fx = (dx / dist) * force;
				const fy = (dy / dist) * force;
				nodes[i].vx += fx;
				nodes[i].vy += fy;
				nodes[j].vx -= fx;
				nodes[j].vy -= fy;
			}
		}

		// Spring attraction along edges
		const nodeMap = new Map(nodes.map((n) => [n.id, n]));
		for (const edge of edges) {
			const a = nodeMap.get(edge.from_course_id);
			const b = nodeMap.get(edge.to_course_id);
			if (!a || !b) continue;
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const dist = Math.sqrt(dx * dx + dy * dy) + 1;
			const displacement = dist - SPRING_REST;
			const strength = edge.strength ?? 1;
			const force = SPRING_K * displacement * strength;
			const fx = (dx / dist) * force;
			const fy = (dy / dist) * force;
			a.vx += fx;
			a.vy += fy;
			b.vx -= fx;
			b.vy -= fy;
		}

		// Center gravity
		for (const n of nodes) {
			n.vx -= n.x * CENTER_GRAVITY;
			n.vy -= n.y * CENTER_GRAVITY;
		}

		// Integrate
		for (const n of nodes) {
			n.x += n.vx;
			n.y += n.vy;
		}

		iterRef.current++;
	}, [edges]);

	// ── Screen <-> world coordinate conversion ──────────────
	const screenToWorld = useCallback((sx: number, sy: number, canvas: HTMLCanvasElement) => {
		const cam = cameraRef.current;
		const cx = canvas.width / 2;
		const cy = canvas.height / 2;
		return {
			x: (sx - cx) / cam.zoom - cam.x,
			y: (sy - cy) / cam.zoom - cam.y,
		};
	}, []);

	// ── Hit test ────────────────────────────────────────────
	const hitTest = useCallback((wx: number, wy: number): CourseNode | null => {
		const nodes = nodesRef.current;
		for (let i = nodes.length - 1; i >= 0; i--) {
			const n = nodes[i];
			const r = nodeRadius(n.difficulty);
			const dx = wx - n.x;
			const dy = wy - n.y;
			if (dx * dx + dy * dy <= r * r) return n;
		}
		return null;
	}, []);

	// ── Draw ────────────────────────────────────────────────
	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
			canvas.width = w * dpr;
			canvas.height = h * dpr;
		}

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);

		// Fill background
		ctx.fillStyle = t.bg;
		ctx.fillRect(0, 0, w, h);

		const cam = cameraRef.current;
		const cx = w / 2;
		const cy = h / 2;
		ctx.save();
		ctx.translate(cx, cy);
		ctx.scale(cam.zoom, cam.zoom);
		ctx.translate(cam.x, cam.y);

		const nodes = nodesRef.current;
		const nodeMap = new Map(nodes.map((n) => [n.id, n]));
		const hovered = hoveredRef.current;
		const frame = frameRef.current;

		// Connected set for highlight
		const connectedToHover = new Set<string>();
		if (hovered) {
			connectedToHover.add(hovered);
			for (const e of edges) {
				if (e.from_course_id === hovered) connectedToHover.add(e.to_course_id);
				if (e.to_course_id === hovered) connectedToHover.add(e.from_course_id);
			}
		}

		// Draw edges
		for (const edge of edges) {
			const a = nodeMap.get(edge.from_course_id);
			const b = nodeMap.get(edge.to_course_id);
			if (!a || !b) continue;

			const isHighlighted = hovered && connectedToHover.has(a.id) && connectedToHover.has(b.id);
			ctx.beginPath();
			ctx.moveTo(a.x, a.y);
			ctx.lineTo(b.x, b.y);
			ctx.strokeStyle = isHighlighted ? t.inkMuted : t.inkFaint;
			ctx.lineWidth = isHighlighted ? 1.5 : 0.5;
			ctx.stroke();

			// Edge label at midpoint
			const mx = (a.x + b.x) / 2;
			const my = (a.y + b.y) / 2;
			ctx.font = "8px JetBrains Mono, monospace";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillStyle = isHighlighted ? t.inkMuted : t.inkFaint;
			ctx.fillText(edge.relationship.toUpperCase(), mx, my - 6);
		}

		// Draw nodes
		for (const node of nodes) {
			const r = nodeRadius(node.difficulty);
			const isHovered = hovered === node.id;
			const isConnected = connectedToHover.has(node.id);
			const dimmed = hovered && !isConnected;
			const entropy = node.entropy;

			// Entropy-based opacity: min 0.3, max 1.0
			const entropyOpacity = 1 - entropy * 0.7;

			// Glitch offset for high-entropy nodes (>0.7)
			let glitchX = 0;
			let glitchY = 0;
			if (entropy > 0.7) {
				// Deterministic-ish random based on frame + node id hash
				const seed = frame + node.id.charCodeAt(0) * 31 + node.id.charCodeAt(1) * 17;
				glitchX = (Math.sin(seed * 0.73) * 2) * (entropy - 0.7) / 0.3;
				glitchY = (Math.cos(seed * 1.13) * 2) * (entropy - 0.7) / 0.3;
			}

			const nx = node.x + glitchX;
			const ny = node.y + glitchY;

			// Node color based on progress, desaturated by entropy
			let fillColor: string;
			if (node.progress >= 100) {
				fillColor = desaturateColor(t.accent, entropy); // completed — red, fades to gray
			} else if (node.progress > 0) {
				fillColor = desaturateColor(t.ink, entropy); // in progress
			} else {
				fillColor = desaturateColor(t.inkGhost, entropy); // not started
			}

			// Circle
			ctx.beginPath();
			ctx.arc(nx, ny, r, 0, Math.PI * 2);
			ctx.fillStyle = dimmed ? t.inkFaint : fillColor;
			ctx.globalAlpha = (dimmed ? 0.3 : entropyOpacity);
			ctx.fill();
			ctx.globalAlpha = 1;

			// Border: solid for normal, dashed for high entropy
			if (isHovered) {
				ctx.strokeStyle = t.accent;
				ctx.lineWidth = 2;
				ctx.setLineDash([]);
				ctx.stroke();
			} else if (entropy > 0.7) {
				ctx.strokeStyle = dimmed ? t.inkFaint : t.inkGhost;
				ctx.lineWidth = 1;
				ctx.globalAlpha = dimmed ? 0.3 : entropyOpacity;
				ctx.setLineDash([3, 3]);
				ctx.stroke();
				ctx.setLineDash([]);
				ctx.globalAlpha = 1;
			}

			// Monogram text
			const fontSize = Math.max(r * 0.55, 9);
			ctx.font = `500 ${fontSize}px JetBrains Mono, monospace`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillStyle = node.progress >= 100 ? t.bg : (dimmed ? t.inkGhost : t.bg);
			ctx.globalAlpha = (dimmed ? 0.3 : entropyOpacity);
			ctx.fillText(node.cover_monogram || "?", nx, ny);
			ctx.globalAlpha = 1;

			// Title below node
			if (isHovered || !hovered) {
				ctx.font = "10px JetBrains Mono, monospace";
				ctx.fillStyle = isHovered ? t.inkStrong : t.inkMuted;
				ctx.globalAlpha = dimmed ? 0.2 : isHovered ? 1 : 0.7 * entropyOpacity;
				ctx.fillText(node.title, nx, ny + r + 14);
				ctx.globalAlpha = 1;
			}
		}

		ctx.restore();

		// ── Draw legend (bottom-left, in screen space) ──────
		const legendX = 16;
		const legendY = h - 70;
		const dotR = 5;
		const spacing = 22;

		ctx.globalAlpha = 0.8;
		ctx.font = "9px JetBrains Mono, monospace";
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";

		// FRESH — bright circle
		ctx.beginPath();
		ctx.arc(legendX + dotR, legendY, dotR, 0, Math.PI * 2);
		ctx.fillStyle = t.accent;
		ctx.globalAlpha = 1;
		ctx.fill();
		ctx.fillStyle = t.inkMuted;
		ctx.fillText("FRESH", legendX + dotR * 2 + 8, legendY);

		// FADING — medium opacity circle
		ctx.beginPath();
		ctx.arc(legendX + dotR, legendY + spacing, dotR, 0, Math.PI * 2);
		ctx.fillStyle = desaturateColor(t.accent, 0.5);
		ctx.globalAlpha = 0.65;
		ctx.fill();
		ctx.globalAlpha = 1;
		ctx.fillStyle = t.inkMuted;
		ctx.fillText("FADING", legendX + dotR * 2 + 8, legendY + spacing);

		// NEEDS REVIEW — faded dashed circle
		ctx.beginPath();
		ctx.arc(legendX + dotR, legendY + spacing * 2, dotR, 0, Math.PI * 2);
		ctx.fillStyle = desaturateColor(t.accent, 0.9);
		ctx.globalAlpha = 0.3;
		ctx.fill();
		ctx.globalAlpha = 0.5;
		ctx.strokeStyle = t.inkGhost;
		ctx.lineWidth = 1;
		ctx.setLineDash([2, 2]);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.globalAlpha = 1;
		ctx.fillStyle = t.inkMuted;
		ctx.fillText("NEEDS REVIEW", legendX + dotR * 2 + 8, legendY + spacing * 2);

		ctx.globalAlpha = 1;
	}, [t, edges]);

	// ── Animation loop ──────────────────────────────────────
	useEffect(() => {
		if (courses.length < 2) return;

		const tick = () => {
			frameRef.current++;
			if (iterRef.current < 200) {
				simulate();
			}
			draw();
			rafRef.current = requestAnimationFrame(tick);
		};
		rafRef.current = requestAnimationFrame(tick);

		return () => cancelAnimationFrame(rafRef.current);
	}, [courses, simulate, draw]);

	// ── Redraw when theme changes (even after simulation settled) ──
	useEffect(() => {
		if (courses.length < 2) return;
		draw();
	}, [theme, draw, courses]);

	// ── Mouse interaction ───────────────────────────────────
	const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const sx = e.clientX - rect.left;
		const sy = e.clientY - rect.top;
		const world = screenToWorld(sx, sy, canvas);
		const hit = hitTest(world.x, world.y);

		if (hit) {
			navigate(`/learning/courses/${hit.slug}`);
			return;
		}

		// Start panning
		dragRef.current = {
			active: true,
			startX: e.clientX,
			startY: e.clientY,
			camStartX: cameraRef.current.x,
			camStartY: cameraRef.current.y,
		};
	}, [screenToWorld, hitTest, navigate]);

	const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		if (dragRef.current.active) {
			const dx = e.clientX - dragRef.current.startX;
			const dy = e.clientY - dragRef.current.startY;
			cameraRef.current.x = dragRef.current.camStartX + dx / cameraRef.current.zoom;
			cameraRef.current.y = dragRef.current.camStartY + dy / cameraRef.current.zoom;
			draw();
			return;
		}

		// Hover detection
		const rect = canvas.getBoundingClientRect();
		const sx = e.clientX - rect.left;
		const sy = e.clientY - rect.top;
		const world = screenToWorld(sx, sy, canvas);
		const hit = hitTest(world.x, world.y);
		const newId = hit?.id ?? null;
		if (newId !== hoveredRef.current) {
			hoveredRef.current = newId;
			setHoveredId(newId);
			canvas.style.cursor = newId ? "pointer" : "grab";
			draw();
		}
	}, [screenToWorld, hitTest, draw]);

	const handleMouseUp = useCallback(() => {
		dragRef.current.active = false;
	}, []);

	const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		if (e.touches.length === 1) {
			const touch = e.touches[0];
			dragRef.current = {
				active: true,
				startX: touch.clientX,
				startY: touch.clientY,
				camStartX: cameraRef.current.x,
				camStartY: cameraRef.current.y,
			};
		}
	}, []);

	const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
		if (!dragRef.current.active || e.touches.length !== 1) return;
		const touch = e.touches[0];
		const dx = touch.clientX - dragRef.current.startX;
		const dy = touch.clientY - dragRef.current.startY;
		cameraRef.current.x = dragRef.current.camStartX + dx / cameraRef.current.zoom;
		cameraRef.current.y = dragRef.current.camStartY + dy / cameraRef.current.zoom;
		draw();
	}, [draw]);

	const handleTouchEnd = useCallback(() => {
		dragRef.current.active = false;
	}, []);

	const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
		e.preventDefault();
		const factor = e.deltaY > 0 ? 0.92 : 1.08;
		cameraRef.current.zoom = Math.max(0.2, Math.min(4, cameraRef.current.zoom * factor));
		draw();
	}, [draw]);

	// ── Rebuild handler ─────────────────────────────────────
	const handleRebuild = useCallback(async () => {
		setRebuilding(true);
		try {
			await fetch("/learning/api/ai/build-graph", { method: "POST" });
			window.location.reload();
		} catch {
			setRebuilding(false);
		}
	}, []);

	// ── Hovered node data for tooltip ───────────────────────
	const hoveredNode = hoveredId
		? courses.find((c) => c.id === hoveredId) ?? null
		: null;

	// ── Empty state ─────────────────────────────────────────
	if (courses.length < 2) {
		return (
			<div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px" }}>
				<TopBar t={t} theme={theme} onToggleTheme={toggleTheme} />
				<div style={{ textAlign: "center", padding: "120px 0" }}>
					<FilmDot size={8} style={{ marginBottom: 24 }} />
					<div
						style={{
							fontFamily: "Playfair Display, serif",
							fontSize: 28,
							color: t.inkStrong,
							marginBottom: 12,
						}}
					>
						Not enough data yet
					</div>
					<Tracked size={10} style={{ color: t.inkMuted, display: "block", marginBottom: 32 }}>
						Add at least 2 courses to see the knowledge graph
					</Tracked>
					<TrackedButton t={t} onClick={() => navigate("/learning/library")} primary>
						Go to Library
					</TrackedButton>
				</div>
			</div>
		);
	}

	// ── Main render ─────────────────────────────────────────
	return (
		<div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px" }}>
			<TopBar t={t} theme={theme} onToggleTheme={toggleTheme} />

			{/* Header */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "28px 0 20px",
					flexWrap: "wrap",
					gap: 12,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
					<FilmDot size={6} />
					<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost }}>
						Knowledge Graph
					</Tracked>
				</div>
				<TrackedButton
					t={t}
					onClick={handleRebuild}
					disabled={rebuilding}
				>
					{rebuilding ? "Rebuilding..." : "Rebuild Graph"}
				</TrackedButton>
			</div>

			<Rule color={t.divider} />

			{/* Canvas */}
			<div
				ref={containerRef}
				style={{
					position: "relative",
					width: "100%",
					height: "calc(100vh - 240px)",
					minHeight: 400,
					marginTop: 16,
					border: `1px solid ${t.divider}`,
				}}
			>
				<canvas
					ref={canvasRef}
					style={{
						width: "100%",
						height: "100%",
						display: "block",
						cursor: "grab",
					}}
					onMouseDown={handleMouseDown}
					onMouseMove={handleMouseMove}
					onMouseUp={handleMouseUp}
					onMouseLeave={handleMouseUp}
					onTouchStart={handleTouchStart}
					onTouchMove={handleTouchMove}
					onTouchEnd={handleTouchEnd}
					onWheel={handleWheel}
				/>

				{/* Entropy tooltip for hovered node */}
				{hoveredNode && hoveredNode.entropy > 0.5 && (
					<div
						style={{
							position: "absolute",
							top: 12,
							right: 12,
							padding: "8px 12px",
							background: t.bgElevated,
							border: `1px solid ${t.divider}`,
							pointerEvents: "none",
						}}
					>
						<Tracked size={9} tracking={0.15} style={{ color: t.inkMuted }}>
							{hoveredNode.daysSinceReview !== null
								? `Last reviewed ${hoveredNode.daysSinceReview} day${hoveredNode.daysSinceReview === 1 ? "" : "s"} ago \u2014 review recommended`
								: "Never reviewed \u2014 review recommended"}
						</Tracked>
					</div>
				)}
			</div>

			{/* Footer stats */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: "16px 0 32px",
					gap: 8,
				}}
			>
				<Tracked size={9} tracking={0.2} style={{ color: t.inkGhost }}>
					{courses.length} Nodes
				</Tracked>
				<span style={{ color: t.inkFaint, fontSize: 9 }}>&middot;</span>
				<Tracked size={9} tracking={0.2} style={{ color: t.inkGhost }}>
					{edges.length} Connections
				</Tracked>
			</div>
		</div>
	);
}
