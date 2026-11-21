import { createHash } from "node:crypto";
import { generateJsonResult, type AiContext, type AiSource } from "@/lib/ai/client";
import { jobRequirementPrompt, type RequirementTaxonomyItem } from "@/lib/ai/prompts/jobs";
import { JobRequirementExtractionSchema } from "@/lib/ai/schemas";

export type PostingForExtraction = { id: string; title: string; description: string };
export type ExtractedRequirement = { posting_id: string; canonical_skill: string; importance: "must-have" | "differentiator" | "nice-to-have"; confidence: number; evidence: string };

function exactExcerpt(excerpt: string, source: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  return excerpt.length >= 5 && normalize(source).includes(normalize(excerpt));
}

function canonicalize(name: string, taxonomy: RequirementTaxonomyItem[]) {
  const normalized = name.trim().replace(/\s+/g, " ");
  return taxonomy.find((item) => [item.canonical_skill, ...item.aliases].some((alias) => alias.toLowerCase() === normalized.toLowerCase()))?.canonical_skill || normalized;
}

function deterministic(posting: PostingForExtraction, taxonomy: RequirementTaxonomyItem[]): ExtractedRequirement[] {
  const text = `${posting.title}\n${posting.description}`;
  return taxonomy.flatMap((item) => {
    const matched = [item.canonical_skill, ...item.aliases].find((alias) => text.toLowerCase().includes(alias.toLowerCase()));
    if (!matched) return [];
    const evidence = text.split(/(?<=[.!?;\n])\s*/).find((line) => line.toLowerCase().includes(matched.toLowerCase()))?.trim().slice(0, 450) || matched;
    const lower = evidence.toLowerCase();
    const importance: ExtractedRequirement["importance"] = /\b(required|requirement|must have|minimum|proficiency in|experience with)\b/.test(lower)
      ? "must-have"
      : /\b(preferred|preferably|plus|bonus|desired|nice to have)\b/.test(lower) ? "nice-to-have" : "differentiator";
    return [{ posting_id: posting.id, canonical_skill: item.canonical_skill, importance, confidence: 0.65, evidence }];
  });
}

export async function extractJobRequirements(
  postings: PostingForExtraction[],
  taxonomy: RequirementTaxonomyItem[],
  context: AiContext = {},
): Promise<{ requirements: ExtractedRequirement[]; source: AiSource }> {
  const bounded = postings.slice(0, 20);
  const schema = JobRequirementExtractionSchema.superRefine((value, validation) => {
    for (const item of value.requirements) if (item.postingIndex >= bounded.length) validation.addIssue({ code: "custom", message: "Posting index is out of range." });
  });
  const fallback = bounded.flatMap((posting) => deterministic(posting, taxonomy));
  if (!bounded.length) return { requirements: [], source: "fallback" };
  const key = createHash("sha256").update(JSON.stringify(bounded.map(({ title, description }) => ({ title, description })))).digest("hex");
  const result = await generateJsonResult(
    `job-requirements:${key}`,
    jobRequirementPrompt(bounded, taxonomy),
    schema,
    { requirements: bounded.flatMap((posting, postingIndex) => deterministic(posting, taxonomy).map((requirement) => ({ postingIndex, skills: [{ skill: requirement.canonical_skill, importance: requirement.importance, evidence: requirement.evidence }] }))) },
    context,
  );
  if (result.source === "fallback" || result.source === "demo") return { requirements: fallback, source: result.source };
  const byIndex = new Map(result.data.requirements.map((item) => [item.postingIndex, item.skills]));
  const extracted = bounded.flatMap((posting, postingIndex) => {
    const items = byIndex.get(postingIndex) || [];
    const accepted = items.filter((item) => exactExcerpt(item.evidence, `${posting.title}\n${posting.description}`));
    const unique = new Map<string, ExtractedRequirement>();
    for (const item of accepted) {
      const canonical = canonicalize(item.skill, taxonomy);
      if (!canonical) continue;
      unique.set(canonical.toLowerCase(), { posting_id: posting.id, canonical_skill: canonical, importance: item.importance, confidence: result.source === "cache" ? 0.85 : 0.9, evidence: item.evidence });
    }
    return unique.size ? [...unique.values()] : deterministic(posting, taxonomy);
  });
  return { requirements: extracted, source: result.source };
}
