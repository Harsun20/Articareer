export function learningPlanPrompt(input: {
  role: string;
  seniority: string;
  industry: string;
  weeklyHours: number;
  gaps: { name: string; frequency: number; totalPostings: number; evidenced: boolean; bucket: string }[];
  completedDeliverables: string[];
}) {
  return `Draft a practical 8-week career transition plan for this target role. Use only the provided gap data and completed work; do not claim the user has experience they have not confirmed. Sequence prerequisites before advanced work, prioritize frequent must-have gaps, then differentiators, then interview preparation and focused application batches. Each week needs at least two concrete activities, useful resources, and one visible deliverable. Fit the total workload to the weekly time budget. Keep completed deliverables in mind and do not repeat them.\nTarget role: ${input.role}\nSeniority: ${input.seniority || "unspecified"}\nIndustry: ${input.industry || "unspecified"}\nAvailable hours per week: ${input.weeklyHours}\nObserved gaps (frequency is count of postings): ${JSON.stringify(input.gaps).slice(0, 9000)}\nCompleted deliverables: ${JSON.stringify(input.completedDeliverables).slice(0, 3000)}\nReturn a weeks array with unique week numbers 1 through 8.`;
}
