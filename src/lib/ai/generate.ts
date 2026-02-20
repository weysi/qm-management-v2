import { openai } from './client';
import type { Client, ManualSection } from '@/lib/schemas';
import { buildSectionPrompt } from './prompts';

export async function generateSectionContent(
	section: ManualSection,
	client: Client,
): Promise<{ content: string; tokensUsed: number }> {
	const { system, user } = buildSectionPrompt(section, client);

	const response = await openai.chat.completions.create({
		model: 'gpt-4o-mini',
		messages: [
			{ role: 'system', content: system },
			{ role: 'user', content: user },
		],
		temperature: 0.4,
		max_tokens: 2000,
	});

	const content = response.choices[0]?.message?.content ?? '';
	const tokensUsed = response.usage?.total_tokens ?? 0;

	return { content, tokensUsed };
}
