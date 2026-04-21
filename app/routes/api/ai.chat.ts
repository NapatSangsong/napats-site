/**
 * POST /api/ai/chat
 * Streaming chat endpoint with thread persistence.
 */
import type { Route } from "./+types/ai.chat";
import { ChatBody } from "~/lib/ai/schemas";
import { streamChat, type ChatMessage } from "~/lib/ai/client";
import { selectModel } from "~/lib/ai/router";
import { chatPrompt } from "~/lib/ai/prompts/chat";
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

	// Resolve scope context for system prompt
	let courseTitle: string | undefined;
	let lessonTitle: string | undefined;

	if (scope === "lesson") {
		const { data: lesson } = await supabase
			.from("lessons")
			.select("title, courses(title)")
			.eq("id", scopeId)
			.single();
		if (lesson) {
			lessonTitle = lesson.title;
			courseTitle = (lesson as Record<string, unknown>).courses
				? ((lesson as Record<string, unknown>).courses as { title: string }).title
				: undefined;
		}
	} else if (scope === "course") {
		const { data: course } = await supabase
			.from("courses")
			.select("title")
			.eq("id", scopeId)
			.single();
		if (course) courseTitle = course.title;
	}

	const model = requestedModel ?? selectModel("chat", message.length);
	const systemPrompt = chatPrompt({ courseTitle, lessonTitle });

	const stream = createSSEStream(async ({ send }) => {
		// Send threadId so client knows the ID if it was newly created
		send("meta", JSON.stringify({ threadId }));

		const textStream = await streamChat(
			{ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
			messages,
			{ model, system: systemPrompt, maxTokens: 4096 },
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
			token_count_estimate: Math.ceil(fullResponse.length / 4),
		});

		send("end", "done");
	});

	return sseResponse(stream);
}
