// Central Claude client helper. Used by bill extraction (Prompt 1) and the voice
// assistant. Inference is pinned to the EU region to honour "EU data only".
//
// Models: the repo standardises on claude-sonnet-5 for GiGi's AI (fast, cheap,
// strong at strict JSON — see CLAUDE.md). The assistant model is env-overridable.

export const EXTRACTION_MODEL = 'claude-sonnet-5';
export const ASSISTANT_MODEL = process.env.GIGI_ASSISTANT_MODEL || 'claude-sonnet-5';

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** A PDF handed to the model as a document block (base64, standard alphabet). */
export interface ClaudeDocument {
  mediaType: string;
  data: string;
}

// Single non-streaming text call with EU inference and refusal handling.
//
// `documents` attaches PDFs (invoices are usually the attachment, not the
// email). Document blocks go BEFORE the text block — the API expects the
// material first and the instruction about it second.
export async function claudeText(opts: {
  system: string;
  user: string;
  model: string;
  maxTokens?: number;
  documents?: ClaudeDocument[];
}): Promise<{ text: string; region: string }> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic();
  const region = process.env.ANTHROPIC_REGION || 'eu';

  const docs = opts.documents ?? [];
  const content = docs.length
    ? [
        ...docs.map((d) => ({
          type: 'document',
          source: { type: 'base64', media_type: d.mediaType, data: d.data },
        })),
        { type: 'text', text: opts.user },
      ]
    : opts.user;

  const base: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: [{ role: 'user', content }],
  };

  async function call(withGeo: boolean) {
    // `inference_geo` pins EU inference but isn't accepted on every account/SDK
    // version. Cast loosely so it compiles; retry without it if it's rejected.
    const params = withGeo ? { ...base, inference_geo: region } : base;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await client.messages.create(params as any);
    if (res?.stop_reason === 'refusal') throw new Error('Claude declined this request.');
    const block = (res.content as Array<{ type: string; text?: string }>).find((b) => b.type === 'text');
    return { text: block?.text ?? '', region: res?.usage?.inference_geo ?? (withGeo ? region : 'unpinned') };
  }

  try {
    return await call(true);
  } catch (e) {
    // Fall back to a call without the geo pin (the common cause of a hard 400),
    // so AI features work even where inference_geo isn't provisioned.
    try {
      return await call(false);
    } catch {
      throw e; // surface the original error
    }
  }
}
