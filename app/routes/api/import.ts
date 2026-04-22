import type { Route } from "./+types/import";
import { requireAuth, slugify } from "~/lib/ai/helpers.server";
import { createServiceClient } from "~/lib/supabase.server";

export async function action({ request, context }: Route.ActionArgs) {
    const env = context.cloudflare.env as Record<string, string> & Env;
    if (request.method !== "POST") return Response.json({ message: "method not allowed" }, { status: 405 });
    const denied = await requireAuth(request, env);
    if (denied) return denied;

    const body = await request.json() as any;
    if (!body.course || !body.lessons) return Response.json({ message: "invalid import data" }, { status: 400 });

    const supabase = createServiceClient(env);
    const slug = slugify(body.course.title) || `imported-${Date.now().toString(36)}`;

    const { data: course, error } = await supabase.from("courses").insert({
        title: body.course.title, slug, subtitle: body.course.subtitle || null,
        description: body.course.description || null, source: "imported",
        language: body.course.language || "en", difficulty: body.course.difficulty || "beginner",
        estimated_minutes: body.course.estimated_minutes || null,
        tags: body.course.tags || [], cover_monogram: body.course.cover_monogram || null,
    }).select("id, slug").single();

    if (error || !course) return Response.json({ message: "failed to create course" }, { status: 500 });

    for (const lesson of body.lessons) {
        const { data: les } = await supabase.from("lessons").insert({
            course_id: course.id, title: lesson.title, summary: lesson.summary || null,
            outcomes: lesson.outcomes || [], order_index: lesson.order_index ?? 0,
            status: lesson.status || "ready",
        }).select("id").single();

        if (les && body.blocks) {
            const lessonBlocks = body.blocks.filter((b: any) => b.lesson_id === lesson.id);
            for (const block of lessonBlocks) {
                await supabase.from("lesson_blocks").insert({
                    lesson_id: les.id, order_index: block.order_index, kind: block.kind, content: block.content,
                });
            }
        }
    }
    return Response.json({ course }, { status: 201 });
}
