import { openai } from './client';

export async function getEmbedding(text: string): Promise<number[]> {
	try {
		const response = await openai.embeddings.create({
			model: 'text-embedding-3-small',
			input: text.replace(/\n/g, ' '),
		});

		return response.data[0].embedding;
	} catch (error) {
		console.error('Error generating embedding:', error);
		throw error;
	}
}
