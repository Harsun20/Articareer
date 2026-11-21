import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const GeminiResponse = z.object({
  candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string() })) }) })).min(1),
  usageMetadata: z.object({ promptTokenCount: z.number().optional(), candidatesTokenCount: z.number().optional(), totalTokenCount: z.number().optional() }).optional(),
});
const buckets = new Map<string, { tokens: number; at: number }>();
export type AiSource = "ai" | "cache" | "fallback" | "demo";
export type AiContext = { client?: SupabaseClient; userId?: string; forceFallback?: boolean };

export function redactPersonalData(text: string) {
  const lines = text.split(/\r?\n/);
  const first = lines[0]?.trim() || "";
  const contactNearby = /@|\+?\d[\d\s().-]{7,}\d|linkedin\.com|github\.com|portfolio|\b(?:phone|mobile|email|address)\b/i.test(lines.slice(1, 5).join(" "));
  if (contactNearby && /^[A-Z][A-Z' -]{1,60}$/.test(first)) lines[0] = "[name removed]";
  return lines.join("\n")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email removed]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone removed]")
    .replace(/^\s*(?:full\s+name|name|home\s+address|street address|address)\s*[:\-].*$/gim, "[personal contact field removed]")
    .replace(/\b\d{1,6}\s+(?:[\w.'-]+\s+){1,4}(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd)\b[^\n]*/gi, "[street address removed]");
}

export async function generateJsonResult<T>(key: string, prompt: string, schema: z.ZodType<T>, fallback: T, context: AiContext = {}): Promise<{ data: T; source: AiSource }> {
  if (context.forceFallback || process.env.DEMO_MODE !== "false" || !process.env.GEMINI_API_KEY) return { data: fallback, source: context.forceFallback ? "demo" : "fallback" };
  const now = Date.now();
  const bucket = buckets.get("gemini") ?? { tokens: 5, at: now };
  bucket.tokens = Math.min(5, bucket.tokens + (now - bucket.at) / 12000);
  bucket.at = now;
  if (bucket.tokens < 1) return { data: fallback, source: "fallback" };
  bucket.tokens -= 1;
  buckets.set("gemini", bucket);

  const db = context.client ?? await createClient();
  let owner = context.userId;
  if (!owner && db) owner = (await db.auth.getUser()).data.user?.id;
  const scopedKey = owner ? `${owner}:${key}` : key;
  const { data: cached } = db && owner
    ? await db.from("ai_cache").select("response").eq("cache_key", scopedKey).eq("created_by", owner).gt("expires_at", new Date().toISOString()).maybeSingle()
    : { data: null };
  if (cached?.response) {
    const parsed = schema.safeParse(cached.response);
    if (parsed.success) return { data: parsed.data, source: "cache" };
  }

  const safePrompt = redactPersonalData(prompt);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: `${safePrompt}${attempt ? " Return corrected JSON only, strictly matching the requested schema." : ""}` }] }], generationConfig: { responseMimeType: "application/json" } }),
        signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) throw new Error(`Gemini ${response.status}`);
      const envelope = GeminiResponse.parse(await response.json());
      const raw = envelope.candidates[0].content.parts.map((part) => part.text).join("\n");
      let json: unknown;
      try { json = JSON.parse(raw); } catch { continue; }
      const parsed = schema.safeParse(json);
      if (!parsed.success) continue;
      if (db && owner) {
        await db.from("ai_cache").upsert({ cache_key: scopedKey, response: parsed.data, expires_at: new Date(Date.now() + 86400000).toISOString(), user_id: owner, created_by: owner }, { onConflict: "cache_key" });
        if (context.userId && context.client) {
          await db.rpc("record_user_api_usage", { p_user_id: owner, p_provider: "Gemini", p_tokens: envelope.usageMetadata?.totalTokenCount ?? 0, p_quota: Number(process.env.GEMINI_MONTHLY_QUOTA || 0) });
        } else {
          await db.rpc("record_api_usage", { p_provider: "Gemini", p_tokens: envelope.usageMetadata?.totalTokenCount ?? 0, p_quota: Number(process.env.GEMINI_MONTHLY_QUOTA || 0) });
        }
      }
      return { data: parsed.data, source: "ai" };
    } catch {
      if (attempt === 1) return { data: fallback, source: "fallback" };
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  return { data: fallback, source: "fallback" };
}

export async function generateJson<T>(key: string, prompt: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  return (await generateJsonResult(key, prompt, schema, fallback)).data;
}
