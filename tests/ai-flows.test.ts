import { describe, expect, it } from "vitest";
import { ResumeExtractionSchema, LearningPlanSchema, JobRequirementExtractionSchema } from "@/lib/ai/schemas";
import { deterministicResumeParse, keepResumeEvidence } from "@/lib/resume/normalize";
import { extractJobRequirements } from "@/lib/skills/requirements";
import { deterministicLearningPlan } from "@/lib/plan/generation";
import { redactPersonalData } from "@/lib/ai/client";

const taxonomy = [
  { canonical_skill: "SQL", aliases: ["PostgreSQL"] },
  { canonical_skill: "Python", aliases: ["Pandas"] },
];

describe("AI assisted career flows", () => {
  it("removes common resume contact details before any model prompt", () => {
    const result = redactPersonalData("JANE EXAMPLE\nEmail: jane@example.com · Phone: +1 555 222 3333\n42 Main Street");
    expect(result).not.toContain("JANE EXAMPLE");
    expect(result).not.toContain("jane@example.com");
    expect(result).not.toContain("555 222 3333");
    expect(result).not.toContain("42 Main Street");
  });

  it("normalizes resume sections deterministically and keeps only source-backed evidence", () => {
    const text = "Experience\nBuilt SQL reports that reduced manual work by 30%.\nEducation\nB.S. Computer Science | Lakeview University 2022\nSkills\nSQL, Python";
    const draft = deterministicResumeParse(text, taxonomy);
    expect(draft.skills.map((skill) => skill.name)).toEqual(["SQL", "Python"]);
    const filtered = keepResumeEvidence({ ...draft, skills: [...draft.skills, { name: "Go", level: "expert", evidence: "Invented evidence" }] }, text);
    expect(filtered.skills.map((skill) => skill.name)).toEqual(["SQL", "Python"]);
    expect(filtered.experience[0].evidence).toContain("30%");
  });

  it("validates every new Gemini output schema", () => {
    expect(ResumeExtractionSchema.safeParse({ experience: [], education: [], projects: [], tools: [], achievements: [], skills: [] }).success).toBe(true);
    expect(JobRequirementExtractionSchema.safeParse({ requirements: [{ postingIndex: 0, skills: [{ skill: "SQL", importance: "must-have", evidence: "SQL required" }] }] }).success).toBe(true);
    expect(LearningPlanSchema.safeParse({ weeks: Array.from({ length: 6 }, (_, i) => ({ week: i + 1, objective: "Learn and apply", activities: ["Study foundations", "Build an artifact"], resources: [], deliverable: "A visible project result" })) }).success).toBe(true);
    expect(LearningPlanSchema.safeParse({ weeks: [] }).success).toBe(false);
  });

  it("extracts taxonomy backed job requirements with a demo-safe deterministic fallback", async () => {
    const result = await extractJobRequirements([{ id: "p1", title: "Analyst", description: "SQL required. Python preferred." }], taxonomy, { forceFallback: true });
    expect(result.source).toBe("demo");
    expect(result.requirements.map((item) => item.canonical_skill)).toEqual(["SQL", "Python"]);
    expect(result.requirements.find((item) => item.canonical_skill === "SQL")?.importance).toBe("must-have");
  });

  it("builds a complete 8 week plan and uses gap priorities before practice and applications", () => {
    const plan = deterministicLearningPlan([
      { name: "SQL", frequency: 8, totalPostings: 10, evidenced: false, bucket: "Must-have" },
      { name: "Experiment design", frequency: 4, totalPostings: 10, evidenced: false, bucket: "Differentiator" },
    ], 5);
    expect(plan).toHaveLength(8);
    expect(plan[0].objective).toContain("SQL");
    expect(plan.some((week) => week.objective.toLowerCase().includes("application"))).toBe(true);
    expect(plan.every((week) => week.deliverable.length > 0)).toBe(true);
  });
});
