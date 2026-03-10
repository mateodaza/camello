import { generateText } from 'ai';
import { createLLMClient } from './openrouter-client.js';
import { MODEL_MAP } from '@camello/shared/constants';

export async function summarizeConversation(
  messages: Array<{ role: string; content: string }>,
  locale: string,
): Promise<string | null> {
  try {
    const client = createLLMClient();
    const conversationText = messages
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt =
      locale === 'es'
        ? `Resume esta conversación en 1-2 oraciones concisas. Enfócate en el tema principal y resultado:\n\n${conversationText}`
        : `Summarize this conversation in 1-2 concise sentences. Focus on the main topic and outcome:\n\n${conversationText}`;

    const { text } = await generateText({
      model: client(MODEL_MAP['fast']),
      prompt,
      maxTokens: 100,
    });

    return text.trim();
  } catch (err) {
    console.error('[summarizeConversation] LLM call failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}
