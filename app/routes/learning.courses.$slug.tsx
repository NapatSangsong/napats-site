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

const AI_MODELS = [
	{ id: "auto", label: "AUTO", badge: "RECOMMENDED" },
	{ id: "google/gemini-2.5-pro-preview-06-05", label: "GEMINI PRO", badge: "BEST" },
	{ id: "google/gemini-2.5-flash-preview-05-20", label: "GEMINI FLASH", badge: "FAST" },
	{ id: "anthropic/claude-sonnet-4-6", label: "CLAUDE SONNET", badge: "PREMIUM" },
	{ id: "anthropic/claude-haiku-4-5-20251001", label: "CLAUDE HAIKU", badge: "FAST" },
	{ id: "google/gemma-4-31b-it:free", label: "GEMMA 31B", badge: "FREE" },
	{ id: "google/gemma-4-26b-a4b-it:free", label: "GEMMA 26B", badge: "FREE" },
];

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
		.select("*, lessons(id, order_index, title, summary, outcomes, status, generated_at, generated_by_model)")
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
	const [regenModelFor, setRegenModelFor] = useState<string | null>(null);
	const [regenAllModel, setRegenAllModel] = useState(false);

	// Edit mode state
	const [editMode, setEditMode] = useState(false);
	const [editTitle, setEditTitle] = useState(course.title);
	const [editSubtitle, setEditSubtitle] = useState(course.subtitle || "");
	const [editDescription, setEditDescription] = useState(course.description || "");
	const [saving, setSaving] = useState(false);

	const handleSaveCourse = useCallback(async () => {
		if (saving) return;
		setSaving(true);
		try {
			const res = await fetch("/learning/api/courses", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ courseId: course.id, title: editTitle, subtitle: editSubtitle, description: editDescription }),
			});
			if (res.ok) window.location.reload();
		} catch {
			// error
		} finally {
			setSaving(false);
		}
	}, [course.id, editTitle, editSubtitle, editDescription, saving]);

	const handleLessonAction = useCallback(async (action: string, lessonId: string) => {
		const res = await fetch("/learning/api/courses", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action, lessonId }),
		});
		if (res.ok) window.location.reload();
	}, []);

	const handleRegenWithModel = useCallback(async (lessonId: string, modelId: string) => {
		const model = modelId === "auto" ? undefined : modelId;
		await fetch("/learning/api/courses", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action: "regenerate-lesson", lessonId, model }),
		});
		setRegenModelFor(null);
		window.location.reload();
	}, []);

	const handleRegenAll = useCallback(async (modelId: string) => {
		const model = modelId === "auto" ? undefined : modelId;
		for (const lesson of lessons) {
			await fetch("/learning/api/courses", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "regenerate-lesson", lessonId: lesson.id, model }),
			});
		}
		setRegenAllModel(false);
		window.location.reload();
	}, [lessons]);

	const handleAddLesson = useCallback(async () => {
		const res = await fetch("/learning/api/courses", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action: "add-lesson", courseId: course.id, afterIndex: lessons.length }),
		});
		if (res.ok) window.location.reload();
	}, [course.id, lessons.length]);

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
					<div style={{ flex: 1 }}>
						{editMode ? (
							<input
								value={editTitle}
								onChange={(e) => setEditTitle(e.target.value)}
								style={{
									fontFamily: "Playfair Display, serif",
									fontSize: "clamp(28px, 6vw, 48px)",
									fontWeight: 500,
									color: t.inkStrong,
									letterSpacing: "-0.02em",
									lineHeight: 1,
									margin: 0,
									background: "transparent",
									border: `1px solid ${t.divider}`,
									outline: "none",
									width: "100%",
									padding: "4px 8px",
								}}
							/>
						) : (
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
						)}
						{editMode ? (
							<input
								value={editSubtitle}
								onChange={(e) => setEditSubtitle(e.target.value)}
								placeholder="Subtitle"
								style={{
									fontFamily: "Playfair Display, serif",
									fontSize: 22,
									color: t.inkGhost,
									fontStyle: "italic",
									marginTop: 8,
									background: "transparent",
									border: `1px solid ${t.divider}`,
									outline: "none",
									width: "100%",
									padding: "4px 8px",
								}}
							/>
						) : (
							course.subtitle && (
								<p style={{
									fontFamily: "Playfair Display, serif",
									fontSize: 22,
									color: t.inkGhost,
									fontStyle: "italic",
									marginTop: 8,
								}}>
									{course.subtitle}
								</p>
							)
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
					{editMode ? (
						<>
							<TrackedButton t={t} primary onClick={handleSaveCourse} disabled={saving}>
								{saving ? "SAVING…" : "SAVE"}
							</TrackedButton>
							<TrackedButton t={t} onClick={() => { setEditMode(false); setEditTitle(course.title); setEditSubtitle(course.subtitle || ""); setEditDescription(course.description || ""); }}>
								CANCEL
							</TrackedButton>
						</>
					) : (
						<TrackedButton t={t} onClick={() => setEditMode(true)}>
							EDIT COURSE
						</TrackedButton>
					)}
					<TrackedButton t={t} onClick={() => window.open(`/learning/api/export?courseId=${course.id}&format=json`, "_blank")}>
						EXPORT JSON
					</TrackedButton>
					<TrackedButton t={t} onClick={() => window.open(`/learning/api/export?courseId=${course.id}&format=md`, "_blank")}>
						EXPORT MD
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
				{editMode ? (
					<textarea
						value={editDescription}
						onChange={(e) => setEditDescription(e.target.value)}
						placeholder="Course description"
						rows={4}
						style={{
							fontSize: 16,
							lineHeight: 1.75,
							color: t.ink,
							fontWeight: 300,
							marginTop: 32,
							maxWidth: 640,
							width: "100%",
							background: "transparent",
							border: `1px solid ${t.divider}`,
							outline: "none",
							padding: "8px 12px",
							fontFamily: "inherit",
							resize: "vertical",
						}}
					/>
				) : (
					course.description && (
						<p style={{ fontSize: 16, lineHeight: 1.75, color: t.ink, fontWeight: 300, marginTop: 32, maxWidth: 640 }}>
							{course.description}
						</p>
					)
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
							generated_by_model: string | null;
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
										<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
											<span style={{
												fontFamily: "Playfair Display, serif",
												fontSize: 19,
												color: t.inkStrong,
											}}>
												{lesson.title}
											</span>
											{lesson.generated_by_model && (
												<span style={{
													fontFamily: "JetBrains Mono, monospace",
													fontSize: 8,
													textTransform: "uppercase",
													letterSpacing: "0.15em",
													padding: "2px 6px",
													border: `1px solid ${t.divider}`,
													color: t.inkGhost,
													whiteSpace: "nowrap",
												}}>
													{AI_MODELS.find(m => m.id === lesson.generated_by_model)?.label || lesson.generated_by_model.split("/").pop()?.toUpperCase()}
												</span>
											)}
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
									<div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
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
										<button
											title="Regenerate lesson"
											onClick={(e) => {
												e.stopPropagation();
												setRegenModelFor(regenModelFor === lesson.id ? null : lesson.id);
											}}
											style={{
												background: "transparent",
												border: `1px solid ${t.divider}`,
												color: t.inkGhost,
												cursor: "pointer",
												fontFamily: "JetBrains Mono, monospace",
												fontSize: 13,
												width: 28,
												height: 28,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												padding: 0,
												lineHeight: 1,
											}}
										>
											&#x21bb;
										</button>
										<button
											title="Delete lesson"
											onClick={(e) => {
												e.stopPropagation();
												if (confirm("Delete this lesson?")) handleLessonAction("delete-lesson", lesson.id);
											}}
											style={{
												background: "transparent",
												border: `1px solid ${t.divider}`,
												color: t.inkGhost,
												cursor: "pointer",
												fontFamily: "JetBrains Mono, monospace",
												fontSize: 13,
												width: 28,
												height: 28,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												padding: 0,
												lineHeight: 1,
											}}
										>
											&times;
										</button>
										{regenModelFor === lesson.id && (
											<div
												onClick={(e) => e.stopPropagation()}
												style={{
													position: "absolute",
													top: "100%",
													right: 0,
													marginTop: 4,
													background: t.bg,
													border: `1px solid ${t.divider}`,
													zIndex: 10,
													minWidth: 200,
												}}
											>
												{AI_MODELS.map((m) => (
													<button
														key={m.id}
														onClick={(e) => {
															e.stopPropagation();
															handleRegenWithModel(lesson.id, m.id);
														}}
														style={{
															display: "flex",
															alignItems: "center",
															justifyContent: "space-between",
															gap: 8,
															width: "100%",
															padding: "8px 12px",
															background: "transparent",
															border: "none",
															borderBottom: `1px solid ${t.divider}`,
															cursor: "pointer",
															fontFamily: "JetBrains Mono, monospace",
															fontSize: 9,
															textTransform: "uppercase",
															letterSpacing: "0.15em",
															color: t.ink,
															textAlign: "left",
														}}
														onMouseEnter={(e) => { e.currentTarget.style.background = t.bgCard; }}
														onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
													>
														<span>{m.label}</span>
														<span style={{ color: t.inkGhost, fontSize: 8 }}>{m.badge}</span>
													</button>
												))}
											</div>
										)}
									</div>
								</div>
							);
						})}
					</div>
					<div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "flex-start", position: "relative" }}>
						<TrackedButton t={t} onClick={handleAddLesson}>
							ADD LESSON
						</TrackedButton>
						<div style={{ position: "relative" }}>
							<TrackedButton t={t} onClick={() => setRegenAllModel(!regenAllModel)}>
								REGENERATE ALL
							</TrackedButton>
							{regenAllModel && (
								<div style={{
									position: "absolute",
									top: "100%",
									left: 0,
									marginTop: 4,
									background: t.bg,
									border: `1px solid ${t.divider}`,
									zIndex: 10,
									minWidth: 200,
								}}>
									{AI_MODELS.map((m) => (
										<button
											key={m.id}
											onClick={() => handleRegenAll(m.id)}
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "space-between",
												gap: 8,
												width: "100%",
												padding: "8px 12px",
												background: "transparent",
												border: "none",
												borderBottom: `1px solid ${t.divider}`,
												cursor: "pointer",
												fontFamily: "JetBrains Mono, monospace",
												fontSize: 9,
												textTransform: "uppercase",
												letterSpacing: "0.15em",
												color: t.ink,
												textAlign: "left",
											}}
											onMouseEnter={(e) => { e.currentTarget.style.background = t.bgCard; }}
											onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
										>
											<span>{m.label}</span>
											<span style={{ color: t.inkGhost, fontSize: 8 }}>{m.badge}</span>
										</button>
									))}
								</div>
							)}
						</div>
					</div>
				</div>

				{/* Certificate */}
			{totalProg === 100 && (
				<div style={{ marginTop: 56, padding: "40px 32px", border: `1px solid ${t.dividerStrong}`, textAlign: "center" }}>
					<Tracked size={10} tracking={0.4} style={{ color: t.inkGhost, display: "block", marginBottom: 16 }}>
						CERTIFICATE OF COMPLETION
					</Tracked>
					<FilmDot size={6} style={{ margin: "0 auto 20px" }} />
					<div style={{ fontFamily: "Playfair Display, serif", fontSize: 32, color: t.inkStrong, fontWeight: 500, lineHeight: 1.2, marginBottom: 12 }}>
						{course.title}
					</div>
					<div style={{ fontFamily: "Playfair Display, serif", fontSize: 16, color: t.inkMuted, fontStyle: "italic", marginBottom: 24 }}>
						completed by Napat Sangsong
					</div>
					<Rule width={80} color={t.dividerStrong} />
					<div style={{ marginTop: 20 }}>
						<Tracked size={9} tracking={0.2} style={{ color: t.inkGhost }}>
							{lessons.length} LESSONS · ALL UNDERSTANDING CONFIRMED · {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
						</Tracked>
					</div>
					<div style={{ marginTop: 24 }}>
						<TrackedButton t={t} primary onClick={() => {
							const certHtml = `<!DOCTYPE html><html><head><title>Certificate - ${course.title}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&display=swap');
body{margin:0;padding:80px 60px;background:#F5F3EF;font-family:'Playfair Display',serif;text-align:center;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;}
h1{font-size:14px;letter-spacing:0.4em;text-transform:uppercase;color:#999;font-family:monospace;margin-bottom:40px;}
h2{font-size:48px;color:#000;font-weight:500;line-height:1.1;margin:0 0 12px;}
.sub{font-size:20px;color:#666;font-style:italic;margin-bottom:40px;}
.dot{width:8px;height:8px;border-radius:50%;background:#cc0000;margin:0 auto 30px;}
.meta{font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#999;font-family:monospace;}
hr{border:none;border-top:1px solid #ddd;width:120px;margin:30px auto;}
@media print{body{padding:40px;}}
</style></head><body>
<h1>Certificate of Completion</h1>
<div class="dot"></div>
<h2>${course.title}</h2>
<p class="sub">completed by Napat Sangsong</p>
<hr/>
<p class="meta">${lessons.length} LESSONS · ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
</body></html>`;
							const w = window.open("", "_blank");
							if (w) { w.document.write(certHtml); w.document.close(); setTimeout(() => w.print(), 500); }
						}}>
							DOWNLOAD CERTIFICATE
						</TrackedButton>
					</div>
				</div>
			)}

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
