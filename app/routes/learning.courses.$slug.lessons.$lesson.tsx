/**
 * Lesson reader — three-pane layout: sidebar, content, chat.
 * Streams AI content for pending lessons, renders blocks for ready ones.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import type { Route } from "./+types/learning.courses.$slug.lessons.$lesson";
import { useTheme } from "./learning";
import { createServiceClient } from "~/lib/supabase.server";

export function meta({ data }: Route.MetaArgs) {
	return [{ title: `Napat · Learning · ${data?.lesson?.title ?? "Lesson"}` }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	const supabase = createServiceClient(env);

	// Get course
	const { data: course } = await supabase
		.from("courses")
		.select("id, slug, title, subtitle, cover_monogram, lessons(id, order_index, title, status)")
		.eq("slug", params.slug)
		.single();

	if (!course) throw new Response("course not found.", { status: 404 });

	const lessonIndex = parseInt(params.lesson, 10);
	const lessons = (course.lessons || []).sort(
		(a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index,
	);
	const lesson = lessons.find((l: { order_index: number }) => l.order_index === lessonIndex);
	if (!lesson) throw new Response("lesson not found.", { status: 404 });

	// Get blocks if lesson is ready
	let blocks: unknown[] = [];
	if (lesson.status === "ready" || lesson.status === "edited") {
		const { data: blockData } = await supabase
			.from("lesson_blocks")
			.select("*")
			.eq("lesson_id", lesson.id)
			.order("order_index", { ascending: true });
		blocks = blockData || [];
	}

	// Get progress
	const { data: progress } = await supabase
		.from("lesson_progress")
		.select("*")
		.eq("lesson_id", lesson.id)
		.single();

	return { course, lesson, lessons, blocks, progress };
}

export default function LessonReader({ loaderData }: Route.ComponentProps) {
	const { theme, t, toggleTheme } = useTheme();
	const { course, lesson, lessons, blocks: initialBlocks, progress } = loaderData;
	const [blocks, setBlocks] = useState<unknown[]>(initialBlocks);
	const [chatOpen, setChatOpen] = useState(true);
	const [chatInput, setChatInput] = useState("");
	const [messages, setMessages] = useState<{ who: string; text: string; typing?: boolean }[]>([
		{ who: "MINSU", text: "we are here. ask anything, anytime." },
	]);
	const [sending, setSending] = useState(false);
	const [hoveredBlock, setHoveredBlock] = useState<string | null>(null);
	const [refineBlock, setRefineBlock] = useState<{ id: string; kind: string; text?: string } | null>(null);
	const [generating, setGenerating] = useState(false);
	const [scrollPercent, setScrollPercent] = useState(progress?.scroll_percent ?? 0);
	const contentRef = useRef<HTMLDivElement>(null);

	const isPending = lesson.status === "pending";

	// Generate lesson content if pending
	const generateLesson = useCallback(async () => {
		if (generating) return;
		setGenerating(true);
		try {
			const res = await fetch("/learning/api/ai/generate-lesson", {
				method: "POST",
				headers: { "Content-Type": "application/json", Origin: window.location.origin },
				body: JSON.stringify({ lessonId: lesson.id }),
			});
			if (!res.ok || !res.body) return;

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			const newBlocks: unknown[] = [];

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6);
						if (data === "done" || data === "[DONE]") continue;
						try {
							const parsed = JSON.parse(data);
							if (parsed.block) {
								newBlocks.push(parsed.block);
								setBlocks([...newBlocks]);
							} else if (parsed.text) {
								// Streaming text accumulation
							}
						} catch {
							// Partial JSON, ignore
						}
					}
				}
			}
		} catch {
			// Error handled by UI
		} finally {
			setGenerating(false);
		}
	}, [lesson.id, generating]);

	// Auto-generate on mount if pending
	useEffect(() => {
		if (isPending && blocks.length === 0) {
			generateLesson();
		}
	}, [isPending]); // eslint-disable-line react-hooks/exhaustive-deps

	// Scroll progress tracking (debounced)
	useEffect(() => {
		const el = contentRef.current;
		if (!el) return;
		let timeout: ReturnType<typeof setTimeout>;

		const handleScroll = () => {
			const pct = Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100);
			setScrollPercent(Math.min(pct, 100));
			clearTimeout(timeout);
			timeout = setTimeout(() => {
				fetch(`/learning/api/progress/${lesson.id}`, {
					method: "PUT",
					headers: { "Content-Type": "application/json", Origin: window.location.origin },
					body: JSON.stringify({ scroll_percent: pct, status: pct >= 90 ? "completed" : "in_progress" }),
				}).catch(() => {});
			}, 2000);
		};

		el.addEventListener("scroll", handleScroll, { passive: true });
		return () => {
			el.removeEventListener("scroll", handleScroll);
			clearTimeout(timeout);
		};
	}, [lesson.id]);

	// Send chat message
	const sendMessage = async (text: string) => {
		if (!text.trim() || sending) return;
		setMessages((m) => [...m, { who: "YOU", text }, { who: "MINSU", text: "", typing: true }]);
		setChatInput("");
		setRefineBlock(null);
		setSending(true);

		try {
			const res = await fetch("/learning/api/ai/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json", Origin: window.location.origin },
				body: JSON.stringify({
					message: text,
					scope: "lesson",
					scopeId: lesson.id,
					context: refineBlock ? `About this ${refineBlock.kind}: "${refineBlock.text || ""}"` : undefined,
				}),
			});
			if (!res.ok || !res.body) throw new Error();

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let fullText = "";
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6);
						if (data === "done" || data === "[DONE]") continue;
						try {
							const parsed = JSON.parse(data);
							if (parsed.text) {
								fullText += parsed.text;
								setMessages((m) => {
									const next = [...m];
									next[next.length - 1] = { who: "MINSU", text: fullText };
									return next;
								});
							}
						} catch {
							// partial text delta
							fullText += data;
							setMessages((m) => {
								const next = [...m];
								next[next.length - 1] = { who: "MINSU", text: fullText };
								return next;
							});
						}
					}
				}
			}
		} catch {
			setMessages((m) => {
				const next = [...m];
				next[next.length - 1] = { who: "MINSU", text: "the oracle is silent. try again in a moment." };
				return next;
			});
		} finally {
			setSending(false);
		}
	};

	const askAbout = (block: { id: string; kind: string; text?: string }) => {
		setRefineBlock(block);
		setChatOpen(true);
	};

	const sortedLessons = [...lessons].sort(
		(a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index,
	);
	const currentIdx = sortedLessons.findIndex((l: { order_index: number }) => l.order_index === lesson.order_index);

	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: `220px 1fr ${chatOpen ? "360px" : "40px"}`,
				height: "100vh",
				background: t.bg,
				color: t.ink,
				fontFamily: "Inter, sans-serif",
			}}
		>
			{/* Left sidebar */}
			<aside style={{ borderRight: `1px solid ${t.divider}`, padding: "24px 20px", overflowY: "auto" }}>
				<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
					<span style={{ fontFamily: "Playfair Display, serif", fontSize: 18, color: t.inkStrong }}>Napat</span>
					<span className="film-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#cc0000", display: "inline-block" }} />
				</div>
				<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.25em", color: t.inkGhost, display: "block", marginBottom: 12 }}>
					COURSE
				</span>
				<div style={{ fontFamily: "Playfair Display, serif", fontSize: 20, color: t.inkStrong, lineHeight: 1.15, marginBottom: 8 }}>
					{course.title}
				</div>
				<div style={{ marginBottom: 18 }}>
					<div style={{ height: 1, background: t.divider, position: "relative" }}>
						<div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${scrollPercent}%`, background: t.accent, transition: "width .4s ease" }} />
					</div>
				</div>

				{sortedLessons.map((l: { id: string; order_index: number; title: string; status: string }) => {
					const active = l.order_index === lesson.order_index;
					const done = l.status === "ready" || l.status === "edited";
					const locked = l.status === "pending" && l.order_index > lesson.order_index;
					return (
						<div
							key={l.id}
							onClick={() => {
								if (!locked) window.location.href = `/learning/courses/${course.slug}/lessons/${l.order_index}`;
							}}
							style={{
								display: "flex",
								alignItems: "baseline",
								gap: 10,
								padding: "10px 0",
								borderLeft: active ? `1px solid ${t.accent}` : "1px solid transparent",
								paddingLeft: active ? 10 : 0,
								marginLeft: active ? -10 : 0,
								cursor: locked ? "default" : "pointer",
							}}
						>
							<span style={{ fontFamily: "Playfair Display, serif", fontSize: 14, color: locked ? t.inkGhost : t.inkMuted, width: 18 }}>
								{String(l.order_index).padStart(2, "0")}
							</span>
							<div style={{ flex: 1 }}>
								<div style={{ fontSize: 13, color: active ? t.inkStrong : locked ? t.inkGhost : t.ink, lineHeight: 1.3 }}>
									{l.title}
								</div>
								{active && (
									<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.25em", color: t.accent, marginTop: 4, display: "inline-block" }}>
										CURRENT · {scrollPercent}%
									</span>
								)}
							</div>
						</div>
					);
				})}
			</aside>

			{/* Center content */}
			<main ref={contentRef} style={{ overflowY: "auto", padding: "28px 56px 80px", position: "relative" }}>
				{/* Header */}
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
					<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.3em", color: t.inkGhost }}>
						{course.title} · LESSON {lesson.order_index} OF {lessons.length}
					</span>
					<button onClick={toggleTheme} style={{ background: "transparent", border: "none", cursor: "pointer", color: t.inkMuted }}>
						{theme === "dark" ? (
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M11 7.5A4 4 0 016.5 3c0-.5.1-1 .2-1.4A5 5 0 1012 7.3c-.3.1-.6.2-1 .2z" /></svg>
						) : (
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="7" cy="7" r="3" /><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13" /></svg>
						)}
					</button>
				</div>

				{/* Lesson title */}
				<h1 style={{ fontFamily: "Playfair Display, serif", fontSize: 52, lineHeight: 1, fontWeight: 500, letterSpacing: "-0.02em", color: t.inkStrong, margin: "0 0 8px", maxWidth: 720 }}>
					{lesson.title}<span style={{ color: t.accent }}>.</span>
				</h1>

				{/* Generating indicator */}
				{generating && blocks.length === 0 && (
					<div style={{ marginTop: 48 }}>
						<span style={{ fontFamily: "Playfair Display, serif", fontSize: 22, color: t.inkMuted, fontStyle: "italic" }}>
							composing your lesson…
						</span>
						<span className="learning-breathe" style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "#cc0000", marginLeft: 12 }} />
					</div>
				)}

				{/* Blocks */}
				<div style={{ maxWidth: 720, marginTop: 32 }}>
					{blocks.map((block: any, idx: number) => {
						const b = block.content || block;
						const blockId = block.id || `b${idx}`;
						const isHovered = hoveredBlock === blockId;

						const askBtn = (
							<button
								onClick={() => askAbout({ id: blockId, kind: b.kind, text: b.markdown || b.text || b.latex })}
								aria-label="Ask AI about this"
								style={{
									position: "absolute", right: -34, top: 16,
									width: 24, height: 24, borderRadius: "50%",
									border: `1px solid ${t.divider}`,
									background: t.bg, color: t.inkMuted,
									opacity: isHovered ? 0.7 : 0,
									transition: "opacity .25s",
									cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
								}}
								title="ask the oracle about this"
							>
								<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.2">
									<circle cx="5.5" cy="5.5" r="4" /><circle cx="5.5" cy="5.5" r="1.5" fill="currentColor" />
								</svg>
							</button>
						);

						return (
							<div
								key={blockId}
								style={{ position: "relative", padding: "14px 0" }}
								onMouseEnter={() => setHoveredBlock(blockId)}
								onMouseLeave={() => setHoveredBlock((h) => h === blockId ? null : h)}
							>
								{b.kind === "heading" && (
									<>
										{b.level === 2 ? (
											<h2 style={{ fontFamily: "Playfair Display, serif", fontSize: 30, color: t.inkStrong, fontWeight: 500, letterSpacing: "-0.015em", margin: "32px 0 8px" }}>{b.text}</h2>
										) : (
											<h3 style={{ fontFamily: "Playfair Display, serif", fontSize: 22, color: t.inkStrong, fontWeight: 500, margin: "24px 0 8px" }}>{b.text}</h3>
										)}
										{askBtn}
									</>
								)}
								{b.kind === "prose" && (
									<>
										<p style={{ fontSize: 16, lineHeight: 1.75, color: t.ink, margin: "12px 0", fontWeight: 300 }}>{b.markdown}</p>
										{askBtn}
									</>
								)}
								{b.kind === "quote" && (
									<div style={{ margin: "28px 0" }}>
										<blockquote style={{ borderLeft: `2px solid ${t.accent}`, paddingLeft: 22, margin: 0, fontFamily: "Playfair Display, serif", fontSize: 22, fontStyle: "italic", color: t.ink, lineHeight: 1.4 }}>
											{b.text}
										</blockquote>
										{b.attribution && (
											<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.2em", color: t.inkGhost, marginTop: 8, display: "block", paddingLeft: 22 }}>
												— {b.attribution}
											</span>
										)}
										{askBtn}
									</div>
								)}
								{b.kind === "code" && (
									<div style={{ margin: "28px 0" }}>
										<div style={{ background: "#0d0d0d", border: `1px solid ${t.divider}` }}>
											<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
												<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.25em", color: "rgba(255,255,255,0.3)" }}>
													{b.files?.[0]?.name || b.language || "CODE"}
												</span>
												{b.runnable && (
													<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.25em", color: "rgba(255,255,255,0.3)", cursor: "pointer" }}>
														RUN →
													</span>
												)}
											</div>
											<pre style={{ margin: 0, padding: 18, fontFamily: "JetBrains Mono, monospace", fontSize: 13, lineHeight: 1.7, color: "#c9c9c9", overflow: "auto" }}>
												{b.files?.[0]?.content || ""}
											</pre>
										</div>
										{askBtn}
									</div>
								)}
								{b.kind === "callout" && (
									<div style={{ margin: "28px 0", border: `1px solid ${t.divider}`, padding: "20px 24px", background: t.bgCard }}>
										<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.25em", color: b.variant === "warning" ? t.accent : t.inkGhost, display: "block", marginBottom: 8 }}>
											{b.variant?.toUpperCase() || "NOTE"}
										</span>
										<p style={{ fontSize: 14, lineHeight: 1.6, color: t.ink, margin: 0 }}>{b.markdown}</p>
										{askBtn}
									</div>
								)}
								{b.kind === "mermaid" && (
									<div style={{ margin: "28px 0", border: `1px solid ${t.divider}`, padding: 24, background: t.bgCard }}>
										<pre style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: t.inkMuted, whiteSpace: "pre-wrap" }}>{b.diagram}</pre>
										{b.caption && (
											<div style={{ marginTop: 16, textAlign: "center" }}>
												<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.3em", color: t.inkGhost }}>{b.caption}</span>
											</div>
										)}
										{askBtn}
									</div>
								)}
								{b.kind === "katex" && (
									<div style={{ margin: "28px 0", textAlign: b.display ? "center" : "left" }}>
										<code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 14, color: t.ink }}>{b.latex}</code>
										{askBtn}
									</div>
								)}
								{b.kind === "image" && (
									<div style={{ margin: "28px 0" }}>
										<img src={b.url} alt={b.alt} style={{ maxWidth: "100%", filter: b.treatment === "bw" ? "grayscale(100%)" : undefined }} />
										{b.caption && (
											<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.2em", color: t.inkGhost, marginTop: 8, display: "block" }}>{b.caption}</span>
										)}
										{askBtn}
									</div>
								)}
								{b.kind === "interactive" && (
									<div style={{ margin: "28px 0", border: `1px solid ${t.divider}`, overflow: "hidden" }}>
										<div style={{ padding: "10px 16px", borderBottom: `1px solid ${t.divider}` }}>
											<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.25em", color: t.inkGhost }}>INTERACTIVE · {b.framework?.toUpperCase()}</span>
										</div>
										<iframe
											srcDoc={b.code}
											sandbox="allow-scripts"
											style={{ width: "100%", height: b.height || 300, border: "none", background: "#fff" }}
											title={b.description || "Interactive component"}
										/>
										{askBtn}
									</div>
								)}
							</div>
						);
					})}
				</div>

				{/* Bottom navigation */}
				{blocks.length > 0 && (
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 56, paddingTop: 32, borderTop: `1px solid ${t.divider}`, maxWidth: 720 }}>
						{currentIdx > 0 ? (
							<button
								onClick={() => { window.location.href = `/learning/courses/${course.slug}/lessons/${sortedLessons[currentIdx - 1].order_index}`; }}
								style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.25em", background: "transparent", border: "none", color: t.inkMuted, cursor: "pointer", padding: "12px 0" }}
							>
								← PREVIOUS LESSON
							</button>
						) : <div />}
						{currentIdx < sortedLessons.length - 1 ? (
							<button
								onClick={() => { window.location.href = `/learning/courses/${course.slug}/lessons/${sortedLessons[currentIdx + 1].order_index}`; }}
								style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.25em", background: "transparent", border: `1px solid ${t.divider}`, color: t.inkMuted, cursor: "pointer", padding: "12px 22px", display: "inline-flex", alignItems: "center", gap: 10 }}
							>
								MARK COMPLETE & NEXT
								<span style={{ width: 5, height: 5, borderRadius: "50%", background: "#cc0000", opacity: 0.5 }} />
							</button>
						) : null}
					</div>
				)}
			</main>

			{/* Right chat panel */}
			{!chatOpen ? (
				<aside
					onClick={() => setChatOpen(true)}
					style={{
						borderLeft: `1px solid ${t.divider}`,
						cursor: "pointer",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						flexDirection: "column",
						gap: 10,
						background: t.bg,
					}}
				>
					<span style={{ width: 5, height: 5, borderRadius: "50%", background: "#cc0000", display: "inline-block" }} />
					<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.3em", color: t.inkGhost, writingMode: "vertical-rl" }}>
						MINSU
					</span>
				</aside>
			) : (
				<aside style={{ borderLeft: `1px solid ${t.divider}`, display: "flex", flexDirection: "column", background: t.bg }}>
					{/* Chat header */}
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px", borderBottom: `1px solid ${t.divider}` }}>
						<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
							<span style={{ width: 5, height: 5, borderRadius: "50%", background: "#cc0000", display: "inline-block" }} />
							<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.3em", color: t.ink }}>MINSU</span>
							<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.25em", color: t.inkGhost, marginLeft: 8 }}>SONNET</span>
						</div>
						<button onClick={() => setChatOpen(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: t.inkMuted, fontSize: 16 }}>×</button>
					</div>

					{/* Messages */}
					<div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>
						{messages.map((m, i) => (
							<div key={i} style={{ marginBottom: 18, textAlign: m.who === "YOU" ? "right" : "left" }}>
								<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.25em", color: t.inkGhost, display: "block", marginBottom: 6 }}>
									{m.who}
								</span>
								{m.typing ? (
									<span style={{ fontFamily: "Playfair Display, serif", fontSize: 22, color: t.inkMuted, letterSpacing: 2 }}>…</span>
								) : (
									<div style={{ display: "inline-block", maxWidth: "92%", fontSize: 14, lineHeight: 1.6, color: t.ink, textAlign: "left" }}>
										{m.text}
									</div>
								)}
							</div>
						))}
					</div>

					{/* Input */}
					<div style={{ borderTop: `1px solid ${t.divider}`, padding: "14px 20px 16px" }}>
						{refineBlock && (
							<div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", marginBottom: 10, borderLeft: `2px solid ${t.accent}`, background: t.bgCard }}>
								<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.25em", color: t.inkGhost }}>
									ABOUT THIS {refineBlock.kind.toUpperCase()}
								</span>
								<button onClick={() => setRefineBlock(null)} style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", color: t.inkGhost }}>×</button>
							</div>
						)}
						<div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
							<textarea
								value={chatInput}
								onChange={(e) => setChatInput(e.target.value)}
								onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput); } }}
								placeholder="ask, or try 'rewrite this as a cooking analogy'…"
								rows={2}
								style={{
									flex: 1, border: "none", outline: "none", resize: "none",
									background: "transparent", color: t.ink,
									fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.5,
								}}
							/>
							<button
								onClick={() => sendMessage(chatInput)}
								disabled={sending || !chatInput.trim()}
								style={{
									background: "transparent", border: `1px solid ${t.divider}`,
									padding: "6px 10px", cursor: sending ? "wait" : "pointer",
									color: t.inkMuted, fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.25em",
								}}
							>
								SEND ↵
							</button>
						</div>
					</div>
				</aside>
			)}
		</div>
	);
}
