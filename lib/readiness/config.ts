export const READINESS_WEIGHTS = { skillCoverage: 0.3, portfolioEvidence: 0.2, interviewReadiness: 0.2, applicationQuality: 0.15, marketDemand: 0.15 } as const;
export type ReadinessComponent = keyof typeof READINESS_WEIGHTS;
