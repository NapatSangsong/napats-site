/**
 * LessonSidebar — left sidebar for the lesson reader view.
 * Shows course navigation, progress, and lesson list with status indicators.
 */
import { useState } from "react";
import { Link } from "react-router";
import type { ThemeTokens } from "~/lib/theme";
import { FilmDot, Tracked, ProgressBar } from "./primitives";

const SERIF = "Playfair Display, serif";
const MONO = "JetBrains Mono, ui-monospace, monospace";

// ── Types ─────────────────────────────────────────────────

export type LessonStatus = "done" | "current" | "ready" | "locked";

export interface SidebarLesson {
	id: string;
	number: number;
	title: string;
	status: LessonStatus;
	/** Progress percentage for current lesson */
	progress?: number;
	href: string;
}

interface LessonSidebarProps {
	t: ThemeTokens;
	courseTitle: string;
	courseSlug: string;
	lessons: SidebarLesson[];
	overallProgress: number;
	activeLessonId?: string;
}

// ── Status color mapping ──────────────────────────────────

function statusColor(status: LessonStatus, t: ThemeTokens): string {
	switch (status) {
		case "done":
			return t.ink;
		case "current":
			return t.inkStrong;
		case "ready":
			return t.inkMuted;
		case "locked":
			return t.inkGhost;
	}
}

// ── Component ─────────────────────────────────────────────

export function LessonSidebar({
	t,
	courseTitle,
	courseSlug,
	lessons,
	overallProgress,
	activeLessonId,
}: LessonSidebarProps) {
	return (
		<aside
			style={{
				width: 280,
				minHeight: "100vh",
				borderRight: `1px solid ${t.divider}`,
				padding: "28px 24px",
				display: "flex",
				flexDirection: "column",
				flexShrink: 0,
				background: t.bg,
			}}
		>
			{/* Logo */}
			<Link
				to="/learning"
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					textDecoration: "none",
					marginBottom: 36,
				}}
			>
				<span
					style={{
						fontFamily: SERIF,
						fontSize: 18,
						color: t.inkStrong,
						fontWeight: 500,
					}}
				>
					Napat
				</span>
				<FilmDot size={5} />
			</Link>

			{/* Course title */}
			<Link
				to={`/learning/courses/${courseSlug}`}
				style={{ textDecoration: "none" }}
			>
				<div
					style={{
						fontFamily: SERIF,
						fontSize: 20,
						color: t.inkStrong,
						lineHeight: 1.25,
						marginBottom: 20,
						fontWeight: 500,
					}}
				>
					{courseTitle}
				</div>
			</Link>

			{/* Progress bar */}
			<div style={{ marginBottom: 8 }}>
				<ProgressBar value={overallProgress} t={t} />
			</div>
			<Tracked
				size={9}
				tracking={0.25}
				style={{ color: t.inkGhost, marginBottom: 28, display: "block" }}
			>
				{overallProgress}% COMPLETE
			</Tracked>

			{/* Divider */}
			<div style={{ height: 1, background: t.divider, marginBottom: 20 }} />

			{/* Lesson list */}
			<div style={{ flex: 1, overflowY: "auto" }}>
				{lessons.map((lesson) => {
					const isActive = lesson.id === activeLessonId;
					const color = statusColor(lesson.status, t);
					const isLocked = lesson.status === "locked";

					return (
						<LessonItem
							key={lesson.id}
							lesson={lesson}
							isActive={isActive}
							color={color}
							isLocked={isLocked}
							t={t}
						/>
					);
				})}
			</div>
		</aside>
	);
}

// ── Lesson list item ──────────────────────────────────────

function LessonItem({
	lesson,
	isActive,
	color,
	isLocked,
	t,
}: {
	lesson: SidebarLesson;
	isActive: boolean;
	color: string;
	isLocked: boolean;
	t: ThemeTokens;
}) {
	const [hover, setHover] = useState(false);

	const inner = (
		<div
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			style={{
				display: "flex",
				alignItems: "flex-start",
				gap: 12,
				padding: "10px 14px",
				borderLeft: isActive ? `1px solid ${t.accent}` : "1px solid transparent",
				background: hover && !isLocked ? t.bgCard : "transparent",
				transition: "background .2s, border-color .2s",
				cursor: isLocked ? "default" : "pointer",
				opacity: isLocked ? 0.4 : 1,
			}}
		>
			{/* Number */}
			<span
				style={{
					fontFamily: SERIF,
					fontSize: 14,
					color,
					flexShrink: 0,
					minWidth: 18,
				}}
			>
				{String(lesson.number).padStart(2, "0")}
			</span>

			{/* Title + status label */}
			<div style={{ flex: 1, minWidth: 0 }}>
				<div
					style={{
						fontSize: 13,
						lineHeight: 1.35,
						color,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{lesson.title}
				</div>
				{isActive && (
					<Tracked
						size={8}
						tracking={0.25}
						style={{
							color: t.accent,
							display: "block",
							marginTop: 4,
						}}
					>
						CURRENT{lesson.progress != null ? ` · ${lesson.progress}%` : ""}
					</Tracked>
				)}
			</div>
		</div>
	);

	if (isLocked) {
		return <div key={lesson.id}>{inner}</div>;
	}

	return (
		<Link
			to={lesson.href}
			style={{ textDecoration: "none", display: "block" }}
		>
			{inner}
		</Link>
	);
}
