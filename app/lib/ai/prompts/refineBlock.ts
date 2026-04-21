/**
 * System prompt for refining a single content block based on user instruction.
 */

export interface RefineBlockInput {
	blockType: string;
	blockContent: string;
	instruction: string;
}

export function refineBlockSystem(input: RefineBlockInput): string {
	return `You are an expert content editor for an online learning platform.

The user wants to revise a content block. Apply their instruction precisely.

Block type: "${input.blockType}"
Current content:
${input.blockContent}

User instruction: "${input.instruction}"

Return ONLY a JSON object (no markdown fences, no commentary):

{
  "block": { ... },       // The revised block, same schema as the input block type
  "rationale": string     // 1-2 sentences explaining what you changed and why
}

Keep the same block type unless the instruction explicitly asks to change it. Preserve any metadata fields that are not affected by the edit.`;
}
