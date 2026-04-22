/**
 * Course overview — shows course details + lesson list.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/learning.courses.$slug";
import { useTheme } from "./learning";
import { createServiceClient } from "~/lib/supabase.server";
import { TopBar } from "~/components/learning/TopBar";
import { Tracked, FilmDot, Rule, ProgressBar, TrackedButton } from "~/components/learning/primitives";

export function meta({ data }: Route.MetaArgs) {
	const title = data?.course?.title ?? "Course";
	return [{ title: `Napat · Learning · ${title}` }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	const supabase = createServiceClient(env);

	const slug = decodeURIComponent(params.slug || "");
	const { data: course } = await supabase
		.from("courses")
		.select("*, lessons(id, order_index, title, summary, outcomes, status, generated_at)")
		.eq("slug", slug)
		.single();

	if (!course) throw new Response("not found.", { status: 404 });

	// Get progress for each lesson
	const lessonIds = (course.lessons || []).map((l: { id: string }) => l.id);
	const { data: progress } = await supabase
		.from("lesson_progress")
		.select("*")
		.in("lesson_id", lessonIds.length > 0 ? lessonIds : ["__none__"]);

	return { course, progress: progress || [] };
}

export default function CourseOverview({ loaderData }: Route.ComponentProps) {
	const { theme, t, toggleTheme } = useTheme();
	const navigate = useNavigate();
	const { course, progress } = loaderData;
	const lessons = (course.lessons || []).sort(
		(a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index,
	);

	const progressMap = new Map(
		progress.map((p: { lesson_id: string; status: string; scroll_percent: number }) => [p.lesson_id, p]),
	);

	const completedCount = progress.filter((p: { status: string }) => p.status === "completed").length;
	const totalProg = lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0;

	const [deleting, setDeleting] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);

	const handleDelete = useCallback(async () => {
		if (deleting) return;
		setDeleting(true);
		try {
			const res = await fetch("/learning/api/courses", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ courseId: course.id }),
			});
			if (res.ok) {
				navigate("/learning");
			}
		} catch {
			// error
		} finally {
			setDeleting(false);
			setConfirmDelete(false);
		}
	}, [course.id, deleting, navigate]);

	return (
		<div style={{ padding: "0 20px 120px" }}>
			<TopBar t={t} theme={theme} onToggleTheme={toggleTheme} />

			<div style={{ maxWidth: 920, margin: "0 auto", paddingTop: 64 }}>
				{/* Section label */}
				<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost, display: "block", marginBottom: 24 }}>
					COURSE
				</Tracked>

				{/* Title + monogram */}
				<div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap" }}>
					<div
						style={{
							width: 72,
							height: 92,
							border: `1px solid ${t.divider}`,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							flexShrink: 0,
						}}
					>
						<span style={{ fontFamily: "Playfair Display, serif", fontSize: 48, color: t.inkStrong, fontWeight: 500 }}>
							{course.cover_monogram || course.title[0]}
						</span>
					</div>
					<div>
						<h1 style={{
							fontFamily: "Playfair Display, serif",
							fontSize: "clamp(28px, 6vw, 48px)",
							fontWeight: 500,
							color: t.inkStrong,
							letterSpacing: "-0.02em",
							lineHeight: 1,
							margin: 0,
						}}>
							{course.title}<span style={{ color: t.accent }}>.</span>
						</h1>
						{course.subtitle && (
							<p style={{
								fontFamily: "Playfair Display, serif",
								fontSize: 22,
								color: t.inkGhost,
								fontStyle: "italic",
								marginTop: 8,
							}}>
								{course.subtitle}
							</p>
						)}
					</div>
				</div>

				{/* Meta */}
				<div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 24, marginBottom: 8 }}>
					<Tracked size={9} tracking={0.22} style={{ color: t.inkGhost }}>
						{course.source === "manual" ? "HAND-CRAFTED" : "AI-GENERATED"} · {lessons.length} LESSONS · {totalProg}% COMPLETE
					</Tracked>
				</div>
				<ProgressBar value={totalProg} t={t} />

				{/* Course actions */}
				<div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
					<TrackedButton t={t} onClick={() => navigate(`/learning/courses/${course.slug}/lessons/0`)}>
						{totalProg > 0 ? "CONTINUE LEARNING" : "START LEARNING"}
					</TrackedButton>
					{!confirmDelete ? (
						<TrackedButton t={t} onClick={() => setConfirmDelete(true)}>
							DELETE COURSE
						</TrackedButton>
					) : (
						<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
							<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: t.accent, textTransform: "uppercase", letterSpacing: "0.15em" }}>
								{deleting ? "DELETING…" : "ARE YOU SURE?"}
							</span>
							<TrackedButton t={t} onClick={handleDelete} disabled={deleting}>
								YES, DELETE
							</TrackedButton>
							<TrackedButton t={t} onClick={() => setConfirmDelete(false)}>
								CANCEL
							</TrackedButton>
						</div>
					)}
				</div>

				{/* Description */}
				{course.description && (
					<p style={{ fontSize: 16, lineHeight: 1.75, color: t.ink, fontWeight: 300, marginTop: 32, maxWidth: 640 }}>
						{course.description}
					</p>
				)}

				{/* Lessons list */}
				<div style={{ marginTop: 56 }}>
					<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
						<Rule width={40} color={t.inkGhost} />
						<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost }}>
							LESSONS
						</Tracked>
					</div>

					<div style={{ borderTop: `1px solid ${t.divider}` }}>
						{lessons.map((lesson: {
							id: string;
							order_index: number;
							title: string;
							summary: string | null;
							status: string;
							outcomes: string[];
						}) => {
							const lp = progressMap.get(lesson.id) as { status: string; scroll_percent: number } | undefined;
							const isReady = lesson.status === "ready" || lesson.status === "edited";
							const isPending = lesson.status === "pending";
							const isCompleted = lp?.status === "completed";

							return (
								<div
									key={lesson.id}
									onClick={() => {
										navigate(`/learning/courses/${course.slug}/lessons/${lesson.order_index}`);
									}}
									style={{
										display: "grid",
										gridTemplateColumns: "36px 1fr auto",
										gap: 16,
										alignItems: "baseline",
										padding: "22px 0",
										borderBottom: `1px solid ${t.divider}`,
										cursor: "pointer",
										transition: "background .3s",
									}}
									onMouseEnter={(e) => { e.currentTarget.style.background = t.bgCard; }}
									onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
								>
									<span style={{
										fontFamily: "Playfair Display, serif",
										fontSize: 22,
										color: t.inkGhost,
										fontWeight: 500,
									}}>
										{String(lesson.order_index).padStart(2, "0")}
									</span>
									<div>
										<div style={{
											fontFamily: "Playfair Display, serif",
											fontSize: 19,
											color: t.inkStrong,
										}}>
											{lesson.title}
										</div>
										{lesson.summary && (
											<div style={{
												fontSize: 13,
												color: t.inkMuted,
												fontStyle: "italic",
												fontFamily: "Playfair Display, serif",
												marginTop: 4,
											}}>
												{lesson.summary}
											</div>
										)}
									</div>
									<div>
										{isCompleted ? (
											<Tracked size={9} tracking={0.22} style={{ color: t.inkMuted }}>DONE</Tracked>
										) : isReady ? (
											<Tracked size={9} tracking={0.22} style={{ color: t.ink }}>
												<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
													<FilmDot size={4} />
													READY
												</span>
											</Tracked>
										) : isPending ? (
											<TrackedButton t={t} primary onClick={(e) => {
												e.stopPropagation();
												navigate(`/learning/courses/${course.slug}/lessons/${lesson.order_index}`);
											}}>
												GENERATE
											</TrackedButton>
										) : (
											<Tracked size={9} tracking={0.22} style={{ color: t.inkGhost }}>
												{lesson.status.toUpperCase()}
											</Tracked>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>

				{/* Tags */}
				{course.tags && course.tags.length > 0 && (
					<div style={{ marginTop: 48, display: "flex", flexWrap: "wrap", gap: 8 }}>
						{course.tags.map((tag: string) => (
							<span
								key={tag}
								style={{
									fontFamily: "JetBrains Mono, monospace",
									fontSize: 9,
									textTransform: "uppercase",
									letterSpacing: "0.2em",
									padding: "6px 10px",
									border: `1px solid ${t.divider}`,
									color: t.inkGhost,
								}}
							>
								{tag}
							</span>
						))}
					</div>
				)}

				{/* What's Next — shown when course is 100% complete */}
				{totalProg === 100 && (
					<WhatsNextSection courseId={course.id} t={t} />
				)}
			</div>
		</div>
	);
}

type Suggestion = {
	title: string;
	description: string;
	prompt: string;
	connection: string;
};

function WhatsNextSection({ courseId, t }: { courseId: string; t: Record<string, string> }) {
	const navigate = useNavigate();
	const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);

	useEffect(() => {
		let cancelled = false;
		fetch("/learning/api/ai/related-courses", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ courseId }),
		})
			.then((res) => {
				if (!res.ok) throw new Error("fetch failed");
				return res.json();
			})
			.then((data: { suggestions: Suggestion[] }) => {
				if (!cancelled) setSuggestions(data.suggestions || []);
			})
			.catch(() => {
				if (!cancelled) setError(true);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => { cancelled = true; };
	}, [courseId]);

	if (error || (!loading && suggestions.length === 0)) return null;

	return (
		<div style={{ marginTop: 72 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
				<Rule width={40} color={t.inkGhost} />
				<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost }}>
					WHAT&apos;S NEXT
				</Tracked>
			</div>

			{loading ? (
				<Tracked size={9} tracking={0.22} style={{ color: t.inkGhost }}>
					FINDING RELATED COURSES...
				</Tracked>
			) : (
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
					{suggestions.map((s) => (
						<div
							key={s.prompt}
							onClick={() => navigate(`/learning?prompt=${encodeURIComponent(s.prompt)}`)}
							style={{
								border: `1px solid ${t.divider}`,
								padding: "24px 20px",
								cursor: "pointer",
								transition: "border-color .3s, background .3s",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.borderColor = t.accent;
								e.currentTarget.style.background = t.bgCard;
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.borderColor = t.divider;
								e.currentTarget.style.background = "transparent";
							}}
						>
							<h3 style={{
								fontFamily: "Playfair Display, serif",
								fontSize: 20,
								fontWeight: 500,
								color: t.inkStrong,
								margin: 0,
								lineHeight: 1.25,
							}}>
								{s.title}<span style={{ color: t.accent }}>.</span>
							</h3>
							<p style={{
								fontSize: 13,
								lineHeight: 1.6,
								color: t.ink,
								fontWeight: 300,
								margin: "10px 0 14px",
							}}>
								{s.description}
							</p>
							<Tracked size={8} tracking={0.25} style={{ color: t.inkGhost }}>
								<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
									<FilmDot size={3} />
									{s.connection}
								</span>
							</Tracked>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
