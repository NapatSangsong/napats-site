/**
 * System prompt for lesson content generation.
 * Instructs the model to return a Block[] array as JSON.
 * Enforces mental model visualization and hyper-node term marking.
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
- Ensure all learning outcomes are addressed.
- Write in "${lang}".
- Return ONLY the JSON array. No markdown fences, no surrounding text.

## MANDATORY: Concept Map (Mental Model Visualization)
IMMEDIATELY after the lesson title heading, include a Mermaid diagram block that maps out the key concepts and their relationships for this lesson. This "concept map" should:
- Show the main topic at the center
- Branch out to sub-concepts, relationships, and dependencies
- Use clear, concise labels
- Use appropriate Mermaid syntax (flowchart TD, mindmap, or graph LR — pick what fits best)
- Caption it as "Concept Map — {lesson title}"

Example:
{ "type": "mermaid", "code": "graph TD\\n  A[Main Concept] --> B[Sub-concept 1]\\n  A --> C[Sub-concept 2]\\n  B --> D[Detail]", "caption": "Concept Map — Introduction to X" }

Additionally, if the lesson involves processes, hierarchies, or causal chains, include ADDITIONAL Mermaid diagrams at the relevant points in the content (not just the concept map). Aim for at least 2 Mermaid diagrams per lesson.

## MANDATORY: Hyper-Node Terms
In prose blocks, identify 3-5 key technical terms or concepts that would benefit from deeper exploration and wrap them in \`<hyper>\` tags.

Example: "The process of <hyper>photosynthesis</hyper> converts light energy into chemical energy through a series of <hyper>electron transport chains</hyper>."

Rules for hyper-nodes:
- Only mark terms that are genuinely complex or foundational
- Don't mark common words or simple concepts
- Spread them throughout the lesson — not all in one paragraph
- These will become clickable deep-dive links for the student`;
}
