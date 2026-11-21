import { ResumeExtractionSchema } from "@/lib/ai/schemas";
import type { z } from "zod";

export type ResumeProfile = z.infer<typeof ResumeExtractionSchema>;
export type ResumeTaxonomyItem = { canonical_skill: string; aliases: string[] };

const SECTION_NAMES: Record<string, string> = {
  experience: "experience", employment: "experience", "work experience": "experience", "professional experience": "experience", "work history": "experience",
  education: "education", academic: "education", "academic background": "education",
  projects: "projects", "personal projects": "projects", "selected projects": "projects",
  skills: "skills", "technical skills": "skills", tools: "skills", "technologies": "skills",
  achievements: "achievements", accomplishments: "achievements", certifications: "education",
};
const headings = new Set(Object.keys(SECTION_NAMES));

function sectionLines(text: string) {
  const result: Record<string, string[]> = {};
  let section = "other";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-•*▪]+\s*/, "");
    if (!line) continue;
    const key = line.replace(/[:|]+$/, "").trim().toLowerCase();
    if (headings.has(key)) { section = SECTION_NAMES[key]; continue; }
    (result[section] ||= []).push(line);
  }
  return result;
}

function exactEvidence(evidence: string, source: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  return evidence.trim().length >= 2 && normalize(source).includes(normalize(evidence));
}

export function deterministicResumeParse(text: string, taxonomy: ResumeTaxonomyItem[]): ResumeProfile {
  const sections = sectionLines(text);
  const lines = (name: string) => sections[name] || [];
  const experience = lines("experience").filter((line) => line.length >= 15).slice(0, 20).map((evidence) => {
    const parts = evidence.split(/\s*[|•–—]\s*/).filter(Boolean);
    const title = parts[0]?.slice(0, 120) || "Experience details";
    const company = parts.length > 1 ? parts[1].slice(0, 120) : "Not identified";
    const dates = evidence.match(/\b(?:19|20)\d{2}\s*(?:[-–—]|to)\s*(?:present|current|(?:19|20)\d{2})\b/i)?.[0];
    return { title, company, ...(dates ? { dates } : {}), evidence: evidence.slice(0, 400) };
  });
  const education = lines("education").filter((line) => line.length >= 5).slice(0, 15).map((evidence) => {
    const dates = evidence.match(/\b(?:19|20)\d{2}(?:\s*[-–—]\s*(?:present|(?:19|20)\d{2}))?\b/i)?.[0];
    const credential = /\b(bachelor|master|ph\.?d|associate|certificate|diploma|b\.?s\.|b\.?a\.|m\.?s\.|m\.?b\.?a\.)\b/i.exec(evidence)?.[0] || "Education";
    return { institution: evidence.slice(0, 160), credential, ...(dates ? { dates } : {}), evidence: evidence.slice(0, 400) };
  });
  const projects = lines("projects").filter((line) => line.length >= 12).slice(0, 20).map((evidence) => {
    const parts = evidence.split(/\s*[|:—-]\s*/);
    return { name: parts[0].slice(0, 120), description: evidence.slice(0, 300), evidence: evidence.slice(0, 400) };
  });
  const skills = taxonomy.flatMap((item) => {
    const matched = [item.canonical_skill, ...item.aliases].find((alias) => new RegExp(`(^|[^a-z0-9+#.])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9+#.])`, "i").test(text));
    if (!matched) return [];
    const evidence = text.split(/\r?\n/).find((line) => line.toLowerCase().includes(matched.toLowerCase()))?.trim() || matched;
    const level = /\b(lead|led|architect|expert|advanced|owned|designed|built|implemented)\b/i.test(evidence) ? "advanced" : "intermediate";
    return [{ name: item.canonical_skill, level: level as "advanced" | "intermediate", evidence: evidence.slice(0, 400) }];
  });
  const achievementLines = [...lines("achievements"), ...lines("experience"), ...lines("projects")].filter((line) => /\b\d+(?:\.\d+)?\s*(?:%|x|k|m|million|thousand|users|customers|hours|days|weeks|revenue|cost|increase|decrease)\b/i.test(line)).slice(0, 20);
  const tools = [...new Set([...lines("skills"), ...skills.map((skill) => skill.name)].flatMap((line) => line.split(/[,;|]/).map((term) => term.trim()).filter(Boolean)))].slice(0, 60);
  return ResumeExtractionSchema.parse({ experience, education, projects, tools, achievements: achievementLines.map((claim) => ({ claim: claim.slice(0, 240), evidence: claim.slice(0, 400) })), skills });
}

export function keepResumeEvidence(profile: ResumeProfile, source: string): ResumeProfile {
  return ResumeExtractionSchema.parse({
    ...profile,
    experience: profile.experience.filter((item) => exactEvidence(item.evidence, source)),
    education: profile.education.filter((item) => exactEvidence(item.evidence, source)),
    projects: profile.projects.filter((item) => exactEvidence(item.evidence, source)),
    achievements: profile.achievements.filter((item) => exactEvidence(item.evidence, source) && exactEvidence(item.claim, item.evidence)),
    skills: profile.skills.filter((item) => exactEvidence(item.evidence, source)),
    tools: profile.tools.filter((item) => exactEvidence(item, source)),
  });
}
