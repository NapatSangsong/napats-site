import type { Route } from "./+types/export";
import { requireAuth } from "~/lib/ai/helpers.server";
import { createServiceClient } from "~/lib/supabase.server";

export async function loader({ request, context }: Route.LoaderArgs) {
    const env = context.cloudflare.env as Record<string, string> & Env;
    const denied = await requireAuth(request, env);
    if (denied) return denied;

    const url = new URL(request.url);
    const courseId = url.searchParams.get("courseId");
    const format = url.searchParams.get("format") || "json";
    if (!courseId) return Response.json({ message: "courseId required" }, { status: 400 });

    const supabase = createServiceClient(env);

    const { data: course } = await supabase.from("courses").select("*").eq("id", courseId).single();
    if (!course) return Response.json({ message: "not found" }, { status: 404 });

    const { data: lessons } = await supabase.from("lessons").select("*").eq("course_id", courseId).order("order_index");
    const { data: blocks } = await supabase.from("lesson_blocks").select("*").in("lesson_id", (lessons || []).map(l => l.id)).order("order_index");
    const { data: notes } = await supabase.from("lesson_notes").select("*").in("lesson_id", (lessons || []).map(l => l.id));
    const { data: progress } = await supabase.from("lesson_progress").select("*").in("lesson_id", (lessons || []).map(l => l.id));

    if (format === "json") {
        const exported = { version: 1, exportedAt: new Date().toISOString(), course, lessons, blocks, notes, progress };
        return new Response(JSON.stringify(exported, null, 2), {
            headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${course.slug}.json"` },
        });
    }

    if (format === "md") {
        let md = `# ${course.title}\n\n${course.description || ""}\n\n---\n\n`;
        for (const lesson of (lessons || [])) {
            md += `## Lesson ${lesson.order_index}: ${lesson.title}\n\n`;
            const lessonBlocks = (blocks || []).filter(b => b.lesson_id === lesson.id);
            for (const block of lessonBlocks) {
                const c = block.content as any;
                if (c.type === "heading") md += `${"#".repeat(c.level || 2)} ${c.text}\n\n`;
                else if (c.type === "prose") md += `${c.markdown}\n\n`;
                else if (c.type === "code") md += "```" + (c.language || "") + "\n" + (c.code || "") + "\n```\n\n";
                else if (c.type === "callout") md += `> **${(c.variant || "note").toUpperCase()}:** ${c.markdown}\n\n`;
                else if (c.type === "quote") md += `> ${c.markdown || c.text}\n> — ${c.attribution || ""}\n\n`;
                else if (c.type === "mermaid") md += "```mermaid\n" + (c.code || c.diagram || "") + "\n```\n\n";
                else if (c.type === "katex") md += `$$${c.expression || c.latex}$$\n\n`;
            }
            md += "---\n\n";
        }
        return new Response(md, {
            headers: { "Content-Type": "text/markdown", "Content-Disposition": `attachment; filename="${course.slug}.md"` },
        });
    }

    return Response.json({ message: "unsupported format" }, { status: 400 });
}
