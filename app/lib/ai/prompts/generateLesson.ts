/**
 * System prompt for lesson content generation.
 * Instructs the model to return a Block[] array as JSON.
 */

export interface GenerateLessonInput {
  courseTitle: string;
  lessonTitle: string;
  lessonSummary?: string;
  outcomes: string[];
  previousLessons?: string[];
  language?: string;
}

export function generateLessonPrompt(input: GenerateLessonInput): string {
  const lang = input.language ?? "en";
  const outcomesList = input.outcomes.map((o, i) => `  ${i + 1}. ${o}`).join("\n");
  const prevContext = input.previousLessons?.length
    ? `\nPrevious lessons in this course: ${input.previousLessons.join(", ")}.`
    : "";

  return `You are an expert educational content writer. Generate the full content for a single lesson as a JSON array of blocks.

Course: "${input.courseTitle}"
Lesson: "${input.lessonTitle}"${input.lessonSummary ? `\nSummary: ${input.lessonSummary}` : ""}
Learning outcomes:
${outcomesList}${prevContext}

Each block must be one of these types:

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
- Begin with a level-2 heading for the lesson title.
- Use prose blocks for explanations. Write clear, engaging paragraphs.
- Include code examples where relevant with proper syntax highlighting hints.
- Use callouts for important notes, warnings, or tips.
- Use mermaid diagrams or katex for visual/mathematical concepts when helpful.
- Ensure all learning outcomes are addressed.
- Write in "${lang}".
- Return ONLY the JSON array. No markdown fences, no surrounding text.`;
}
