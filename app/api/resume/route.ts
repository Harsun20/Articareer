import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { generateJsonResult, redactPersonalData } from "@/lib/ai/client";
import { resumeNormalizationPrompt } from "@/lib/ai/prompts/resume";
import { ResumeExtractionSchema } from "@/lib/ai/schemas";
import { createClient } from "@/lib/supabase/server";
import { deterministicResumeParse, keepResumeEvidence, type ResumeTaxonomyItem } from "@/lib/resume/normalize";

export const runtime = "nodejs";
const DEFAULT_TAXONOMY: ResumeTaxonomyItem[] = [
  { canonical_skill: "SQL", aliases: ["Structured Query Language", "PostgreSQL", "T-SQL"] },
  { canonical_skill: "Python", aliases: ["Pandas", "NumPy", "Python programming"] },
  { canonical_skill: "Experiment design", aliases: ["A/B testing", "Experimental design", "Causal inference"] },
  { canonical_skill: "Statistics", aliases: ["Statistical analysis", "Probability"] },
  { canonical_skill: "Dashboard design", aliases: ["Data visualization", "Tableau", "Looker", "Power BI"] },
  { canonical_skill: "dbt", aliases: ["Data build tool", "dbt Core"] },
  { canonical_skill: "Stakeholder communication", aliases: ["Executive communication", "Cross-functional collaboration"] },
  { canonical_skill: "Product analytics", aliases: ["Product metrics", "Funnel analysis"] },
  { canonical_skill: "Git", aliases: ["Version control", "GitHub"] },
];

async function extract(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (file.type === "application/pdf") {
    const parser = (await import("pdf-parse")).default;
    return (await parser(buffer)).text.slice(0, 50000);
  }
  const mammoth = await import("mammoth");
  return (await mammoth.extractRawText({ buffer })).value.slice(0, 50000);
}

function canonicalSkill(name: string, taxonomy: ResumeTaxonomyItem[]) {
  const normalized = name.trim().replace(/\s+/g, " ");
  const match = taxonomy.find((item) => [item.canonical_skill, ...item.aliases].some((alias) => alias.toLowerCase() === normalized.toLowerCase()));
  return match?.canonical_skill || normalized;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Choose a PDF or DOCX under 10 MB" }, { status: 400 });
  if (!["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.type)) return NextResponse.json({ error: "Only PDF and DOCX files are accepted" }, { status: 400 });

  let rawText = "";
  try { rawText = await extract(file); }
  catch { return NextResponse.json({ error: "We could not read this file. Try exporting the resume as a searchable PDF or DOCX." }, { status: 422 }); }
  const client = await createClient();
  const requestedDemo = form.get("demoMode") === "true";
  const demo = requestedDemo || !client;
  let userId: string | undefined;
  if (!demo && client) {
    userId = (await client.auth.getUser()).data.user?.id;
    if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  let taxonomy = DEFAULT_TAXONOMY;
  if (client && userId) {
    const result = await client.from("skill_taxonomy").select("canonical_skill,aliases");
    if (!result.error && result.data?.length) taxonomy = result.data;
  }

  const safeText = redactPersonalData(rawText).slice(0, 30000);
  const deterministic = deterministicResumeParse(safeText, taxonomy);
  const normalized = await generateJsonResult(
    `resume-normalize:${createHash("sha256").update(safeText).digest("hex")}`,
    resumeNormalizationPrompt(safeText, deterministic),
    ResumeExtractionSchema,
    deterministic,
    { ...(client && userId ? { client, userId } : {}), forceFallback: demo },
  );
  const parsed = keepResumeEvidence(normalized.data, safeText);
  const skills = parsed.skills.map((skill) => ({ ...skill, canonical_skill: canonicalSkill(skill.name, taxonomy), source: "resume" as const, confirmed: false }));
  const message = normalized.source === "ai"
    ? "Gemini normalized your resume after local text extraction. Check every field and confirm skill evidence before it affects your gap map."
    : demo
      ? "Demo mode used local resume parsing. Review the sample extraction; nothing was saved to your account."
      : "Resume text was parsed locally because Gemini is unavailable or not configured. Review each field and confirm skill evidence before it affects your gap map.";

  if (demo || !client || !userId) return NextResponse.json({ demo: true, source: normalized.source, parsed, skills, message });
  const path = `${userId}/${randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: uploadError } = await client.storage.from("resumes").upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
  const label = String(form.get("label") || "General resume").slice(0, 80);
  const { data: row, error } = await client.from("resumes").insert({ user_id: userId, label, file_path: path, file_type: file.type, parsed, version: Date.now() }).select().single();
  if (error) {
    await client.storage.from("resumes").remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const savedSkills = await client.from("user_skills").insert(skills.map((skill) => ({ ...skill, user_id: userId, resume_id: row.id })));
  if (savedSkills.error) {
    await client.from("resumes").delete().eq("id", row.id).eq("user_id", userId);
    await client.storage.from("resumes").remove([path]);
    return NextResponse.json({ error: savedSkills.error.message }, { status: 500 });
  }
  return NextResponse.json({ resume: row, parsed, skills: skills.map((skill) => ({ ...skill, resume_id: row.id })), source: normalized.source, message }, { status: 201 });
}
