/**
 * Lesson reader — three-pane layout: sidebar, content, chat.
 * Streams AI content for pending lessons, renders blocks for ready ones.
 * Includes Socratic Active Recall checkpoint before navigation.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import type { Route } from "./+types/learning.courses.$slug.lessons.$lesson";
import { useTheme } from "./learning";
import { createServiceClient } from "~/lib/supabase.server";
import { Chip, Rule, Tracked } from "~/components/learning/primitives";

// ── Deep-dive types ───────────────────────────────────────

interface DeepDiveEntry {
	term: string;
	context: string;
	blocks: unknown[];
	loading: boolean;
	depth: number;
	collapsed: boolean;
	/** Nested deep dives keyed by term */
	children: Map<string, DeepDiveEntry>;
}

const MAX_DEEP_DIVE_DEPTH = 3;

/** Lightweight markdown-to-HTML converter for prose blocks */
function md(text: string): string {
	return text
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/\*(.+?)\*/g, '<em>$1</em>')
		.replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.06);padding:2px 5px;border-radius:2px;font-family:JetBrains Mono,monospace;font-size:0.9em">$1</code>')
		.replace(/^### (.+)$/gm, '<h3>$1</h3>')
		.replace(/^## (.+)$/gm, '<h2>$1</h2>')
		.replace(/^- (.+)$/gm, '<li>$1</li>')
		.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
		// Parse markdown tables
		.replace(/((?:^\|.+\|$\n?)+)/gm, (tableBlock) => {
			const rows = tableBlock.trim().split('\n').filter(r => r.trim());
			if (rows.length < 2) return tableBlock;
			const isSep = (r: string) => /^\|[\s\-:|]+\|$/.test(r.trim());
			const parseRow = (r: string, tag: string) => {
				const cells = r.split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(c => c.trim());
				return '<tr>' + cells.map(c => `<${tag} style="border:1px solid rgba(0,0,0,0.12);padding:8px 12px;text-align:left">${c}</${tag}>`).join('') + '</tr>';
			};
			let html = '<table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:14px">';
			let headerDone = false;
			for (const row of rows) {
				if (isSep(row)) { headerDone = true; continue; }
				html += parseRow(row, !headerDone ? 'th' : 'td');
			}
			return html + '</table>';
		})
		.replace(/\n\n/g, '</p><p>')
		.replace(/\n/g, '<br/>');
}

/** Border colors per depth level — progressively lighter accent */
const DEPTH_BORDER_COLORS = [
	"#cc0000",       // depth 1
	"#cc000099",     // depth 2
	"#cc000055",     // depth 3
];

export function meta({ data }: Route.MetaArgs) {
	return [{ title: `Napat · Learning · ${data?.lesson?.title ?? "Lesson"}` }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	const supabase = createServiceClient(env);

	// Get course — decode URI for Thai slugs
	const slug = decodeURIComponent(params.slug || "");
	const { data: course } = await supabase
		.from("courses")
		.select("id, slug, title, subtitle, cover_monogram, lessons(id, order_index, title, status, generated_by_model)")
		.eq("slug", slug)
		.single();

	if (!course) {
		// Might happen during race condition after generation — redirect to course list
		return new Response(null, { status: 302, headers: { Location: "/learning" } });
	}

	const lessonIndex = parseInt(params.lesson, 10);
	const lessons = (course.lessons || []).sort(
		(a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index,
	);
	const lesson = lessons.find((l: { order_index: number }) => l.order_index === lessonIndex);
	if (!lesson) {
		return new Response(null, { status: 302, headers: { Location: `/learning/courses/${slug}` } });
	}

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

	// Mobile responsiveness
	const [isMobile, setIsMobile] = useState(false);
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [mobileChatOpen, setMobileChatOpen] = useState(false);
	useEffect(() => {
		const check = () => setIsMobile(window.innerWidth < 768);
		check();
		window.addEventListener("resize", check);
		return () => window.removeEventListener("resize", check);
	}, []);
	const [chatInput, setChatInput] = useState("");
	const [messages, setMessages] = useState<{ who: string; text: string; typing?: boolean }[]>([
		{ who: "MINSU", text: "we are here. ask anything, anytime." },
	]);
	const [sending, setSending] = useState(false);
	const [hoveredBlock, setHoveredBlock] = useState<string | null>(null);
	const [refineBlock, setRefineBlock] = useState<{ id: string; kind: string; text?: string } | null>(null);
	const [generating, setGenerating] = useState(false);
	const [genProgress, setGenProgress] = useState(0);
	const [genStage, setGenStage] = useState("");

	// Translation state
	const [activeLang, setActiveLang] = useState<"original" | "en" | "th">("original");
	const [translatedBlocks, setTranslatedBlocks] = useState<unknown[]>([]);
	const [translating, setTranslating] = useState(false);
	const translateCacheRef = useRef<Record<string, unknown[]>>({});
	const [scrollPercent, setScrollPercent] = useState(progress?.scroll_percent ?? 0);
	const contentRef = useRef<HTMLDivElement>(null);

	// Personal notes state
	const [notes, setNotes] = useState<{ id: string; lesson_id: string; block_index: number | null; content: string; color: string }[]>([]);
	const [noteEditing, setNoteEditing] = useState<{ blockIndex: number; content: string; color: string; noteId?: string } | null>(null);

	// Highlight-to-translate state
	const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
	const [selectionTranslation, setSelectionTranslation] = useState<string>("");
	const [selectionTranslating, setSelectionTranslating] = useState(false);

	// Perspective switching state
	const [activePerspective, setActivePerspective] = useState<"default" | "evolutionary" | "neuro" | "philosopher" | "architect">("default");
	const [perspectiveBlocks, setPerspectiveBlocks] = useState<unknown[]>([]);
	const [perspectiveLoading, setPerspectiveLoading] = useState(false);
	const [perspectiveProgress, setPerspectiveProgress] = useState(0);
	const [perspectiveStage, setPerspectiveStage] = useState("");
	const perspectiveCacheRef = useRef<Record<string, unknown[]>>({});

	// Deep-dive (hyper-node) state — keyed by block index, then by term
	const [deepDives, setDeepDives] = useState<Map<string, DeepDiveEntry>>(new Map());

	// Recall checkpoint state
	const [recallActive, setRecallActive] = useState(false);
	const [recallMessages, setRecallMessages] = useState<{ role: string; content: string }[]>([]);
	const [recallConfirmed, setRecallConfirmed] = useState(progress?.recall_status === "confirmed");
	const [recallStreaming, setRecallStreaming] = useState(false);
	const [recallInput, setRecallInput] = useState("");
	const [recallThreadId, setRecallThreadId] = useState<string | null>(null);
	const recallEndRef = useRef<HTMLDivElement>(null);

	const isPending = lesson.status === "pending";

	// Model selection for lesson generation
	const [lessonModel, setLessonModel] = useState(lesson.generated_by_model || "auto");
	const [lessonModelPickerOpen, setLessonModelPickerOpen] = useState(false);
	const [mermaidPopup, setMermaidPopup] = useState<string | null>(null); // mermaid code for popup
	const LESSON_MODELS = [
		{ id: "auto", label: "AUTO", desc: "ระบบเลือกให้", badge: "RECOMMENDED" },
		{ id: "google/gemini-2.5-pro-preview-06-05", label: "GEMINI PRO", desc: "เก่งสุด · ไทยดี", badge: "BEST" },
		{ id: "google/gemini-2.5-flash-preview-05-20", label: "GEMINI FLASH", desc: "เร็ว · ดี", badge: "FAST" },
		{ id: "anthropic/claude-sonnet-4-6", label: "CLAUDE SONNET", desc: "เก่งภาษา", badge: "PREMIUM" },
		{ id: "google/gemma-4-31b-it:free", label: "GEMMA 31B", desc: "ฟรี", badge: "FREE" },
	];

	// Inject hyper-node CSS styles
	useEffect(() => {
		if (typeof document === "undefined") return;
		const id = "hyper-node-styles";
		if (document.getElementById(id)) return;
		const style = document.createElement("style");
		style.id = id;
		style.textContent = `
hyper {
	text-decoration: underline dotted;
	text-decoration-color: rgba(204, 0, 0, 0.4);
	text-underline-offset: 3px;
	cursor: pointer;
	transition: color 0.2s, text-decoration-color 0.2s;
}
hyper:hover {
	color: #cc0000;
	text-decoration-color: #cc0000;
}
`;
		document.head.appendChild(style);
	}, []);

	// Load personal notes on mount
	useEffect(() => {
		fetch(`/learning/api/notes?lessonId=${lesson.id}`)
			.then(r => r.json())
			.then(data => { if (data.notes) setNotes(data.notes); })
			.catch(() => {});
	}, [lesson.id]);

	// Generate lesson content if pending
	const generateLesson = useCallback(async () => {
		if (generating) return;
		setGenerating(true);
		setGenProgress(0);
		setGenStage("connecting to AI…");
		try {
			const res = await fetch("/learning/api/ai/generate-lesson", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ lessonId: lesson.id, model: lessonModel !== "auto" ? lessonModel : (lesson.generated_by_model || undefined) }),
			});
			if (!res.ok || !res.body) {
				setGenStage("failed to connect");
				setGenerating(false);
				return;
			}

			setGenStage("generating content…");
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let sseBuffer = "";
			let fullText = "";
			let hasError = false;

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				sseBuffer += decoder.decode(value, { stream: true });

				const messages = sseBuffer.split("\n\n");
				sseBuffer = messages.pop() || "";

				for (const msg of messages) {
					const lines = msg.split("\n");
					let eventType = "";
					const dataLines: string[] = [];
					for (const line of lines) {
						if (line.startsWith("event: ")) eventType = line.slice(7);
						else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
					}
					const data = dataLines.join("\n");
					if (eventType === "error") {
						hasError = true;
						setGenStage("error during generation");
						continue;
					}
					if (eventType === "end") continue;
					if (data) {
						fullText += data;
						setGenProgress(fullText.length);
						// Update stage based on content size
						if (fullText.length < 500) setGenStage("building concept map…");
						else if (fullText.length < 2000) setGenStage("writing explanations…");
						else if (fullText.length < 5000) setGenStage("adding examples & diagrams…");
						else if (fullText.length < 8000) setGenStage("refining content…");
						else setGenStage("finalizing lesson…");
					}
				}
			}

			if (!hasError) {
				setGenStage("saving to library…");
				// Wait for DB writes to settle, then navigate (not reload) to avoid race condition
				await new Promise((r) => setTimeout(r, 1500));
				setGenStage("loading content…");
				// Use navigate to re-fetch loader data instead of full page reload
				window.location.href = window.location.href;
				return;
			}
		} catch {
			setGenStage("connection lost — try refreshing");
		} finally {
			setGenerating(false);
		}
	}, [lesson.id, generating]);

	// Fetch perspective-shifted lesson content
	const fetchPerspective = useCallback(async (perspective: "evolutionary" | "neuro" | "philosopher") => {
		// Return cached if available
		if (perspectiveCacheRef.current[perspective]?.length) {
			setPerspectiveBlocks(perspectiveCacheRef.current[perspective]);
			return;
		}

		setPerspectiveLoading(true);
		setPerspectiveBlocks([]);
		setPerspectiveProgress(0);
		setPerspectiveStage("connecting…");
		try {
			const res = await fetch("/learning/api/ai/perspective-lesson", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ lessonId: lesson.id, perspective }),
			});
			if (!res.ok || !res.body) {
				setPerspectiveStage("failed to connect");
				setPerspectiveLoading(false);
				return;
			}

			setPerspectiveStage("rewriting through this lens…");
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let sseBuffer = "";
			let fullText = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				sseBuffer += decoder.decode(value, { stream: true });

				const messages = sseBuffer.split("\n\n");
				sseBuffer = messages.pop() || "";

				for (const msg of messages) {
					const lines = msg.split("\n");
					let eventType = "";
					const dataLines: string[] = [];
					for (const line of lines) {
						if (line.startsWith("event: ")) eventType = line.slice(7);
						else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
					}
					const data = dataLines.join("\n");
					if (eventType === "end" || eventType === "error") continue;
					if (data) {
						fullText += data;
						setPerspectiveProgress(fullText.length);
						if (fullText.length < 500) setPerspectiveStage("building new concept map…");
						else if (fullText.length < 2000) setPerspectiveStage("reframing explanations…");
						else if (fullText.length < 5000) setPerspectiveStage("adding perspective diagrams…");
						else setPerspectiveStage("finalizing rewrite…");
					}
				}
			}

			setPerspectiveStage("rendering…");
			try {
				let jsonStr = fullText.trim();
				const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
				if (fenceMatch) jsonStr = fenceMatch[1].trim();
				const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
				const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : jsonStr);
				const arr = Array.isArray(parsed) ? parsed : [];
				const newBlocks = arr.map((b: any) => ({ content: b }));
				setPerspectiveBlocks(newBlocks);
				perspectiveCacheRef.current[perspective] = newBlocks;
			} catch {
				setPerspectiveBlocks([]);
				setPerspectiveStage("failed to parse — try again");
			}
		} catch {
			setPerspectiveStage("connection lost");
		} finally {
			setPerspectiveLoading(false);
		}
	}, [lesson.id]);

	// Handle perspective chip click
	const handlePerspectiveChange = useCallback((perspective: "default" | "evolutionary" | "neuro" | "philosopher" | "architect") => {
		setActivePerspective(perspective);
		setActiveLang("original");
		setTranslatedBlocks([]);
		translateCacheRef.current = {};
		if (perspective !== "default") {
			fetchPerspective(perspective);
		}
	}, [fetchPerspective]);

	// Translate blocks
	const [translateError, setTranslateError] = useState("");
	const handleTranslate = useCallback(async (lang: "en" | "th" | "original") => {
		setActiveLang(lang);
		setTranslateError("");
		if (lang === "original") {
			setTranslatedBlocks([]);
			return;
		}
		// Return cached
		if (translateCacheRef.current[lang]?.length) {
			setTranslatedBlocks(translateCacheRef.current[lang]);
			return;
		}
		setTranslating(true);
		try {
			// Get current visible blocks — only send translatable ones (prose, heading, callout, quote)
			const sourceBlocks = activePerspective === "default" ? blocks : perspectiveBlocks;
			const currentBlocks = sourceBlocks.map((b: any) => b.content || b);

			const res = await fetch("/learning/api/ai/translate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ blocks: currentBlocks, targetLang: lang }),
			});

			const data = await res.json();

			if (!res.ok) {
				setTranslateError(data.message || "translation failed");
				// Don't reset — keep TH selected so user sees error
				setTranslating(false);
				return;
			}

			if (data.blocks && Array.isArray(data.blocks) && data.blocks.length > 0) {
				const mapped = data.blocks.map((b: any) => ({ content: b }));
				setTranslatedBlocks(mapped);
				translateCacheRef.current[lang] = mapped;
			} else {
				setTranslateError("no translated content returned");
			}
		} catch (err) {
			setTranslateError((err as Error).message || "connection error");
		} finally {
			setTranslating(false);
		}
	}, [blocks, perspectiveBlocks, activePerspective]);

	// No auto-generate — user picks model first via the model picker UI

	// Scroll progress tracking (debounced)
	useEffect(() => {
		const el = contentRef.current;
		if (!el) return;
		let timeout: ReturnType<typeof setTimeout>;

		const handleScroll = () => {
			const pct = Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100);
			setScrollPercent(Math.min(pct, 100));

			// Activate recall checkpoint at 90% scroll
			if (pct >= 90 && blocks.length > 0 && !recallActive && !recallConfirmed) {
				setRecallActive(true);
			}

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
	}, [lesson.id, blocks.length, recallActive, recallConfirmed]);

	// Auto-scroll recall messages
	useEffect(() => {
		recallEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [recallMessages]);

	// Start recall: send initial empty message to get AI's opening question
	const startRecall = useCallback(async () => {
		if (recallStreaming || recallMessages.length > 0) return;
		setRecallActive(true);
		setRecallStreaming(true);

		try {
			const res = await fetch("/learning/api/ai/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json", Origin: window.location.origin },
				body: JSON.stringify({
					message: "I just finished this lesson. I'm ready for the recall checkpoint.",
					scope: "recall",
					scopeId: lesson.id,
				}),
			});
			if (!res.ok) {
				const errBody = await res.json().catch(() => ({ message: "connection failed" }));
				setRecallMessages([
					{ role: "user", content: "I just finished this lesson. I'm ready for the recall checkpoint." },
					{ role: "assistant", content: errBody.message || "connection failed — click retry" },
				]);
				setRecallStreaming(false);
				return;
			}

			const reader = res.body!.getReader();
			const decoder = new TextDecoder();
			let fullText = "";
			let buffer = "";
			let threadId = recallThreadId;

			// Add user message and placeholder
			setRecallMessages([
				{ role: "user", content: "I just finished this lesson. I'm ready for the recall checkpoint." },
				{ role: "assistant", content: "" },
			]);

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				const sseMessages = buffer.split("\n\n");
				buffer = sseMessages.pop() || "";

				for (const msg of sseMessages) {
					const lines = msg.split("\n");
					let eventType = "";
					const dataLines: string[] = [];
					for (const line of lines) {
						if (line.startsWith("event: ")) eventType = line.slice(7);
						else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
					}
					const data = dataLines.join("\n");
					if (eventType === "end") continue;
					if (eventType === "error") {
						let errMsg = "something went wrong — try again";
						try { errMsg = JSON.parse(data).message || errMsg; } catch {}
						setRecallMessages((m) => {
							const next = [...m];
							next[next.length - 1] = { role: "assistant", content: errMsg };
							return next;
						});
						setRecallStreaming(false);
						return;
					}
					if (eventType === "meta") {
						try {
							const parsed = JSON.parse(data);
							if (parsed.threadId && !threadId) {
								threadId = parsed.threadId;
								setRecallThreadId(parsed.threadId);
							}
						} catch {}
						continue;
					}
					if (data) {
						fullText += data;
						setRecallMessages((m) => {
							const next = [...m];
							next[next.length - 1] = { role: "assistant", content: fullText };
							return next;
						});
					}
				}
			}

			// Check for confirmation
			if (fullText.includes("[UNDERSTANDING_CONFIRMED]")) {
				handleRecallConfirmed();
			}
		} catch {
			setRecallMessages((m) => {
				const next = [...m];
				next[next.length - 1] = { role: "assistant", content: "something went wrong. try again in a moment." };
				return next;
			});
		} finally {
			setRecallStreaming(false);
		}
	}, [lesson.id, recallStreaming, recallMessages.length, recallThreadId]);

	// Auto-start recall when activated
	useEffect(() => {
		if (recallActive && recallMessages.length === 0 && !recallConfirmed) {
			startRecall();
		}
	}, [recallActive]); // eslint-disable-line react-hooks/exhaustive-deps

	// Send recall message
	const sendRecallMessage = async (text: string) => {
		if (!text.trim() || recallStreaming) return;
		setRecallInput("");
		setRecallStreaming(true);

		const userMsg = { role: "user", content: text };
		const assistantPlaceholder = { role: "assistant", content: "" };
		setRecallMessages((m) => [...m, userMsg, assistantPlaceholder]);

		try {
			const res = await fetch("/learning/api/ai/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					message: text,
					scope: "recall",
					scopeId: lesson.id,
					threadId: recallThreadId,
				}),
			});
			if (!res.ok) {
				const errBody = await res.json().catch(() => ({ message: "connection failed" }));
				setRecallMessages((m) => {
					const next = [...m];
					next[next.length - 1] = { role: "assistant", content: errBody.message || "connection failed — click retry" };
					return next;
				});
				setRecallStreaming(false);
				return;
			}

			const reader = res.body!.getReader();
			const decoder = new TextDecoder();
			let fullText = "";
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				const sseMessages = buffer.split("\n\n");
				buffer = sseMessages.pop() || "";

				for (const msg of sseMessages) {
					const lines = msg.split("\n");
					let eventType = "";
					const dataLines: string[] = [];
					for (const line of lines) {
						if (line.startsWith("event: ")) eventType = line.slice(7);
						else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
					}
					const data = dataLines.join("\n");
					if (eventType === "end") continue;
					if (eventType === "error") {
						let errMsg = "something went wrong — try again";
						try { errMsg = JSON.parse(data).message || errMsg; } catch {}
						setRecallMessages((m) => {
							const next = [...m];
							next[next.length - 1] = { role: "assistant", content: errMsg };
							return next;
						});
						setRecallStreaming(false);
						return;
					}
					if (eventType === "meta") {
						try {
							const parsed = JSON.parse(data);
							if (parsed.threadId && !recallThreadId) {
								setRecallThreadId(parsed.threadId);
							}
						} catch {}
						continue;
					}
					if (data) {
						fullText += data;
						setRecallMessages((m) => {
							const next = [...m];
							next[next.length - 1] = { role: "assistant", content: fullText };
							return next;
						});
					}
				}
			}

			if (fullText.includes("[UNDERSTANDING_CONFIRMED]")) {
				handleRecallConfirmed();
			}
		} catch {
			setRecallMessages((m) => {
				const next = [...m];
				next[next.length - 1] = { role: "assistant", content: "something went wrong. try again in a moment." };
				return next;
			});
		} finally {
			setRecallStreaming(false);
		}
	};

	// Handle recall confirmed
	const handleRecallConfirmed = () => {
		setRecallConfirmed(true);
		// Update progress
		fetch(`/learning/api/progress/${lesson.id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json", Origin: window.location.origin },
			body: JSON.stringify({ status: "completed", recall_status: "confirmed" }),
		}).catch(() => {});
	};

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

				const sseMessages = buffer.split("\n\n");
				buffer = sseMessages.pop() || "";

				for (const msg of sseMessages) {
					const lines = msg.split("\n");
					let eventType = "";
					const dataLines: string[] = [];
					for (const line of lines) {
						if (line.startsWith("event: ")) eventType = line.slice(7);
						else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
					}
					const data = dataLines.join("\n");
					if (eventType === "end" || eventType === "error") continue;
					if (eventType === "meta") continue;
					if (data) {
						fullText += data;
						setMessages((m) => {
							const next = [...m];
							next[next.length - 1] = { who: "MINSU", text: fullText };
							return next;
						});
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

	// ── Deep-dive fetch ───────────────────────────────────────

	const fetchDeepDive = useCallback(async (
		term: string,
		context: string,
		depth: number,
		parentPath: string[],
	) => {
		if (depth > MAX_DEEP_DIVE_DEPTH) return;

		const updateAtPath = (
			prev: Map<string, DeepDiveEntry>,
			path: string[],
			updater: (e: DeepDiveEntry) => DeepDiveEntry,
		): Map<string, DeepDiveEntry> => {
			const next = new Map(prev);
			if (path.length === 1) {
				const existing = next.get(path[0]);
				if (existing) next.set(path[0], updater(existing));
				return next;
			}
			const root = next.get(path[0]);
			if (!root) return next;
			const recurse = (entry: DeepDiveEntry, rem: string[]): DeepDiveEntry => {
				if (rem.length === 1) {
					const child = entry.children.get(rem[0]);
					if (!child) return entry;
					const nc = new Map(entry.children);
					nc.set(rem[0], updater(child));
					return { ...entry, children: nc };
				}
				const child = entry.children.get(rem[0]);
				if (!child) return entry;
				const nc = new Map(entry.children);
				nc.set(rem[0], recurse(child, rem.slice(1)));
				return { ...entry, children: nc };
			};
			next.set(path[0], recurse(root, path.slice(1)));
			return next;
		};

		const fullPath = [...parentPath, term];

		// Create or toggle
		setDeepDives((prev) => {
			if (parentPath.length === 0) {
				const next = new Map(prev);
				const existing = next.get(term);
				if (existing && existing.blocks.length > 0) {
					next.set(term, { ...existing, collapsed: !existing.collapsed });
					return next;
				}
				next.set(term, { term, context, blocks: [], loading: true, depth, collapsed: false, children: new Map() });
				return next;
			}
			return updateAtPath(prev, parentPath, (parent) => {
				const existing = parent.children.get(term);
				if (existing && existing.blocks.length > 0) {
					const nc = new Map(parent.children);
					nc.set(term, { ...existing, collapsed: !existing.collapsed });
					return { ...parent, children: nc };
				}
				const nc = new Map(parent.children);
				nc.set(term, { term, context, blocks: [], loading: true, depth, collapsed: false, children: new Map() });
				return { ...parent, children: nc };
			});
		});

		// Check if already fetched
		let alreadyFetched = false;
		setDeepDives((prev) => {
			let current: DeepDiveEntry | undefined = prev.get(fullPath[0]);
			for (let i = 1; i < fullPath.length && current; i++) current = current.children.get(fullPath[i]);
			const entry = fullPath.length === 1 ? prev.get(fullPath[0]) : current;
			if (entry && entry.blocks.length > 0) alreadyFetched = true;
			return prev;
		});
		if (alreadyFetched) return;

		try {
			const res = await fetch("/learning/api/ai/deep-dive", {
				method: "POST",
				headers: { "Content-Type": "application/json", Origin: window.location.origin },
				body: JSON.stringify({ term, context, lessonTitle: lesson.title, courseTitle: course.title, depth }),
			});
			if (!res.ok || !res.body) {
				setDeepDives((prev) => updateAtPath(prev, fullPath, (e) => ({ ...e, loading: false })));
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buf = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buf += decoder.decode(value, { stream: true });
				const sseMessages = buf.split("\n\n");
				buf = sseMessages.pop() || "";
				for (const msg of sseMessages) {
					const lines = msg.split("\n");
					let eventType = "";
					const dataLines: string[] = [];
					for (const line of lines) {
						if (line.startsWith("event: ")) eventType = line.slice(7);
						else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
					}
					const data = dataLines.join("\n");
					if (eventType === "end" || eventType === "error") continue;
					if (eventType === "result" && data) {
						try {
							const parsed = JSON.parse(data);
							if (parsed.blocks) {
								const resultBlocks = parsed.blocks.map((b: unknown, i: number) => ({ content: b, id: `dd-${term}-${i}` }));
								setDeepDives((prev) => updateAtPath(prev, fullPath, (e) => ({ ...e, blocks: resultBlocks, loading: false })));
							}
						} catch { /* parse error */ }
					}
				}
			}
			setDeepDives((prev) => updateAtPath(prev, fullPath, (e) => (e.loading ? { ...e, loading: false } : e)));
		} catch {
			setDeepDives((prev) => {
				const updateAtPathLocal = updateAtPath;
				return updateAtPathLocal(prev, fullPath, (e) => ({ ...e, loading: false }));
			});
		}
	}, [lesson.title, course.title]);

	const removeDeepDive = useCallback((term: string, parentPath: string[]) => {
		setDeepDives((prev) => {
			if (parentPath.length === 0) {
				const next = new Map(prev);
				next.delete(term);
				return next;
			}
			const next = new Map(prev);
			const root = next.get(parentPath[0]);
			if (!root) return next;
			const removeNested = (entry: DeepDiveEntry, rem: string[]): DeepDiveEntry => {
				if (rem.length === 0) {
					const nc = new Map(entry.children);
					nc.delete(term);
					return { ...entry, children: nc };
				}
				const child = entry.children.get(rem[0]);
				if (!child) return entry;
				const nc = new Map(entry.children);
				nc.set(rem[0], removeNested(child, rem.slice(1)));
				return { ...entry, children: nc };
			};
			next.set(parentPath[0], removeNested(root, parentPath.slice(1)));
			return next;
		});
	}, []);

	/** Close all deep-dives starting from a given depth in a path.
	 *  E.g. clicking breadcrumb at depth 1 closes depth-2+ children. */
	const closeDeepDivesFromPath = useCallback((path: string[], keepUpTo: number) => {
		// keepUpTo = number of path segments to keep (0 = close all, 1 = keep first, etc.)
		if (keepUpTo === 0) {
			// Close everything — clear all top-level deep dives
			setDeepDives(new Map());
			return;
		}

		// We need to remove children from the entry at path[keepUpTo - 1]
		setDeepDives((prev) => {
			const next = new Map(prev);
			if (keepUpTo >= path.length) return next;

			// Navigate to the entry at keepUpTo-1 and clear its children
			const rootTerm = path[0];
			const root = next.get(rootTerm);
			if (!root) return next;

			if (keepUpTo === 1) {
				// Clear root's children
				next.set(rootTerm, { ...root, children: new Map() });
				return next;
			}

			// Recurse to depth keepUpTo-1 and clear children there
			const clearChildrenAt = (entry: DeepDiveEntry, segments: string[], depth: number): DeepDiveEntry => {
				if (depth === keepUpTo - 1) {
					return { ...entry, children: new Map() };
				}
				const childTerm = segments[depth + 1];
				const child = entry.children.get(childTerm);
				if (!child) return entry;
				const nc = new Map(entry.children);
				nc.set(childTerm, clearChildrenAt(child, segments, depth + 1));
				return { ...entry, children: nc };
			};

			next.set(rootTerm, clearChildrenAt(root, path, 0));
			return next;
		});
	}, []);

	// ── Render a deep-dive section recursively ────────────────

	const renderDeepDiveSection = (
		entry: DeepDiveEntry,
		parentPath: string[],
	): React.ReactNode => {
		const currentPath = [...parentPath, entry.term];
		const depthIdx = Math.min(entry.depth - 1, DEPTH_BORDER_COLORS.length - 1);
		const borderColor = DEPTH_BORDER_COLORS[depthIdx];
		const atMaxDepth = entry.depth >= MAX_DEEP_DIVE_DEPTH;

		return (
			<div
				key={`dive-${currentPath.join("-")}`}
				style={{
					marginTop: 16,
					marginBottom: 16,
					marginLeft: isMobile ? 0 : 4,
					paddingLeft: isMobile ? 12 : 20,
					borderLeft: `2px solid ${borderColor}`,
					transition: "all .3s ease",
				}}
			>
				{/* Header */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						marginBottom: entry.collapsed ? 0 : 16,
						cursor: "pointer",
					}}
					onClick={() => {
						setDeepDives((prev) => {
							const updateAtPath = (
								p: Map<string, DeepDiveEntry>,
								path: string[],
								updater: (e: DeepDiveEntry) => DeepDiveEntry,
							): Map<string, DeepDiveEntry> => {
								const n = new Map(p);
								if (path.length === 1) {
									const ex = n.get(path[0]);
									if (ex) n.set(path[0], updater(ex));
									return n;
								}
								const r = n.get(path[0]);
								if (!r) return n;
								const rec = (e: DeepDiveEntry, rem: string[]): DeepDiveEntry => {
									if (rem.length === 1) {
										const c = e.children.get(rem[0]);
										if (!c) return e;
										const nc = new Map(e.children);
										nc.set(rem[0], updater(c));
										return { ...e, children: nc };
									}
									const c = e.children.get(rem[0]);
									if (!c) return e;
									const nc = new Map(e.children);
									nc.set(rem[0], rec(c, rem.slice(1)));
									return { ...e, children: nc };
								};
								n.set(path[0], rec(r, path.slice(1)));
								return n;
							};
							return updateAtPath(prev, currentPath, (e) => ({ ...e, collapsed: !e.collapsed }));
						});
					}}
				>
					<span style={{
						fontFamily: "JetBrains Mono, monospace",
						fontSize: 9,
						textTransform: "uppercase",
						letterSpacing: "0.3em",
						color: borderColor,
					}}>
						DEEP DIVE · L{entry.depth}
					</span>
					<span style={{
						fontFamily: "Playfair Display, serif",
						fontSize: 16,
						fontWeight: 500,
						color: t.inkStrong,
					}}>
						{entry.term}
					</span>
					<span style={{
						fontFamily: "JetBrains Mono, monospace",
						fontSize: 10,
						color: t.inkGhost,
						marginLeft: "auto",
					}}>
						{entry.collapsed ? "+" : "-"}
					</span>
					<button
						onClick={(e) => {
							e.stopPropagation();
							removeDeepDive(entry.term, parentPath);
						}}
						style={{
							background: "transparent",
							border: "none",
							cursor: "pointer",
							color: t.inkGhost,
							fontSize: 14,
							padding: "0 4px",
							lineHeight: 1,
						}}
						aria-label={`Close deep dive: ${entry.term}`}
					>
						×
					</button>
				</div>

				{/* Breadcrumb path */}
				{!entry.collapsed && (
					<div style={{
						display: "flex",
						alignItems: "center",
						flexWrap: isMobile ? "nowrap" : "wrap",
						gap: 0,
						paddingBottom: 10,
						marginBottom: 12,
						borderBottom: `1px solid ${t.divider}`,
						...(isMobile ? { overflow: "hidden" } : {}),
					}}>
						{/* Lesson root */}
						<span
							onClick={(e) => {
								e.stopPropagation();
								closeDeepDivesFromPath(currentPath, 0);
							}}
							style={{
								fontFamily: "JetBrains Mono, monospace",
								fontSize: 10,
								textTransform: "uppercase",
								letterSpacing: "0.2em",
								color: t.inkGhost,
								cursor: "pointer",
								transition: "color 0.2s",
								...(isMobile ? { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: 100, flexShrink: 0 } : {}),
							}}
							onMouseEnter={(e) => { (e.target as HTMLElement).style.color = t.inkMuted; }}
							onMouseLeave={(e) => { (e.target as HTMLElement).style.color = t.inkGhost; }}
						>
							{lesson.title}
						</span>

						{/* Intermediate ancestors */}
						{parentPath.map((ancestorTerm, i) => (
							<span key={`bc-${i}`} style={{ display: "inline-flex", alignItems: "center" }}>
								<span style={{
									fontFamily: "JetBrains Mono, monospace",
									fontSize: 10,
									color: t.inkGhost,
									margin: "0 6px",
									userSelect: "none",
								}}>
									{"\u2192"}
								</span>
								<span
									onClick={(e) => {
										e.stopPropagation();
										closeDeepDivesFromPath(currentPath, i + 1);
									}}
									style={{
										fontFamily: "JetBrains Mono, monospace",
										fontSize: 10,
										textTransform: "uppercase",
										letterSpacing: "0.2em",
										color: t.inkGhost,
										cursor: "pointer",
										transition: "color 0.2s",
									}}
									onMouseEnter={(e) => { (e.target as HTMLElement).style.color = t.inkMuted; }}
									onMouseLeave={(e) => { (e.target as HTMLElement).style.color = t.inkGhost; }}
								>
									{ancestorTerm}
								</span>
							</span>
						))}

						{/* Current term (active, not clickable) */}
						<span style={{ display: "inline-flex", alignItems: "center" }}>
							<span style={{
								fontFamily: "JetBrains Mono, monospace",
								fontSize: 10,
								color: t.inkGhost,
								margin: "0 6px",
								userSelect: "none",
							}}>
								{"\u2192"}
							</span>
							<span style={{
								fontFamily: "JetBrains Mono, monospace",
								fontSize: 10,
								textTransform: "uppercase",
								letterSpacing: "0.2em",
								color: "#cc0000",
							}}>
								{entry.term}
							</span>
						</span>
					</div>
				)}

				{/* Content */}
				{!entry.collapsed && (
					<>
						{entry.loading && (
							<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0" }}>
								<span style={{
									fontFamily: "Playfair Display, serif",
									fontSize: 16,
									color: t.inkMuted,
									fontStyle: "italic",
								}}>
									exploring {entry.term}…
								</span>
								<span className="learning-breathe" style={{
									display: "inline-block",
									width: 4,
									height: 4,
									borderRadius: "50%",
									background: borderColor,
								}} />
							</div>
						)}

						{entry.blocks.map((block: any, idx: number) => {
							const b = block.content || block;
							const blockId = block.id || `dd-${entry.term}-${idx}`;
							return (
								<div key={blockId} style={{ position: "relative", padding: "8px 0" }}>
									{b.kind === "heading" || b.type === "heading" ? (
										(b.level || 3) === 3 ? (
											<h3 style={{ fontFamily: "Playfair Display, serif", fontSize: 20, color: t.inkStrong, fontWeight: 500, margin: "16px 0 8px" }}>{b.text || b.content}</h3>
										) : (
											<h4 style={{ fontFamily: "Playfair Display, serif", fontSize: 17, color: t.inkStrong, fontWeight: 500, margin: "12px 0 6px" }}>{b.text || b.content}</h4>
										)
									) : null}
									{(b.kind === "prose" || b.type === "prose") && (
										<div
											onClick={(e) => {
												const target = e.target as HTMLElement;
												if (target.tagName === "HYPER" && !atMaxDepth) {
													e.stopPropagation();
													fetchDeepDive(
														target.textContent || "",
														b.markdown || b.content || "",
														entry.depth + 1,
														currentPath,
													);
												}
											}}
											style={{ fontSize: 15, lineHeight: 1.75, color: t.ink, margin: "8px 0", fontWeight: 300 }}
											dangerouslySetInnerHTML={{ __html: md(b.markdown || b.content || "") }}
										/>
									)}
									{(b.kind === "code" || b.type === "code") && (
										<div style={{ margin: "12px 0", background: "#0d0d0d", border: `1px solid ${t.divider}` }}>
											<div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
												<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.25em", color: "rgba(255,255,255,0.3)" }}>
													{b.filename || b.language || "CODE"}
												</span>
											</div>
											<pre style={{ margin: 0, padding: 14, fontFamily: "JetBrains Mono, monospace", fontSize: 12, lineHeight: 1.7, color: "#c9c9c9", overflow: "auto" }}>
												{b.code || b.content || ""}
											</pre>
										</div>
									)}
									{(b.kind === "callout" || b.type === "callout") && (
										<div style={{ margin: "12px 0", border: `1px solid ${t.divider}`, padding: "14px 18px", background: t.bgCard }}>
											<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.25em", color: t.inkGhost, display: "block", marginBottom: 6 }}>
												{(b.variant || "note").toUpperCase()}
											</span>
											<div
												onClick={(e) => {
													const target = e.target as HTMLElement;
													if (target.tagName === "HYPER" && !atMaxDepth) {
														e.stopPropagation();
														fetchDeepDive(target.textContent || "", b.markdown || b.content || "", entry.depth + 1, currentPath);
													}
												}}
												style={{ fontSize: 13, lineHeight: 1.6, color: t.ink }}
												dangerouslySetInnerHTML={{ __html: md(b.markdown || b.content || "") }}
											/>
										</div>
									)}
									{(b.kind === "katex" || b.type === "katex") && (() => {
									const expr = (b.expression || b.latex || b.content || "").trim();
									const isDisplay = b.display !== false;
									const bgColor = theme === "dark" ? "#141414" : "#F5F3EF";
									const textColor = theme === "dark" ? "#e8e8e8" : "#1a1a18";
									const html = `<!DOCTYPE html><html><head>
									  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
									  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"><\/script>
									  <style>body{margin:0;padding:16px;background:${bgColor};color:${textColor};display:flex;justify-content:center;align-items:center;min-height:40px;}</style>
									</head><body><div id="m"></div><script>
									  try{katex.render(${JSON.stringify(expr)},document.getElementById('m'),{displayMode:${isDisplay},throwOnError:false})}catch(e){document.getElementById('m').textContent=${JSON.stringify(expr)}}
									  setTimeout(()=>window.parent.postMessage({type:'katex-h',h:document.body.scrollHeight},'*'),300)
									<\/script></body></html>`;
									return (
										<div style={{ margin: "12px 0", textAlign: isDisplay ? "center" : "left" }}>
											<iframe
												srcDoc={html}
												sandbox="allow-scripts"
												style={{ width: "100%", minHeight: 60, border: "none", background: "transparent" }}
												onLoad={(e) => {
													const iframe = e.currentTarget;
													window.addEventListener("message", (ev) => {
														if (ev.data?.type === "katex-h") iframe.style.height = `${ev.data.h + 8}px`;
													});
												}}
											/>
										</div>
									);
								})()}
									{(b.kind === "quote" || b.type === "quote") && (
										<blockquote style={{ borderLeft: `2px solid ${t.accent}`, paddingLeft: 18, margin: "12px 0", fontFamily: "Playfair Display, serif", fontSize: 18, fontStyle: "italic", color: t.ink, lineHeight: 1.4 }}>
											{b.markdown || b.text || b.content || ""}
											{b.attribution && (
												<span style={{ display: "block", fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.2em", color: t.inkGhost, marginTop: 6, fontStyle: "normal" }}>
													— {b.attribution}
												</span>
											)}
										</blockquote>
									)}
								</div>
							);
						})}

						{/* Render nested deep dives */}
						{Array.from(entry.children.entries()).map(([childTerm, childEntry]) =>
							renderDeepDiveSection(childEntry, currentPath),
						)}
					</>
				)}
			</div>
		);
	};

	const askAbout = (block: { id: string; kind: string; text?: string }) => {
		setRefineBlock(block);
		setChatOpen(true);
	};

	const sortedLessons = [...lessons].sort(
		(a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index,
	);
	const currentIdx = sortedLessons.findIndex((l: { order_index: number }) => l.order_index === lesson.order_index);

	// Navigation is disabled until recall is confirmed (unless already confirmed from progress)
	const canNavigate = recallConfirmed;

	// Render sidebar lesson list (shared between desktop sidebar and mobile overlay)
	const renderLessonList = (onNavigate?: () => void) => (
		<>
			{sortedLessons.map((l: { id: string; order_index: number; title: string; status: string }) => {
				const active = l.order_index === lesson.order_index;
				const done = l.status === "ready" || l.status === "edited";
				const locked = l.status === "pending" && l.order_index > lesson.order_index;
				return (
					<div
						key={l.id}
						onClick={() => {
							if (!locked) {
								if (onNavigate) onNavigate();
								window.location.href = `/learning/courses/${course.slug}/lessons/${l.order_index}`;
							}
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
		</>
	);

	return (
		<div
			style={{
				...(isMobile
					? { display: "flex", flexDirection: "column" as const, height: "100vh" }
					: { display: "grid", gridTemplateColumns: `220px 1fr ${chatOpen ? "360px" : "40px"}`, height: "100vh" }),
				background: t.bg,
				color: t.ink,
				fontFamily: "Inter, sans-serif",
			}}
		>
			{/* Mobile top header */}
			{isMobile && (
				<div style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "12px 16px",
					borderBottom: `1px solid ${t.divider}`,
					flexShrink: 0,
				}}>
					<button
						onClick={() => setMobileMenuOpen(true)}
						style={{
							background: "transparent",
							border: "none",
							cursor: "pointer",
							color: t.inkMuted,
							padding: 4,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}
						aria-label="Open lesson menu"
					>
						<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
							<path d="M3 5h12M3 9h12M3 13h12" />
						</svg>
					</button>
					<div style={{ flex: 1, textAlign: "center", minWidth: 0, padding: "0 8px" }}>
						<div style={{
							fontFamily: "JetBrains Mono, monospace",
							fontSize: 8,
							textTransform: "uppercase",
							letterSpacing: "0.2em",
							color: t.inkGhost,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}>
							{course.title}
						</div>
						<div style={{
							fontFamily: "Playfair Display, serif",
							fontSize: 13,
							color: t.inkStrong,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}>
							{lesson.title}
						</div>
					</div>
					<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
						{/* Progress pill */}
						<span style={{
							fontFamily: "JetBrains Mono, monospace",
							fontSize: 8,
							textTransform: "uppercase",
							letterSpacing: "0.15em",
							color: t.inkGhost,
							border: `1px solid ${t.divider}`,
							padding: "2px 6px",
							whiteSpace: "nowrap",
						}}>
							{scrollPercent}%
						</span>
						<button
							onClick={toggleTheme}
							style={{ background: "transparent", border: "none", cursor: "pointer", color: t.inkMuted, padding: 4 }}
						>
							{theme === "dark" ? (
								<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M11 7.5A4 4 0 016.5 3c0-.5.1-1 .2-1.4A5 5 0 1012 7.3c-.3.1-.6.2-1 .2z" /></svg>
							) : (
								<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="7" cy="7" r="3" /><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13" /></svg>
							)}
						</button>
					</div>
				</div>
			)}

			{/* Mobile lesson list overlay */}
			{isMobile && mobileMenuOpen && (
				<div style={{
					position: "fixed",
					top: 0,
					left: 0,
					right: 0,
					bottom: 0,
					background: t.bg,
					zIndex: 1000,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}>
					{/* Overlay header */}
					<div style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "16px 20px",
						borderBottom: `1px solid ${t.divider}`,
						flexShrink: 0,
					}}>
						<div>
							<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.25em", color: t.inkGhost, display: "block", marginBottom: 4 }}>
								COURSE
							</span>
							<div style={{ fontFamily: "Playfair Display, serif", fontSize: 18, color: t.inkStrong, lineHeight: 1.15 }}>
								{course.title}
							</div>
						</div>
						<button
							onClick={() => setMobileMenuOpen(false)}
							style={{
								background: "transparent",
								border: "none",
								cursor: "pointer",
								color: t.inkMuted,
								fontSize: 22,
								padding: 4,
								lineHeight: 1,
							}}
							aria-label="Close menu"
						>
							×
						</button>
					</div>
					{/* Progress bar */}
					<div style={{ padding: "0 20px", marginTop: 12, marginBottom: 6 }}>
						<div style={{ height: 1, background: t.divider, position: "relative" }}>
							<div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${scrollPercent}%`, background: t.accent, transition: "width .4s ease" }} />
						</div>
					</div>
					{/* Lesson list */}
					<div style={{ flex: 1, overflowY: "auto", padding: "8px 20px 100px" }}>
						{renderLessonList(() => setMobileMenuOpen(false))}
					</div>
				</div>
			)}

			{/* Mobile chat modal */}
			{isMobile && mobileChatOpen && (
				<div style={{
					position: "fixed",
					top: 0,
					left: 0,
					right: 0,
					bottom: 0,
					background: t.bg,
					zIndex: 1000,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}>
					{/* Chat header */}
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: `1px solid ${t.divider}`, flexShrink: 0 }}>
						<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
							<span style={{ width: 5, height: 5, borderRadius: "50%", background: "#cc0000", display: "inline-block" }} />
							<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.3em", color: t.ink }}>MINSU</span>
							<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.25em", color: t.inkGhost, marginLeft: 8 }}>FREE</span>
						</div>
						<button onClick={() => setMobileChatOpen(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: t.inkMuted, fontSize: 22, lineHeight: 1 }}>×</button>
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
					<div style={{ borderTop: `1px solid ${t.divider}`, padding: "14px 20px 60px" }}>
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
				</div>
			)}

			{/* Left sidebar — desktop only */}
			{!isMobile && (
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

				{renderLessonList()}
			</aside>
			)}

			{/* Center content */}
			<main ref={contentRef} style={{ overflowY: "auto", padding: isMobile ? "16px 20px 100px" : "28px 56px 80px", position: "relative", flex: isMobile ? 1 : undefined }}
				onMouseUp={(e) => {
					const sel = window.getSelection();
					const text = sel?.toString().trim();
					if (text && text.length > 1 && text.length < 500) {
						const range = sel!.getRangeAt(0);
						const rect = range.getBoundingClientRect();
						setSelection({ text, x: rect.left + rect.width / 2, y: rect.bottom + 8 });
						setSelectionTranslation("");
					} else {
						// Delay clearing to allow tooltip clicks
						setTimeout(() => {
							if (!selectionTranslating) setSelection(null);
						}, 200);
					}
				}}
			>
				{/* Header — desktop only (mobile has its own top bar) */}
				{!isMobile && (
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
				)}

				{/* Lesson title */}
				<h1 style={{ fontFamily: "Playfair Display, serif", fontSize: isMobile ? 32 : 52, lineHeight: 1, fontWeight: 500, letterSpacing: "-0.02em", color: t.inkStrong, margin: isMobile ? "0 0 8px" : "0 0 8px", maxWidth: isMobile ? "100%" : 720 }}>
					{lesson.title}<span style={{ color: t.accent }}>.</span>
				</h1>

				{/* Perspective lens selector */}
				{blocks.length > 0 && !isPending && (
					<div style={{ maxWidth: isMobile ? "100%" : 720, marginTop: 20, marginBottom: 8 }}>
						<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
							<Rule width={32} color={t.divider} />
							<Tracked size={9} tracking={0.35} style={{ color: t.inkGhost }}>LENS</Tracked>
							<Rule width={32} color={t.divider} />
							<div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
								<Tracked size={9} tracking={0.25} style={{ color: t.inkGhost, marginRight: 4 }}>LANG</Tracked>
								{(["original", "en", "th"] as const).map((lang) => (
									<button
										key={lang}
										onClick={() => !translating && handleTranslate(lang)}
										style={{
											fontFamily: "JetBrains Mono, ui-monospace, monospace",
											fontSize: 9,
											textTransform: "uppercase",
											letterSpacing: "0.15em",
											padding: "4px 8px",
											border: `1px solid ${activeLang === lang ? t.accent : t.divider}`,
											color: activeLang === lang ? t.accent : t.inkGhost,
											background: "transparent",
											cursor: translating ? "wait" : "pointer",
											transition: "all .2s",
											opacity: translating && activeLang !== lang ? 0.4 : 1,
										}}
									>
										{lang === "original" ? "OG" : lang.toUpperCase()}
									</button>
								))}
								{translating && <span className="learning-breathe" style={{ display: "inline-block", width: 4, height: 4, borderRadius: "50%", background: t.accent, marginLeft: 4 }} />}
							</div>
							{translateError && (
								<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: t.accent, marginLeft: 8 }}>
									{translateError}
								</span>
							)}
						</div>
						<div style={{ display: "flex", gap: 6, flexWrap: isMobile ? "nowrap" : "wrap", overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: isMobile ? "touch" as any : undefined, paddingBottom: isMobile ? 4 : 0 }}>
							{([
								{ key: "default" as const, label: "DEFAULT", color: t.accent },
								{ key: "evolutionary" as const, label: "EVOLUTIONARY", color: "#2d6a4f" },
								{ key: "neuro" as const, label: "NEURO-ENGINEER", color: "#1d3557" },
								{ key: "philosopher" as const, label: "PHILOSOPHER", color: "#6b2fa0" },
								{ key: "architect" as const, label: "SOFTWARE ARCHITECT", color: "#e65100" },
							] as const).map(({ key, label, color }) => {
								const isActive = activePerspective === key;
								const isLoading = perspectiveLoading && activePerspective === key;
								return (
									<button
										key={key}
										onClick={() => !perspectiveLoading && handlePerspectiveChange(key)}
										style={{
											fontFamily: "JetBrains Mono, ui-monospace, monospace",
											fontSize: 9,
											textTransform: "uppercase",
											letterSpacing: "0.2em",
											padding: "6px 10px",
											border: `1px solid ${isActive ? color : t.divider}`,
											color: isActive ? color : t.inkGhost,
											whiteSpace: "nowrap",
											background: "transparent",
											cursor: perspectiveLoading ? "wait" : "pointer",
											transition: "all .25s ease",
											opacity: perspectiveLoading && !isLoading ? 0.4 : 1,
											display: "inline-flex",
											alignItems: "center",
											gap: 6,
										}}
									>
										{isActive && (
											<span style={{
												display: "inline-block",
												width: 4,
												height: 4,
												borderRadius: "50%",
												background: color,
											}} />
										)}
										{label}
										{isLoading && (
											<span className="learning-breathe" style={{
												display: "inline-block",
												width: 4,
												height: 4,
												borderRadius: "50%",
												background: color,
												marginLeft: 2,
											}} />
										)}
									</button>
								);
							})}
						</div>
					</div>
				)}

				{/* Model picker — show before generation starts */}
				{isPending && blocks.length === 0 && !generating && (
					<div style={{ marginTop: 32, maxWidth: isMobile ? "100%" : 720 }}>
						<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
							<Rule width={32} color={t.divider} />
							<Tracked size={9} tracking={0.3} style={{ color: t.inkGhost }}>SELECT MODEL</Tracked>
							<Rule width={32} color={t.divider} />
						</div>
						<div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
							{LESSON_MODELS.map((m) => (
								<button
									key={m.id}
									onClick={() => setLessonModel(m.id)}
									style={{
										fontFamily: "JetBrains Mono, monospace", fontSize: 9,
										textTransform: "uppercase", letterSpacing: "0.15em",
										padding: "6px 10px", border: `1px solid ${lessonModel === m.id ? t.ink : t.divider}`,
										color: lessonModel === m.id ? t.ink : t.inkGhost,
										background: "transparent", cursor: "pointer",
										transition: "all 0.2s",
									}}
								>
									{m.label}
									<span style={{ fontSize: 7, marginLeft: 4, opacity: 0.6 }}>{m.badge}</span>
								</button>
							))}
						</div>
						<button
							onClick={() => generateLesson()}
							style={{
								fontFamily: "JetBrains Mono, monospace", fontSize: 10,
								textTransform: "uppercase", letterSpacing: "0.2em",
								padding: "10px 20px", border: `1px solid ${t.dividerStrong}`,
								background: "transparent", color: t.ink, cursor: "pointer",
								display: "inline-flex", alignItems: "center", gap: 8,
							}}
						>
							GENERATE LESSON
							<span style={{ width: 5, height: 5, borderRadius: "50%", background: t.accent, display: "inline-block" }} />
						</button>
					</div>
				)}

				{/* Generating indicator */}
				{generating && (
					<div style={{ marginTop: 48 }}>
						<span style={{ fontFamily: "Playfair Display, serif", fontSize: 22, color: t.inkMuted, fontStyle: "italic" }}>
							{genStage || "composing your lesson…"}
						</span>
						{!genStage?.includes("error") && !genStage?.includes("failed") && !genStage?.includes("lost") && (
							<span className="learning-breathe" style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "#cc0000", marginLeft: 12 }} />
						)}
						{!genStage?.includes("error") && !genStage?.includes("failed") && generating && (
							<div style={{ marginTop: 16 }}>
								<div style={{ height: 2, background: t.divider, borderRadius: 1, overflow: "hidden", maxWidth: 320, position: "relative" }}>
									{genProgress > 0 ? (
										<div style={{
											height: "100%",
											background: t.accent,
											width: `${Math.min(95, Math.round((genProgress / 10000) * 100))}%`,
											transition: "width 0.5s ease",
										}} />
									) : (
										<div className="learning-indeterminate" style={{
											height: "100%",
											background: t.accent,
											width: "30%",
											position: "absolute",
										}} />
									)}
								</div>
								<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: t.inkGhost, marginTop: 6, display: "block", letterSpacing: "0.15em" }}>
									{genProgress > 0 ? `${Math.round(genProgress / 1000)}K CHARS GENERATED` : "WAITING FOR AI RESPONSE…"}
								</span>
							</div>
						)}
						{/* Retry button on error */}
						{(genStage?.includes("error") || genStage?.includes("failed") || genStage?.includes("lost")) && !generating && (
							<div style={{ marginTop: 16, display: "flex", gap: 8 }}>
								<button
									onClick={() => generateLesson()}
									style={{
										fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase",
										letterSpacing: "0.15em", padding: "8px 16px",
										border: `1px solid ${t.dividerStrong}`, background: "transparent",
										color: t.ink, cursor: "pointer",
									}}
								>
									RETRY GENERATION
								</button>
							</div>
						)}
					</div>
				)}

				{/* Perspective loading indicator */}
				{perspectiveLoading && perspectiveBlocks.length === 0 && (
					<div style={{ maxWidth: isMobile ? "100%" : 720, marginTop: 48 }}>
						<span style={{ fontFamily: "Playfair Display, serif", fontSize: 22, color: t.inkMuted, fontStyle: "italic" }}>
							{perspectiveStage || `reframing through ${activePerspective} lens…`}
						</span>
						<span className="learning-breathe" style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: activePerspective === "evolutionary" ? "#2d6a4f" : activePerspective === "neuro" ? "#1d3557" : activePerspective === "architect" ? "#e65100" : "#6b2fa0", marginLeft: 12 }} />
						{perspectiveProgress > 0 && (
							<div style={{ marginTop: 16 }}>
								<div style={{ height: 2, background: t.divider, borderRadius: 1, overflow: "hidden", maxWidth: 320 }}>
									<div style={{
										height: "100%",
										background: activePerspective === "evolutionary" ? "#2d6a4f" : activePerspective === "neuro" ? "#1d3557" : activePerspective === "architect" ? "#e65100" : "#6b2fa0",
										width: `${Math.min(95, Math.round((perspectiveProgress / 10000) * 100))}%`,
										transition: "width 0.5s ease",
									}} />
								</div>
								<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: t.inkGhost, marginTop: 6, display: "block", letterSpacing: "0.15em" }}>
									{Math.round(perspectiveProgress / 1000)}K CHARS PROCESSED
								</span>
							</div>
						)}
					</div>
				)}

				{/* Translation loading */}
				{translating && (
					<div style={{ maxWidth: isMobile ? "100%" : 720, marginTop: 32 }}>
						<span style={{ fontFamily: "Playfair Display, serif", fontSize: 18, color: t.inkMuted, fontStyle: "italic" }}>
							{activeLang === "th" ? "translating to Thai…" : "translating to English…"}
						</span>
						<span className="learning-breathe" style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: t.accent, marginLeft: 12 }} />
						<div style={{ marginTop: 12, height: 2, background: t.divider, borderRadius: 1, overflow: "hidden", maxWidth: 320, position: "relative" }}>
							<div className="learning-indeterminate" style={{ height: "100%", background: t.accent, width: "30%", position: "absolute" }} />
						</div>
					</div>
				)}

				{/* Blocks */}
				<div style={{ maxWidth: isMobile ? "100%" : 720, marginTop: translating ? 16 : 32, opacity: (perspectiveLoading && perspectiveBlocks.length === 0) || translating ? 0.3 : 1, transition: "opacity 0.3s", pointerEvents: perspectiveLoading || translating ? "none" : "auto" }}>
					{(activeLang !== "original" && translatedBlocks.length > 0
					? translatedBlocks
					: activePerspective === "default" ? blocks : (perspectiveBlocks.length > 0 ? perspectiveBlocks : blocks)
				).map((block: any, idx: number) => {
						const raw = block.content || block;
						// Normalize: AI outputs "type", DB stores "kind" — handle both
						const b = { ...raw, kind: raw.kind || raw.type };
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

						const noteBtn = (
							<button
								onClick={(e) => { e.stopPropagation(); setNoteEditing({ blockIndex: idx, content: "", color: "default" }); }}
								style={{
									position: "absolute", right: -34, top: 46,
									width: 24, height: 24, borderRadius: "50%",
									border: `1px solid ${t.divider}`, background: "transparent",
									cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
									opacity: isHovered ? 0.7 : 0, transition: "opacity .25s",
									color: t.inkMuted, fontSize: 12, padding: 0,
								}}
								title="Add note"
							>
								<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
									<path d="M2 2h8v8H4L2 8V2z" /><path d="M4 10V8H2" />
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
											<h2 style={{ fontFamily: "Playfair Display, serif", fontSize: isMobile ? 22 : 30, color: t.inkStrong, fontWeight: 500, letterSpacing: "-0.015em", margin: isMobile ? "24px 0 8px" : "32px 0 8px" }}>{b.text}</h2>
										) : (
											<h3 style={{ fontFamily: "Playfair Display, serif", fontSize: 22, color: t.inkStrong, fontWeight: 500, margin: "24px 0 8px" }}>{b.text}</h3>
										)}
										{askBtn}
									</>
								)}
								{b.kind === "prose" && (
									<>
										<div
											onClick={(e) => {
												const target = e.target as HTMLElement;
												if (target.tagName === "HYPER") {
													e.stopPropagation();
													fetchDeepDive(target.textContent || "", b.markdown || "", 1, []);
												}
											}}
											style={{ fontSize: 16, lineHeight: 1.75, color: t.ink, margin: "12px 0", fontWeight: 300 }}
											dangerouslySetInnerHTML={{ __html: md(b.markdown || "") }}
										/>
										{askBtn}
									</>
								)}
								{b.kind === "quote" && (
									<div style={{ margin: "28px 0" }}>
										<blockquote style={{ borderLeft: `2px solid ${t.accent}`, paddingLeft: 22, margin: 0, fontFamily: "Playfair Display, serif", fontSize: 22, fontStyle: "italic", color: t.ink, lineHeight: 1.4 }}>
											{b.markdown || b.text}
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
													{b.filename || b.language || "CODE"}
												</span>
											</div>
											<pre style={{ margin: 0, padding: 18, fontFamily: "JetBrains Mono, monospace", fontSize: 13, lineHeight: 1.7, color: "#c9c9c9", overflow: "auto" }}>
												{b.code || ""}
											</pre>
										</div>
										{b.caption && <div style={{ fontSize: 12, color: t.inkGhost, marginTop: 6, fontStyle: "italic" }}>{b.caption}</div>}
										{askBtn}
									</div>
								)}
								{b.kind === "callout" && (
									<div style={{ margin: "28px 0", border: `1px solid ${t.divider}`, padding: isMobile ? "14px 16px" : "20px 24px", background: t.bgCard }}>
										<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.25em", color: b.variant === "warning" ? t.accent : t.inkGhost, display: "block", marginBottom: 8 }}>
											{b.variant?.toUpperCase() || "NOTE"}
										</span>
										<div
											onClick={(e) => {
												const target = e.target as HTMLElement;
												if (target.tagName === "HYPER") {
													e.stopPropagation();
													fetchDeepDive(target.textContent || "", b.markdown || "", 1, []);
												}
											}}
											style={{ fontSize: 14, lineHeight: 1.6, color: t.ink, margin: 0 }}
											dangerouslySetInnerHTML={{ __html: md(b.markdown || "") }}
										/>
										{askBtn}
									</div>
								)}
								{b.kind === "mermaid" && (() => {
									const mermaidCode = (b.code || b.diagram || "").trim();
									const mermaidTheme = theme === "dark" ? "dark" : "default";
									const bgColor = theme === "dark" ? "#141414" : "#F5F3EF";
									const textColor = theme === "dark" ? "#e8e8e8" : "#1a1a18";
									const borderColor = theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
									const escapedCode = mermaidCode.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
									const html = `<!DOCTYPE html><html><head>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>
<style>
*{box-sizing:border-box;}
body{margin:0;padding:0;background:${bgColor};overflow:hidden;height:100vh;display:flex;flex-direction:column;}
#viewport{flex:1;overflow:hidden;position:relative;cursor:grab;}
#viewport.dragging{cursor:grabbing;}
#container{transform-origin:0 0;position:absolute;padding:32px;}
.mermaid svg{display:block;}
#controls{display:flex;gap:4px;padding:8px 12px;border-top:1px solid ${borderColor};background:${bgColor};}
#controls button{background:transparent;border:1px solid ${borderColor};color:${textColor};font-family:monospace;font-size:11px;padding:4px 10px;cursor:pointer;border-radius:0;}
#controls button:hover{background:${theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"};}
#controls span{font-family:monospace;font-size:9px;color:${textColor};opacity:0.5;padding:4px 8px;letter-spacing:0.1em;}
</style></head><body>
<div id="viewport">
<div id="container">
<pre class="mermaid">${escapedCode}</pre>
</div>
</div>
<div id="controls">
<button onclick="zoomIn()">+</button>
<button onclick="zoomOut()">−</button>
<button onclick="resetView()">FIT</button>
<button onclick="window.parent.postMessage({type:'mermaid-fullscreen',code:document.querySelector('.mermaid')?.textContent||''},'*')">⛶ EXPAND</button>
<span id="zoomLabel">100%</span>
</div>
<script>
mermaid.initialize({startOnLoad:true,theme:'${mermaidTheme}',themeVariables:{fontSize:'14px',primaryColor:'${theme === "dark" ? "#444" : "#ddd"}',primaryTextColor:'${textColor}',lineColor:'${textColor}'}});

let scale=1,tx=0,ty=0,dragging=false,startX=0,startY=0;
const vp=document.getElementById('viewport');
const ct=document.getElementById('container');
const zl=document.getElementById('zoomLabel');

function apply(){ct.style.transform='translate('+tx+'px,'+ty+'px) scale('+scale+')';zl.textContent=Math.round(scale*100)+'%';}
function zoomIn(){scale=Math.min(scale*1.3,5);apply();}
function zoomOut(){scale=Math.max(scale/1.3,0.2);apply();}
function resetView(){
  const svg=document.querySelector('.mermaid svg');
  if(!svg)return;
  const r=svg.getBoundingClientRect();
  const vr=vp.getBoundingClientRect();
  scale=Math.min(vr.width/(r.width/scale+64),vr.height/(r.height/scale+64),2);
  tx=(vr.width-r.width/scale*scale)/2;ty=16;
  apply();
}

vp.addEventListener('mousedown',e=>{dragging=true;startX=e.clientX-tx;startY=e.clientY-ty;vp.classList.add('dragging');});
window.addEventListener('mousemove',e=>{if(!dragging)return;tx=e.clientX-startX;ty=e.clientY-startY;apply();});
window.addEventListener('mouseup',()=>{dragging=false;vp.classList.remove('dragging');});
vp.addEventListener('wheel',e=>{e.preventDefault();const f=e.deltaY>0?0.9:1.1;scale=Math.max(0.2,Math.min(5,scale*f));apply();},{passive:false});

// Touch support
let lastDist=0;
vp.addEventListener('touchstart',e=>{if(e.touches.length===1){dragging=true;startX=e.touches[0].clientX-tx;startY=e.touches[0].clientY-ty;}if(e.touches.length===2){lastDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}});
vp.addEventListener('touchmove',e=>{e.preventDefault();if(e.touches.length===1&&dragging){tx=e.touches[0].clientX-startX;ty=e.touches[0].clientY-startY;apply();}if(e.touches.length===2){const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);scale=Math.max(0.2,Math.min(5,scale*(d/lastDist)));lastDist=d;apply();}},{passive:false});
vp.addEventListener('touchend',()=>{dragging=false;});

window.addEventListener('load',()=>{setTimeout(()=>{
  resetView();
  const svg=document.querySelector('.mermaid svg');
  const h=svg?Math.min(svg.getBoundingClientRect().height/scale+100,600):400;
  window.parent.postMessage({type:'mermaid-height',height:Math.max(h,350)},'*');
},800)});
<\/script></body></html>`;
									return (
										<div style={{ margin: "28px 0", border: `1px solid ${t.divider}`, overflow: "hidden", position: "relative" }}>
											<iframe
												srcDoc={html}
												sandbox="allow-scripts"
												style={{
													width: "100%",
													minHeight: 350,
													border: "none",
													background: t.bgCard,
												}}
												onLoad={(e) => {
													const iframe = e.currentTarget;
													const handler = (ev: MessageEvent) => {
														if (ev.data?.type === "mermaid-height" && ev.data.height) {
															iframe.style.height = `${Math.min(ev.data.height, 600)}px`;
														}
														if (ev.data?.type === "mermaid-fullscreen" && ev.data.code) {
															setMermaidPopup(ev.data.code);
														}
													};
													window.addEventListener("message", handler);
												}}
											/>
											{b.caption && (
												<div style={{ padding: "8px 12px", textAlign: "center", borderTop: `1px solid ${t.divider}` }}>
													<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.3em", color: t.inkGhost }}>{b.caption}</span>
												</div>
											)}
											{askBtn}
										</div>
									);
								})()}
								{b.kind === "katex" && (() => {
								const expr = (b.expression || b.latex || b.content || "").trim();
								const isDisplay = b.display !== false;
								const bgColor = theme === "dark" ? "#141414" : "#F5F3EF";
								const textColor = theme === "dark" ? "#e8e8e8" : "#1a1a18";
								const html = `<!DOCTYPE html><html><head>
								  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
								  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"><\/script>
								  <style>body{margin:0;padding:16px;background:${bgColor};color:${textColor};display:flex;justify-content:center;align-items:center;min-height:40px;}</style>
								</head><body><div id="m"></div><script>
								  try{katex.render(${JSON.stringify(expr)},document.getElementById('m'),{displayMode:${isDisplay},throwOnError:false})}catch(e){document.getElementById('m').textContent=${JSON.stringify(expr)}}
								  setTimeout(()=>window.parent.postMessage({type:'katex-h',h:document.body.scrollHeight},'*'),300)
								<\/script></body></html>`;
								return (
									<div style={{ margin: "28px 0", textAlign: isDisplay ? "center" : "left" }}>
										<iframe
											srcDoc={html}
											sandbox="allow-scripts"
											style={{ width: "100%", minHeight: 60, border: "none", background: "transparent" }}
											onLoad={(e) => {
												const iframe = e.currentTarget;
												window.addEventListener("message", (ev) => {
													if (ev.data?.type === "katex-h") iframe.style.height = `${ev.data.h + 8}px`;
												});
											}}
										/>
										{b.caption && <div style={{ fontSize: 12, color: t.inkGhost, marginTop: 6, fontStyle: "italic", textAlign: "center" }}>{b.caption}</div>}
									</div>
								);
							})()}
								{b.kind === "image" && (
									<div style={{ margin: "28px 0" }}>
										<img src={b.src || b.url} alt={b.alt || ""} style={{ maxWidth: "100%", filter: b.bw ? "grayscale(100%)" : undefined }} />
										{b.caption && (
											<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.2em", color: t.inkGhost, marginTop: 8, display: "block" }}>{b.caption}</span>
										)}
										{askBtn}
									</div>
								)}
								{b.kind === "interactive" && (() => {
								const rawCode = (b.code || "").trim();
								if (!rawCode) {
									return (
										<div style={{ margin: "28px 0", padding: 24, border: `1px solid ${t.divider}`, background: t.bgCard, textAlign: "center" }}>
											<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: t.inkGhost }}>interactive component unavailable</span>
										</div>
									);
								}
								const isFullHtml = /<html|<!doctype/i.test(rawCode);
								const wrapped = isFullHtml ? rawCode : `<!DOCTYPE html><html><head><style>body{margin:0;padding:16px;font-family:system-ui,sans-serif}</style></head><body>${rawCode}</body></html>`;
								return (
									<div style={{ margin: "28px 0", border: `1px solid ${t.divider}`, overflow: "hidden" }}>
										<div style={{ padding: "10px 16px", borderBottom: `1px solid ${t.divider}` }}>
											<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.25em", color: t.inkGhost }}>
												INTERACTIVE{b.framework ? ` · ${b.framework.toUpperCase()}` : ""}
											</span>
										</div>
										<iframe srcDoc={wrapped} sandbox="allow-scripts" style={{ width: "100%", height: b.height || 300, border: "none", background: "#fff" }} />
										{b.description && <div style={{ padding: "8px 16px", borderTop: `1px solid ${t.divider}`, fontSize: 12, color: t.inkGhost, fontStyle: "italic" }}>{b.description}</div>}
									</div>
								);
							})()}
								{noteBtn}
								{/* Notes for this block */}
								{notes.filter(n => n.block_index === idx).map(note => (
									<div key={note.id} style={{
										marginTop: 8, padding: "10px 14px",
										borderLeft: `3px solid ${note.color === "yellow" ? "#f59e0b" : note.color === "blue" ? "#3b82f6" : note.color === "green" ? "#10b981" : note.color === "pink" ? "#ec4899" : t.dividerStrong}`,
										background: t.bgCard, fontSize: 13, color: t.inkMuted, lineHeight: 1.5,
										position: "relative",
									}}>
										<div style={{ whiteSpace: "pre-wrap" }}>{note.content}</div>
										<div style={{ display: "flex", gap: 8, marginTop: 6 }}>
											<button onClick={() => setNoteEditing({ blockIndex: idx, content: note.content, color: note.color, noteId: note.id })} style={{ background: "transparent", border: "none", color: t.inkGhost, cursor: "pointer", fontSize: 10, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.15em" }}>EDIT</button>
											<button onClick={async () => {
												await fetch("/learning/api/notes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ noteId: note.id }) });
												setNotes(n => n.filter(x => x.id !== note.id));
											}} style={{ background: "transparent", border: "none", color: t.accent, cursor: "pointer", fontSize: 10, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.15em" }}>DELETE</button>
										</div>
									</div>
								))}
								{/* Note editor */}
								{noteEditing && noteEditing.blockIndex === idx && (
									<div style={{ marginTop: 8, padding: 12, border: `1px solid ${t.divider}`, background: t.bgCard }}>
										<textarea
											value={noteEditing.content}
											onChange={(e) => setNoteEditing({ ...noteEditing, content: e.target.value })}
											placeholder="Write your note..."
											rows={3}
											style={{ width: "100%", border: "none", outline: "none", background: "transparent", color: t.ink, fontSize: 13, resize: "vertical", fontFamily: "Inter, sans-serif" }}
										/>
										<div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
											{["default", "yellow", "blue", "green", "pink"].map(c => (
												<button key={c} onClick={() => setNoteEditing({ ...noteEditing, color: c })}
													style={{
														width: 16, height: 16, borderRadius: "50%", border: noteEditing.color === c ? "2px solid " + t.ink : `1px solid ${t.divider}`,
														background: c === "yellow" ? "#f59e0b" : c === "blue" ? "#3b82f6" : c === "green" ? "#10b981" : c === "pink" ? "#ec4899" : t.dividerStrong,
														cursor: "pointer", padding: 0,
													}}
												/>
											))}
											<div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
												<button onClick={() => setNoteEditing(null)} style={{ background: "transparent", border: `1px solid ${t.divider}`, color: t.inkGhost, cursor: "pointer", padding: "4px 10px", fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em" }}>CANCEL</button>
												<button onClick={async () => {
													if (!noteEditing.content.trim()) return;
													const method = noteEditing.noteId ? "PATCH" : "POST";
													const body = noteEditing.noteId
														? { noteId: noteEditing.noteId, content: noteEditing.content, color: noteEditing.color }
														: { lessonId: lesson.id, blockIndex: noteEditing.blockIndex, content: noteEditing.content, color: noteEditing.color };
													const res = await fetch("/learning/api/notes", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
													if (res.ok) {
														const data = await res.json();
														if (noteEditing.noteId) {
															setNotes(n => n.map(x => x.id === noteEditing.noteId ? { ...x, content: noteEditing.content, color: noteEditing.color } : x));
														} else if (data.note) {
															setNotes(n => [...n, data.note]);
														}
													}
													setNoteEditing(null);
												}} style={{ background: "transparent", border: `1px solid ${t.dividerStrong}`, color: t.ink, cursor: "pointer", padding: "4px 10px", fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em" }}>SAVE</button>
											</div>
										</div>
									</div>
								)}
							</div>
						);
					})}

					{/* Deep-dive sections (top-level) */}
					{deepDives.size > 0 && (
						<div style={{ marginTop: 8 }}>
							{Array.from(deepDives.entries()).map(([term, entry]) =>
								renderDeepDiveSection(entry, []),
							)}
						</div>
					)}
				</div>

				{/* Socratic Recall Checkpoint */}
				{blocks.length > 0 && (recallActive || recallConfirmed) && (
					<div style={{ maxWidth: isMobile ? "100%" : 720, marginTop: isMobile ? 32 : 48 }}>
						{/* Checkpoint divider */}
						<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
							<div style={{ flex: 1, height: 1, background: t.divider }} />
							<span style={{
								fontFamily: "JetBrains Mono, monospace",
								fontSize: 9,
								textTransform: "uppercase",
								letterSpacing: "0.35em",
								color: recallConfirmed ? t.accent : t.inkGhost,
							}}>
								{recallConfirmed ? "CHECKPOINT CLEARED" : "CHECKPOINT"}
							</span>
							<div style={{ flex: 1, height: 1, background: t.divider }} />
						</div>

						{/* Checkpoint container */}
						<div style={{
							border: `1px solid ${recallConfirmed ? t.accent : t.divider}`,
							borderLeft: `2px solid ${recallConfirmed ? t.accent : t.inkMuted}`,
							padding: isMobile ? "16px 16px" : "24px 28px",
							background: t.bgCard,
							position: "relative",
						}}>
							{/* Header */}
							<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
								<span style={{
									width: 6, height: 6, borderRadius: "50%",
									background: recallConfirmed ? t.accent : "#cc0000",
									display: "inline-block",
								}} />
								<span style={{
									fontFamily: "JetBrains Mono, monospace",
									fontSize: 10,
									textTransform: "uppercase",
									letterSpacing: "0.3em",
									color: recallConfirmed ? t.accent : t.ink,
								}}>
									ACTIVE RECALL
								</span>
								<span style={{
									fontFamily: "JetBrains Mono, monospace",
									fontSize: 9,
									textTransform: "uppercase",
									letterSpacing: "0.25em",
									color: t.inkGhost,
									marginLeft: "auto",
								}}>
									FEYNMAN TECHNIQUE
								</span>
							</div>

							{!recallConfirmed && recallMessages.length === 0 && (
								<div>
									<p style={{
										fontSize: 14, lineHeight: 1.6, color: t.inkMuted,
										fontStyle: "italic", margin: "0 0 16px",
									}}>
										preparing your recall checkpoint…
									</p>
									<div style={{ display: "flex", gap: 8, marginTop: 8 }}>
										<button
											onClick={() => startRecall()}
											style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em", padding: "6px 12px", border: `1px solid ${t.divider}`, background: "transparent", color: t.inkMuted, cursor: "pointer" }}
										>
											RETRY
										</button>
										<button
											onClick={() => { setRecallConfirmed(true); handleRecallConfirmed(); }}
											style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em", padding: "6px 12px", border: `1px solid ${t.divider}`, background: "transparent", color: t.inkGhost, cursor: "pointer" }}
										>
											SKIP CHECKPOINT
										</button>
									</div>
								</div>
							)}

							{/* Conversation */}
							<div style={{ maxHeight: 420, overflowY: "auto", marginBottom: recallConfirmed ? 0 : 20 }}>
								{recallMessages.map((m, i) => {
									const isUser = m.role === "user";
									// Strip the confirmation tag from display
									const displayContent = m.content.replace("[UNDERSTANDING_CONFIRMED]", "").trim();
									// Hide the initial trigger message from the user
									if (isUser && i === 0) return null;
									return (
										<div key={i} style={{ marginBottom: 16 }}>
											<span style={{
												fontFamily: "JetBrains Mono, monospace",
												fontSize: 9,
												textTransform: "uppercase",
												letterSpacing: "0.25em",
												color: t.inkGhost,
												display: "block",
												marginBottom: 6,
											}}>
												{isUser ? "YOU" : "MINSU"}
											</span>
											<div style={{
												fontSize: 14, lineHeight: 1.7, color: t.ink,
												paddingLeft: isUser ? 0 : 0,
												textAlign: isUser ? "right" : "left",
											}}>
												{displayContent || (
													<span style={{ fontFamily: "Playfair Display, serif", fontSize: 18, color: t.inkMuted, letterSpacing: 2 }}>…</span>
												)}
											</div>
										</div>
									);
								})}
								<div ref={recallEndRef} />
							</div>

							{/* Confirmed success */}
							{recallConfirmed && (
								<div style={{
									marginTop: 16,
									padding: "16px 20px",
									border: `1px solid ${t.accent}`,
									background: "transparent",
								}}>
									<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
										<span style={{ width: 5, height: 5, borderRadius: "50%", background: t.accent, display: "inline-block" }} />
										<span style={{
											fontFamily: "JetBrains Mono, monospace",
											fontSize: 10,
											textTransform: "uppercase",
											letterSpacing: "0.3em",
											color: t.accent,
										}}>
											UNDERSTANDING CONFIRMED
										</span>
									</div>
									<p style={{ fontSize: 13, lineHeight: 1.5, color: t.inkMuted, margin: "10px 0 0" }}>
										You've demonstrated a solid grasp of this material. Navigation to the next lesson is now unlocked.
									</p>
								</div>
							)}

							{/* Input area */}
							{!recallConfirmed && recallMessages.length > 0 && (
								<div style={{ borderTop: `1px solid ${t.divider}`, paddingTop: 16 }}>
									<div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
										<textarea
											value={recallInput}
											onChange={(e) => setRecallInput(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter" && !e.shiftKey) {
													e.preventDefault();
													sendRecallMessage(recallInput);
												}
											}}
											placeholder="explain what you learned in your own words…"
											rows={3}
											style={{
												flex: 1, border: "none", outline: "none", resize: "none",
												background: "transparent", color: t.ink,
												fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.5,
											}}
										/>
										<button
											onClick={() => sendRecallMessage(recallInput)}
											disabled={recallStreaming || !recallInput.trim()}
											style={{
												background: "transparent",
												border: `1px solid ${t.divider}`,
												padding: "6px 12px",
												cursor: recallStreaming ? "wait" : "pointer",
												color: t.inkMuted,
												fontFamily: "JetBrains Mono, monospace",
												fontSize: 9,
												textTransform: "uppercase",
												letterSpacing: "0.25em",
												opacity: recallStreaming || !recallInput.trim() ? 0.4 : 1,
											}}
										>
											SEND
										</button>
									</div>
								</div>
							)}
						</div>
					</div>
				)}

				{/* Complete button — triggers recall if not yet active */}
				{blocks.length > 0 && !recallActive && !recallConfirmed && (
					<div style={{ maxWidth: isMobile ? "100%" : 720, marginTop: 40, textAlign: "center" }}>
						<button
							onClick={() => setRecallActive(true)}
							style={{
								fontFamily: "JetBrains Mono, monospace",
								fontSize: 11,
								textTransform: "uppercase",
								letterSpacing: "0.25em",
								background: "transparent",
								border: `1px solid ${t.divider}`,
								color: t.inkMuted,
								cursor: "pointer",
								padding: "14px 28px",
								display: "inline-flex",
								alignItems: "center",
								gap: 10,
							}}
						>
							BEGIN RECALL CHECKPOINT
							<span style={{ width: 5, height: 5, borderRadius: "50%", background: "#cc0000", opacity: 0.6 }} />
						</button>
					</div>
				)}

				{/* Bottom navigation */}
				{blocks.length > 0 && (
					<div style={{
						display: "flex", justifyContent: "space-between", alignItems: "center",
						marginTop: isMobile ? 32 : 56, paddingTop: 32, borderTop: `1px solid ${t.divider}`, maxWidth: isMobile ? "100%" : 720,
					}}>
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
								onClick={() => {
									if (!canNavigate) return;
									window.location.href = `/learning/courses/${course.slug}/lessons/${sortedLessons[currentIdx + 1].order_index}`;
								}}
								style={{
									fontFamily: "JetBrains Mono, monospace",
									fontSize: 11,
									textTransform: "uppercase",
									letterSpacing: "0.25em",
									background: "transparent",
									border: `1px solid ${canNavigate ? t.accent : t.divider}`,
									color: canNavigate ? t.inkStrong : t.inkGhost,
									cursor: canNavigate ? "pointer" : "not-allowed",
									padding: "12px 22px",
									display: "inline-flex",
									alignItems: "center",
									gap: 10,
									opacity: canNavigate ? 1 : 0.5,
									transition: "all .3s ease",
								}}
							>
								{canNavigate ? "NEXT LESSON" : "COMPLETE RECALL TO CONTINUE"}
								<span style={{
									width: 5, height: 5, borderRadius: "50%",
									background: canNavigate ? t.accent : "#cc0000",
									opacity: canNavigate ? 1 : 0.3,
								}} />
							</button>
						) : null}
					</div>
				)}

				{/* Highlight-to-translate tooltip */}
				{selection && (
					<div style={{
						position: "fixed",
						left: Math.min(selection.x - 80, typeof window !== "undefined" ? window.innerWidth - 200 : 600),
						top: selection.y,
						background: t.bgElevated,
						border: `1px solid ${t.dividerStrong}`,
						padding: "8px 12px",
						zIndex: 100,
						boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
						maxWidth: 300,
					}}>
						{selectionTranslation ? (
							<div>
								<div style={{ fontFamily: "Playfair Display, serif", fontSize: 14, color: t.ink, lineHeight: 1.5 }}>
									{selectionTranslation}
								</div>
								<button onClick={() => setSelection(null)} style={{ marginTop: 6, background: "transparent", border: "none", color: t.inkGhost, cursor: "pointer", fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em" }}>CLOSE</button>
							</div>
						) : (
							<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
								{selectionTranslating ? (
									<>
										<span className="learning-breathe" style={{ display: "inline-block", width: 4, height: 4, borderRadius: "50%", background: t.accent }} />
										<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: t.inkGhost }}>TRANSLATING…</span>
									</>
								) : (
									<>
										<button onClick={async () => {
											setSelectionTranslating(true);
											const hasThai = /[\u0E00-\u0E7F]/.test(selection.text);
											const targetLang = hasThai ? "en" : "th";
											try {
												const res = await fetch("/learning/api/ai/translate", {
													method: "POST",
													headers: { "Content-Type": "application/json" },
													body: JSON.stringify({ text: selection.text, targetLang }),
												});
												const data = await res.json();
												setSelectionTranslation(data.translated || data.message || "translation failed");
											} catch {
												setSelectionTranslation("connection error");
											} finally {
												setSelectionTranslating(false);
											}
										}} style={{
											background: "transparent", border: `1px solid ${t.divider}`,
											padding: "4px 10px", cursor: "pointer",
											fontFamily: "JetBrains Mono, monospace", fontSize: 9,
											textTransform: "uppercase", letterSpacing: "0.15em", color: t.ink,
										}}>
											{/[\u0E00-\u0E7F]/.test(selection.text) ? "→ ENGLISH" : "→ ไทย"}
										</button>
										<button onClick={() => setSelection(null)} style={{ background: "transparent", border: "none", color: t.inkGhost, cursor: "pointer", fontSize: 14 }}>×</button>
									</>
								)}
							</div>
						)}
					</div>
				)}
			</main>

			{/* Mobile floating "Ask AI" button */}
			{isMobile && !mobileChatOpen && !mobileMenuOpen && (
				<button
					onClick={() => setMobileChatOpen(true)}
					style={{
						position: "fixed",
						bottom: 80,
						right: 16,
						width: 48,
						height: 48,
						borderRadius: "50%",
						background: t.bg,
						border: `1px solid ${t.divider}`,
						cursor: "pointer",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						flexDirection: "column",
						gap: 2,
						zIndex: 100,
						boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
					}}
					aria-label="Ask AI"
				>
					<span style={{ width: 5, height: 5, borderRadius: "50%", background: "#cc0000", display: "inline-block" }} />
					<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 6, textTransform: "uppercase", letterSpacing: "0.15em", color: t.inkGhost }}>
						AI
					</span>
				</button>
			)}

			{/* Right chat panel — desktop only */}
			{!isMobile && (
				!chatOpen ? (
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
								<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.25em", color: t.inkGhost, marginLeft: 8 }}>FREE</span>
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
						<div style={{ borderTop: `1px solid ${t.divider}`, padding: "14px 20px 60px" }}>
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
				)
			)}
		</div>

			{/* Mermaid popup modal */}
			{mermaidPopup && (() => {
				const popupTheme = theme === "dark" ? "dark" : "default";
				const popupBg = theme === "dark" ? "#0a0a0a" : "#F5F3EF";
				const popupText = theme === "dark" ? "#e8e8e8" : "#1a1a18";
				const popupCode = mermaidPopup.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
				const popupHtml = `<!DOCTYPE html><html><head>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>
<style>
body{margin:0;padding:40px;background:${popupBg};display:flex;justify-content:center;align-items:flex-start;min-height:100vh;overflow:auto;}
.mermaid svg{display:block;}
</style></head><body>
<pre class="mermaid">${popupCode}</pre>
<script>mermaid.initialize({startOnLoad:true,theme:'${popupTheme}',themeVariables:{fontSize:'16px',primaryColor:'${theme === "dark" ? "#444" : "#ddd"}',primaryTextColor:'${popupText}',lineColor:'${popupText}'}});<\/script>
</body></html>`;
				return (
					<div
						style={{
							position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
							background: "rgba(0,0,0,0.85)", zIndex: 9999,
							display: "flex", flexDirection: "column",
						}}
						onClick={() => setMermaidPopup(null)}
					>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px" }}>
							<span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.2em" }}>
								DIAGRAM · CLICK ANYWHERE TO CLOSE
							</span>
							<button
								onClick={() => setMermaidPopup(null)}
								style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", cursor: "pointer", padding: "6px 14px", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.15em" }}
							>
								CLOSE ×
							</button>
						</div>
						<div style={{ flex: 1, overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
							<iframe
								srcDoc={popupHtml}
								sandbox="allow-scripts"
								style={{ width: "100%", height: "100%", border: "none" }}
							/>
						</div>
					</div>
				);
			})()}
	);
}
