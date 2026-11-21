import type { z } from "zod";
import { LearningPlanSchema } from "@/lib/ai/schemas";

export type PlanWeek = z.infer<typeof LearningPlanSchema>["weeks"][number];
export type PlanGap = { name: string; frequency: number; totalPostings: number; evidenced: boolean; bucket: string };

export function deterministicLearningPlan(gaps: PlanGap[], weeklyHours: number, completedDeliverables: string[] = []): PlanWeek[] {
  const missing = gaps.filter((gap) => !gap.evidenced && gap.bucket !== "Nice-to-have").slice(0, 4);
  const weeks: PlanWeek[] = [];
  for (const [index, gap] of missing.entries()) {
    weeks.push({
      week: index + 1,
      objective: `Build verifiable evidence for ${gap.name}`,
      activities: [`Study ${gap.name} fundamentals for ${Math.max(1, Math.floor(weeklyHours / 3))} focused hours`, `Apply ${gap.name} to a real or public dataset relevant to the target role`, `Write a short explanation of the approach and limitations`],
      resources: [`Use a reputable ${gap.name} course or official documentation`, `Review example work from the target-role postings`],
      deliverable: `A small ${gap.name} artifact with a README, method, and result.`,
    });
  }
  const next = weeks.length + 1;
  weeks.push(
    { week: next, objective: "Turn a priority skill into portfolio evidence", activities: ["Choose a role-relevant question", "Build a focused artifact using confirmed skills", "Document assumptions and limitations"], resources: ["Public dataset documentation", "Portfolio README outline"], deliverable: completedDeliverables.includes("Portfolio project") ? "Extend the existing project with a new result or measurable improvement." : "A portfolio project with a public artifact and success measure." },
    { week: next + 1, objective: "Practice technical and role-specific interviews", activities: ["Complete a timed technical drill", "Explain the portfolio project in 90 seconds", "Review weak rubric areas and retry one answer"], resources: ["Saved job requirements", "Your project README and evidence"], deliverable: "Two recorded written answers and a reflection on feedback." },
    { week: next + 2, objective: "Practice behavioral stories using real evidence", activities: ["Choose two work or project examples", "Structure each story around context, action, and measurable result", "Check that every claim is supported by your experience"], resources: ["Mock interview feedback", "Confirmed resume evidence"], deliverable: "Two evidence-backed behavioral stories." },
    { week: next + 3, objective: "Run a focused application batch", activities: ["Select well-matched current roles", "Tailor resume wording truthfully to each posting", "Log applications and follow-up dates"], resources: ["Collected target postings", "Application tracker"], deliverable: "A reviewed batch of applications and an outcome review date." },
  );
  while (weeks.length < 8) {
    const week = weeks.length + 1;
    weeks.push({ week, objective: "Review evidence and refine your next step", activities: ["Review new role requirements", "Choose one remaining high-priority gap", "Update your plan based on actual outcomes"], resources: ["Skill gap map", "Application outcomes"], deliverable: "A short evidence review and next-week focus." });
  }
  return LearningPlanSchema.parse({ weeks }).weeks;
}
