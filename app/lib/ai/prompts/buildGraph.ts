/**
 * Prompt for extracting conceptual relationships between courses
 * to build a knowledge graph.
 */

export interface BuildGraphInput {
  courses: { id: string; title: string; tags: string[]; description?: string | null; difficulty: string }[];
}

export function buildGraphPrompt(input: BuildGraphInput): string {
  const courseList = input.courses
    .map((c) => `- id: "${c.id}", title: "${c.title}", tags: [${c.tags.join(", ")}], difficulty: ${c.difficulty}`)
    .join("\n");

  return `You are a knowledge architect. Given a list of courses, identify meaningful conceptual relationships between them.

## Courses
${courseList}

## Rules
- Only create edges where there's a genuine conceptual connection
- Each relationship should have a clear, concise label
- Relationship types: "prerequisite" (A should come before B), "extends" (B deepens A), "complements" (A and B enrich each other), "applies" (A uses concepts from B)
- Strength is 0-1: 1.0 = essential connection, 0.5 = moderate, 0.2 = tangential
- Don't force connections — only include ones that would genuinely help a learner understand their knowledge map
- A course can have multiple relationships

## Output format
Return a JSON array of edges:
\`\`\`json
[
  {
    "from": "course-id-1",
    "to": "course-id-2",
    "relationship": "extends",
    "label": "short description of connection",
    "strength": 0.8
  }
]
\`\`\`

Return ONLY the JSON. If fewer than 2 courses exist or no meaningful connections can be made, return an empty array \`[]\`.`;
}
