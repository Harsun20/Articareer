import { z } from "zod";

export const ResumeExtractionSchema = z.object({
  experience: z.array(z.object({ title: z.string(), company: z.string(), dates: z.string().optional(), evidence: z.string() })).max(30),
  education: z.array(z.object({ institution: z.string(), credential: z.string(), dates: z.string().optional(), evidence: z.string() })).max(20),
  projects: z.array(z.object({ name: z.string(), description: z.string(), evidence: z.string() })).max(30),
  tools: z.array(z.string()).max(60),
  achievements: z.array(z.object({ claim: z.string(), evidence: z.string() })).max(40),
  skills: z.array(z.object({ name: z.string(), level: z.enum(["beginner", "intermediate", "advanced", "expert"]), evidence: z.string() })).max(80),
});

export const JobRequirementExtractionSchema = z.object({
  requirements: z.array(z.object({
    postingIndex: z.number().int().min(0),
    skills: z.array(z.object({ skill: z.string().min(1).max(80), importance: z.enum(["must-have", "differentiator", "nice-to-have"]), evidence: z.string().min(1).max(500) })).max(40),
  })).max(20),
});

export const LearningPlanSchema = z.object({
  weeks: z.array(z.object({
    week: z.number().int().min(1).max(12),
    objective: z.string().min(5).max(180),
    activities: z.array(z.string().min(3).max(240)).min(2).max(6),
    resources: z.array(z.string().min(3).max(180)).max(4),
    deliverable: z.string().min(5).max(240),
  })).min(6).max(12),
}).superRefine(({ weeks }, context) => {
  const numbers = weeks.map((week) => week.week);
  if (new Set(numbers).size !== numbers.length) context.addIssue({ code: "custom", message: "Plan week numbers must be unique." });
});
