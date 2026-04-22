/**
 * POST /api/ai/chat
 * Streaming chat endpoint with thread persistence.
 * Supports scope "lesson" (general chat) and "recall" (Socratic active recall).
 */
import type { Route } from "./+types/ai.chat";
import { ChatBody } from "~/lib/ai/schemas";
import { streamUnified } from "~/lib/ai/unified-client";
import type { ChatMessage } from "~/lib/ai/client";
import { selectModel } from "~/lib/ai/router";
import { chatPrompt } from "~/lib/ai/prompts/chat";
import { socraticRecallPrompt } from "~/lib/ai/prompts/socraticRecall";
import { createServiceClient } from "~/lib/supabase.server";
import { requireAuth, sseResponse, createSSEStream } from "~/lib/ai/helpers.server";

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;

	if (request.method !== "POST") {
		return Response.json({ message: "method not allowed" }, { status: 405 });
	}

	const denied = await requireAuth(request, env);
	if (denied) return denied;

	let body: ReturnType<typeof ChatBody.safeParse>;
	try {
		body = ChatBody.safeParse(await request.json());
	} catch {
		return Response.json({ message: "invalid json" }, { status: 400 });
	}
	if (!body.success) {
		return Response.json(
			{ message: "invalid request", errors: body.error.flatten() },
			{ status: 400 },
		);
	}

	const { message, scope, scopeId, model: requestedModel } = body.data;
	let { threadId } = body.data;
	const supabase = createServiceClient(env as unknown as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

	// Create thread if not provided
	if (!threadId) {
		const { data: thread, error: threadError } = await supabase
			.from("chat_threads")
			.insert({ scope, scope_id: scopeId })
			.select("id")
			.single();

		if (threadError || !thread) {
			return Response.json({ message: "failed to create thread" }, { status: 500 });
		}
		threadId = thread.id;
	}

	// Save user message
	const { error: userMsgError } = await supabase
		.from("chat_messages")
		.insert({
			thread_id: threadId,
			role: "user",
			content: message,
		});

	if (userMsgError) {
		return Response.json({ message: "failed to save message" }, { status: 500 });
	}

	// Load conversation history
	const { data: history } = await supabase
		.from("chat_messages")
		.select("role, content")
		.eq("thread_id", threadId)
		.order("created_at", { ascending: true });

	const messages: ChatMessage[] = (history ?? []).map((m) => ({
		role: m.role as "user" | "assistant",
		content: m.content,
	}));

	// Build system prompt based on scope
	let systemPrompt: string;

	// Detect user language from message
	const hasThai = /[\u0E00-\u0E7F]/.test(message);

	if (scope === "recall") {
		// Socratic Active Recall — load lesson details for the prompt
		const { data: lesson } = await supabase
			.from("lessons")
			.select("title, outcomes, courses(title, language)")
			.eq("id", scopeId)
			.single();

		// Load block summaries for context
		const { data: blockData } = await supabase
			.from("lesson_blocks")
			.select("content, order_index")
			.eq("lesson_id", scopeId)
			.order("order_index", { ascending: true });

		const lessonTitle = lesson?.title ?? "Unknown lesson";
		const outcomes: string[] = (lesson as Record<string, unknown>)?.outcomes as string[] ?? [];

		// Extract summaries from blocks — use heading text and prose markdown
		const blockSummaries: string[] = (blockData ?? []).map((b: Record<string, unknown>) => {
			const content = b.content as Record<string, unknown> | undefined;
			if (!content) return "";
			const kind = (content.kind || content.type) as string;
			if (kind === "heading") return `## ${content.text}`;
			if (kind === "prose") return (content.markdown as string) ?? "";
			if (kind === "callout") return `[${(content.variant as string)?.toUpperCase() ?? "NOTE"}] ${content.markdown}`;
			if (kind === "quote") return `> ${content.markdown || content.text}`;
			if (kind === "code") return content.code ? `[code: ${content.filename ?? content.language ?? "snippet"}]` : "";
			return "";
		}).filter(Boolean);

		const courseLang = ((lesson as Record<string, unknown>)?.courses as { language?: string })?.language;
		const lang = hasThai ? "th" : (courseLang || "en");

		systemPrompt = socraticRecallPrompt({
			lessonTitle,
			outcomes,
			blockSummaries,
			language: lang,
		});
	} else {
		// Regular lesson/course chat
		let courseTitle: string | undefined;
		let lessonTitle: string | undefined;
		let courseLang: string | undefined;

		if (scope === "lesson") {
			const { data: lesson } = await supabase
				.from("lessons")
				.select("title, courses(title, language)")
				.eq("id", scopeId)
				.single();
			if (lesson) {
				lessonTitle = lesson.title;
				const c = (lesson as Record<string, unknown>).courses as { title: string; language?: string } | null;
				courseTitle = c?.title;
				courseLang = c?.language;
			}
		} else if (scope === "course") {
			const { data: course } = await supabase
				.from("courses")
				.select("title, language")
				.eq("id", scopeId)
				.single();
			if (course) {
				courseTitle = course.title;
				courseLang = course.language;
			}
		}

		const chatLang = hasThai ? "th" : (courseLang || "en");
		systemPrompt = chatPrompt({ courseTitle, lessonTitle, language: chatLang });
	}

	const selection = selectModel("chat", message.length);
	const model = requestedModel ?? selection.model;
	const provider = requestedModel
		? requestedModel.includes("/") ? "openrouter" as const : requestedModel.startsWith("gemini") ? "gemini" as const : "anthropic" as const
		: selection.provider;

	const stream = createSSEStream(async ({ send }) => {
		// Send threadId so client knows the ID if it was newly created
		send("meta", JSON.stringify({ threadId }));

		const textStream = await streamUnified(
			{ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, GEMINI_API_KEY: env.GEMINI_API_KEY, OPENROUTER_API_KEY: env.OPENROUTER_API_KEY, RATE_LIMIT_KV: env.RATE_LIMIT_KV },
			messages,
			{ model, provider, route: selection.route, system: systemPrompt, maxTokens: 4096 },
		);

		let fullResponse = "";
		const reader = textStream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			fullResponse += value;
			send("delta", value);
		}

		// Save assistant message (fire-and-forget is fine here but we await for data integrity)
		await supabase.from("chat_messages").insert({
			thread_id: threadId,
			role: "assistant",
			content: fullResponse,
		});

		send("end", "done");
	});

	return sseResponse(stream);
}
