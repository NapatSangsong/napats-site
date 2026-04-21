/**
 * System prompt for Hyper-Node deep-dive sub-lesson generation.
 * Generates a focused mini-lesson (3-5 blocks) on a specific term.
 */

export interface DeepDiveInput {
	term: string;
	context: string;
	lessonTitle: string;
	courseTitle: string;
	depth: number;
}

export function deepDivePrompt(input: DeepDiveInput): string {
	const depthDescriptions: Record<number, string> = {
		1: "Provide a clear, accessible explanation. Use analogies and practical examples. Aim for an intermediate audience.",
		2: "Go deeper into the mechanics and theory. Be more technical. Explain the underlying principles and edge cases.",
		3: "Get to the fundamental, first-principles level. Be rigorous and precise. Cover the mathematical or theoretical foundations if applicable.",
	};

	const depthGuidance = depthDescriptions[input.depth] || depthDescriptions[1];

	const hyperNodeGuidance = input.depth < 3
		? `- In prose blocks, identify 2-3 key technical terms or concepts and wrap them in <hyper> tags. Example: "The <hyper>gradient descent</hyper> algorithm iteratively adjusts..."
- Only mark terms that would genuinely benefit from deeper exploration — not common words.`
		: `- Do NOT use <hyper> tags at this depth level (maximum depth reached).`;

	return `You are an expert educator generating a focused deep-dive sub-lesson. The student clicked on the term "${input.term}" while reading a lesson and wants to understand it more deeply.

Course: "${input.courseTitle}"
Parent lesson: "${input.lessonTitle}"
Term to explain: "${input.term}"
Surrounding context: "${input.context}"
Depth level: ${input.depth} of 3

${depthGuidance}

Generate a JSON object with two fields:
1. "blocks": an array of 3-5 content blocks explaining "${input.term}" in depth
2. "hyperNodes": an array of 2-3 strings — key terms in your explanation that could be explored further (only if depth < 3, otherwise empty array)

Each block must be one of these types:
- { "type": "heading", "level": 3|4, "text": string }
- { "type": "prose", "markdown": string }
- { "type": "code", "language": string, "code": string, "filename"?: string, "caption"?: string }
- { "type": "callout", "variant": "info"|"warning"|"tip"|"danger", "title"?: string, "markdown": string }
- { "type": "katex", "expression": string, "display"?: boolean, "caption"?: string }
- { "type": "quote", "markdown": string, "attribution"?: string }

Guidelines:
- Start with a level-3 heading that names the concept.
- Keep it concise: 3-5 blocks maximum. This is a sub-lesson, not a full lesson.
- Maintain clear connection to the parent context — reference how this concept relates to what the student was reading.
- Use code examples, math, or diagrams where they genuinely help.
${hyperNodeGuidance}
- Return ONLY the JSON object. No markdown fences, no surrounding text.

Example output format:
{
  "blocks": [
    { "type": "heading", "level": 3, "text": "Understanding ${input.term}" },
    { "type": "prose", "markdown": "Explanation here with <hyper>key term</hyper> marked..." },
    { "type": "callout", "variant": "tip", "markdown": "A practical tip..." }
  ],
  "hyperNodes": ["key term", "another concept"]
}`;
}
