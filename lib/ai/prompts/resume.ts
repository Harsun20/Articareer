import type { z } from "zod";
import type { ResumeExtractionSchema } from "@/lib/ai/schemas";

export const resumeNormalizationPrompt = (text: string, deterministic: z.infer<typeof ResumeExtractionSchema>) =>
  `Normalize this resume into the requested structured JSON using the deterministic draft and source text. Do not add jobs, employers, degrees, dates, tools, skills, achievements, metrics, or project details that are not present. Keep evidence fields as short verbatim excerpts copied from the source text. If a field is uncertain, omit it. Skills must be supported by an evidence excerpt. The deterministic draft is a first pass, not a claim of truth.\nDeterministic draft:\n${JSON.stringify(deterministic).slice(0, 8000)}\nRedacted source text:\n${text.slice(0, 16000)}`;
