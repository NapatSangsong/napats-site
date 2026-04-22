/**
 * POST /api/ai/generate-lesson
 * Generate lesson content blocks and stream them via SSE.
 * On completion, writes blocks to Supabase and marks lesson as ready.
 */
import type { Route } from "./+types/ai.generate-lesson";
import { GenerateLessonBody } from "~/lib/ai/schemas";
import { streamUnified } from "~/lib/ai/unified-client";
import { selectModel } from "~/lib/ai/router";
import { generateLessonPrompt } from "~/lib/ai/prompts/generateLesson";
import { createServiceClient } from "~/lib/supabase.server";
import { requireAuth, sseResponse, createSSEStream } from "~/lib/ai/helpers.server";

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;

	if (request.method !== "POST") {
		return Response.json({ message: "method not allowed" }, { status: 405 });
	}

	const denied = await requireAuth(request, env);
	if (denied) return denied;

	let body: ReturnType<typeof GenerateLessonBody.safeParse>;
	try {
		body = GenerateLessonBody.safeParse(await request.json());
	} catch {
		return Response.json({ message: "invalid json" }, { status: 400 });
	}
	if (!body.success) {
		return Response.json(
			{ message: "invalid request", errors: body.error.flatten() },
			{ status: 400 },
		);
	}

	const { lessonId, model: requestedModel } = body.data;
	const supabase = createServiceClient(env as unknown as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

	// Fetch lesson + course context
	const { data: lesson, error: lessonError } = await supabase
		.from("lessons")
		.select("id, title, summary, outcomes, order_index, course_id, courses(title, language)")
		.eq("id", lessonId)
		.single();

	if (lessonError || !lesson) {
		return Response.json({ message: "lesson not found" }, { status: 404 });
	}

	const course = (lesson as Record<string, unknown>).courses as {
		title: string;
		language: string;
	} | null;

	// Fetch previous lesson titles for context
	const { data: previousLessons } = await supabase
		.from("lessons")
		.select("title")
		.eq("course_id", lesson.course_id)
		.lt("order_index", lesson.order_index)
		.order("order_index", { ascending: true });

	const selection = selectModel("generateLesson");
	const model = requestedModel ?? selection.model;
	const provider = requestedModel
		? requestedModel.startsWith("gemini") ? "gemini" as const : "anthropic" as const
		: selection.provider;
	const systemPrompt = generateLessonPrompt({
		courseTitle: course?.title ?? "Untitled Course",
		lessonTitle: lesson.title,
		lessonSummary: lesson.summary ?? undefined,
		outcomes: (lesson.outcomes as string[]) ?? [],
		previousLessons: previousLessons?.map((l) => l.title) ?? [],
		language: course?.language,
	});

	const stream = createSSEStream(async ({ send }) => {
		const textStream = await streamUnified(
			{ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, GEMINI_API_KEY: env.GEMINI_API_KEY, OPENROUTER_API_KEY: env.OPENROUTER_API_KEY, RATE_LIMIT_KV: env.RATE_LIMIT_KV },
			[{ role: "user", content: `Generate the full lesson content for "${lesson.title}".` }],
			{ model, provider, route: selection.route, system: systemPrompt, maxTokens: 16384 },
		);

		// Accumulate full text
		let fullText = "";
		const reader = textStream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			fullText += value;
			send("delta", value);
		}

		// Parse blocks from accumulated JSON
		let blocks: Record<string, unknown>[];
		try {
			// Strip markdown fences if the AI wrapped the JSON
			let jsonStr = fullText.trim();
			const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
			if (fenceMatch) jsonStr = fenceMatch[1].trim();
			// Also try extracting a raw JSON array
			if (!jsonStr.startsWith("[")) {
				const arrMatch = jsonStr.match(/\[[\s\S]*\]/);
				if (arrMatch) jsonStr = arrMatch[0];
			}
			const parsed = JSON.parse(jsonStr);
			blocks = Array.isArray(parsed) ? parsed : [];
			if (blocks.length === 0) {
				send("error", JSON.stringify({ message: "AI returned empty block array" }));
				return;
			}
		} catch (err) {
			send("error", JSON.stringify({ message: "failed to parse generated blocks", detail: (err as Error).message, preview: fullText.slice(0, 200) }));
			return;
		}

		// Write blocks to Supabase (save raw AI output — no strict validation)
		const VALID_KINDS = new Set(["prose", "heading", "mermaid", "katex", "code", "interactive", "callout", "image", "quote"]);
		const blockRows = blocks
			.filter((block) => typeof block.type === "string" && VALID_KINDS.has(block.type))
			.map((block, idx) => ({
				lesson_id: lessonId,
				order_index: idx,
				kind: block.type as string,
				content: block,
			}));

		const { error: insertError } = await supabase
			.from("lesson_blocks")
			.insert(blockRows);

		if (insertError) {
			send("error", JSON.stringify({ message: "failed to save blocks" }));
			return;
		}

		// Update lesson status
		await supabase
			.from("lessons")
			.update({ status: "ready" })
			.eq("id", lessonId);

		send("end", "done");
	});

	return sseResponse(stream);
}
