/**
 * CourseCard — overview card for a course, matching the library grid design.
 * Monogram cover, Playfair Display title, progress bar, and meta line.
 */
import { useState } from "react";
import type { ThemeTokens } from "~/lib/theme";
import { Tracked, ProgressBar } from "./primitives";

const SERIF = "Playfair Display, serif";

// ── Types ─────────────────────────────────────────────────

export interface CourseCardData {
	id: string;
	slug: string;
	title: string;
	subtitle: string | null;
	coverMonogram: string | null;
	source: string;
	estimatedMinutes: number | null;
	lessonCount: number;
	completedCount: number;
}

interface CourseCardProps {
	course: CourseCardData;
	t: ThemeTokens;
	onClick?: () => void;
}

// ── Component ─────────────────────────────────────────────

export function CourseCard({ course, t, onClick }: CourseCardProps) {
	const [hover, setHover] = useState(false);

	const progress =
		course.lessonCount > 0
			? Math.round((course.completedCount / course.lessonCount) * 100)
			: 0;

	const isManual = course.source === "manual";
	const hours = course.estimatedMinutes
		? `${Math.round(course.estimatedMinutes / 60)}H`
		: "";

	const status =
		course.lessonCount === 0
			? "NOT STARTED"
			: course.completedCount === course.lessonCount
				? "COMPLETED"
				: course.completedCount > 0
					? "IN PROGRESS"
					: "NOT STARTED";

	return (
		<div
			onClick={onClick}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			style={{
				padding: "28px 26px 24px",
				cursor: onClick ? "pointer" : "default",
				background: hover && onClick ? t.bgCard : "transparent",
				transition: "background .3s",
				position: "relative",
			}}
		>
			{/* Monogram + badge */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-start",
					marginBottom: 36,
				}}
			>
				{/* Monogram cover */}
				<div
					style={{
						width: 56,
						height: 72,
						border: `1px solid ${t.divider}`,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<span
						style={{
							fontFamily: SERIF,
							fontSize: 36,
							color: t.inkStrong,
							fontWeight: 500,
						}}
					>
						{course.coverMonogram || course.title[0]}
					</span>
				</div>

				{isManual && (
					<Tracked size={9} tracking={0.25} style={{ color: t.inkGhost }}>
						HAND-CRAFTED
					</Tracked>
				)}
			</div>

			{/* Title */}
			<div
				style={{
					fontFamily: SERIF,
					fontSize: 22,
					color: t.inkStrong,
					lineHeight: 1.15,
					marginBottom: 8,
				}}
			>
				{course.title}
			</div>

			{/* Subtitle */}
			{course.subtitle && (
				<div
					style={{
						fontFamily: SERIF,
						fontSize: 14,
						color: t.inkMuted,
						fontStyle: "italic",
						marginBottom: 22,
						lineHeight: 1.4,
					}}
				>
					{course.subtitle}
				</div>
			)}

			{/* Progress bar */}
			<ProgressBar value={progress} t={t} />

			{/* Meta line */}
			<div style={{ marginTop: 14 }}>
				<Tracked size={9} tracking={0.22} style={{ color: t.inkGhost }}>
					{isManual ? "HAND-CRAFTED" : "AI-GENERATED"}
					{hours && ` · ${hours}`}
					{` · ${status}`}
				</Tracked>
			</div>
		</div>
	);
}
