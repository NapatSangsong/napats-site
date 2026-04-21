/**
 * System prompt for perspective-shifted lesson content generation.
 * Reframes existing lesson content through a scientific/analytical lens.
 */

export type Perspective = "evolutionary" | "neuro" | "philosopher" | "default";

export interface PerspectiveLessonInput {
  courseTitle: string;
  lessonTitle: string;
  lessonSummary?: string;
  outcomes: string[];
  perspective: Perspective;
  language?: string;
}

const PERSONAS: Record<Exclude<Perspective, "default">, string> = {
  evolutionary:
    "You are an evolutionary biologist. Frame all concepts through natural selection, adaptation, fitness landscapes, and evolutionary pressures. Use terminology from evolutionary biology. Reference relevant evolutionary mechanisms and draw parallels to biological systems.",
  neuro:
    "You are a neuro-engineer. Frame all concepts through neural circuitry, signal processing, systems architecture, and computational neuroscience. Use terminology from neuroscience and engineering. Draw parallels to brain structures and neural pathways.",
  philosopher:
    "You are a philosopher of mind and science. Frame all concepts through consciousness, phenomenology, epistemology, and ontological analysis. Use philosophical frameworks and thought experiments. Question assumptions and explore deeper implications.",
};

export function perspectiveLessonPrompt(input: PerspectiveLessonInput): string {
  const lang = input.language ?? "en";
  const outcomesList = input.outcomes.map((o, i) => `  ${i + 1}. ${o}`).join("\n");

  if (input.perspective === "default") {
    // Fallback — shouldn't normally be called for default
    return `You are an expert educational content writer. Generate the full content for a single lesson as a JSON array of blocks.

Course: "${input.courseTitle}"
Lesson: "${input.lessonTitle}"${input.lessonSummary ? `\nSummary: ${input.lessonSummary}` : ""}
Learning outcomes:
${outcomesList}

Return ONLY the JSON array. No markdown fences, no surrounding text.`;
  }

  const persona = PERSONAS[input.perspective];

  return `${persona}

You are also an expert educational content writer. Your task: rewrite the full content for a single lesson, naturally weaving your perspective and terminology throughout every explanation. Do NOT simply add a disclaimer or intro paragraph about the perspective — instead, let the lens permeate every concept, analogy, example, and diagram.

Course: "${input.courseTitle}"
Lesson: "${input.lessonTitle}"${input.lessonSummary ? `\nSummary: ${input.lessonSummary}` : ""}
Learning outcomes (address all of them, but reframe the approach through your perspective):
${outcomesList}

Generate the lesson as a JSON array of blocks. Each block must be one of these types:

- { "type": "heading", "level": 2|3|4, "text": string }
- { "type": "prose", "markdown": string }
- { "type": "code", "language": string, "code": string, "filename"?: string, "caption"?: string }
- { "type": "callout", "variant": "info"|"warning"|"tip"|"danger", "title"?: string, "markdown": string }
- { "type": "katex", "expression": string, "display"?: boolean, "caption"?: string }
- { "type": "mermaid", "code": string, "caption"?: string }
- { "type": "image", "src": string, "alt": string, "caption"?: string }
- { "type": "quote", "markdown": string, "attribution"?: string }
- { "type": "interactive", "widget": string, "props": object }

Guidelines:
- Begin with a level-2 heading for the lesson title, subtly hinting at your perspective.
- Use prose blocks for explanations. Write clear, engaging paragraphs steeped in your disciplinary language.
- Include code examples where relevant with proper syntax highlighting hints.
- Use callouts for important notes, warnings, or tips — frame them through your lens.
- Include at least one mermaid diagram that visualises the core concept through your perspective's framework.
- Use quotes from notable figures in your field when relevant.
- Ensure all learning outcomes are addressed.
- Write in "${lang}".
- Return ONLY the JSON array. No markdown fences, no surrounding text.`;
}
