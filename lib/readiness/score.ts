import { READINESS_WEIGHTS, type ReadinessComponent } from "./config";

export type ReadinessInput = {
  mustHave: { name: string; frequency: number; evidenced: boolean }[];
  differentiators: { name: string; frequency: number; evidenced: boolean }[];
  projects: { completed: boolean; mappedToGap: boolean; artifact: boolean; metricMet: boolean }[];
  interviewScores: { score: number; date: string; type: string }[];
  applications: number;
  resumeKeywordCoverage: number;
  unsupportedClaims: number;
  postings: number;
  recentPostings: number;
  locationFit: number;
  asOf: string;
};
export type ComponentBreakdown = { score: number; weight: number; inputs: Record<string, number | string | boolean>; evidence: string[]; missing: string[] };
export type ReadinessResult = { score: number; low: number; high: number; confidence: "Low" | "Medium" | "High"; verdict: string; rationale: string; components: Record<ReadinessComponent, ComponentBreakdown> };
const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));
const mean = (values: number[]) => values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;

export function scoreReadiness(input: ReadinessInput): ReadinessResult {
  const allSkills = [...input.mustHave, ...input.differentiators];
  const skillDenom = allSkills.reduce((s,x)=>s+Math.max(1,x.frequency),0);
  const skillCoverage = skillDenom ? 100*allSkills.reduce((s,x)=>s+(x.evidenced?Math.max(1,x.frequency):0),0)/skillDenom : 0;
  const projectUnits = input.projects.reduce((s,p)=>s+(p.completed&&p.mappedToGap ? 1+(p.artifact?0.75:0)+(p.metricMet?0.5:0) : 0),0);
  const portfolio = clamp(projectUnits/3*100);
  const interview = input.interviewScores;
  const recency = interview.map(i=>{ const ageDays=Math.max(0,(new Date(input.asOf).getTime()-new Date(i.date).getTime())/86400000); return (i.score/5*100)*Math.exp(-ageDays/180); });
  const typeCoverage = new Set(interview.map(x=>x.type)).size;
  const interviewScore = interview.length ? clamp(mean(recency)*(0.7+0.1*Math.min(3,typeCoverage)) * Math.min(1,interview.length/3)) : 0;
  const applicationQuality = clamp(input.resumeKeywordCoverage- Math.min(45,Math.max(0,input.unsupportedClaims)*15) + (input.applications>=10?Math.min(10,input.applications/2):0));
  const market = clamp(35+Math.min(35,input.postings*1.2)+Math.min(20,input.recentPostings*2)+clamp(input.locationFit)*0.1);
  const components: ReadinessResult["components"] = {
    skillCoverage:{score:skillCoverage,weight:READINESS_WEIGHTS.skillCoverage,inputs:{skills:allSkills.length,weightedEvidence:skillDenom?skillCoverage:0},evidence:allSkills.filter(x=>x.evidenced).map(x=>x.name),missing:allSkills.filter(x=>!x.evidenced).map(x=>x.name)},
    portfolioEvidence:{score:portfolio,weight:READINESS_WEIGHTS.portfolioEvidence,inputs:{mappedCompletedProjects:projectUnits},evidence:input.projects.filter(x=>x.completed&&x.mappedToGap).map((_,i)=>`Completed gap project ${i+1}`),missing:input.projects.filter(x=>!x.artifact||!x.metricMet).map((_,i)=>`Add artifact or success metric to project ${i+1}`)},
    interviewReadiness:{score:interviewScore,weight:READINESS_WEIGHTS.interviewReadiness,inputs:{sessions:interview.length,coveredTypes:typeCoverage,recencyWeightedAverage:Math.round(mean(recency))},evidence:interview.map(x=>`${x.type} interview (${x.score}/5)`),missing:interview.length<3?[`Complete ${3-interview.length} more scored mock interviews`]:[]},
    applicationQuality:{score:applicationQuality,weight:READINESS_WEIGHTS.applicationQuality,inputs:{resumeKeywordCoverage:input.resumeKeywordCoverage,unsupportedClaims:input.unsupportedClaims,applications:input.applications},evidence:input.resumeKeywordCoverage>=65?["Resume keyword coverage is at least 65%"]:[],missing:[...(input.resumeKeywordCoverage<65?["Improve resume alignment with target postings"]:[]),...(input.unsupportedClaims?[`${input.unsupportedClaims} unsupported claim(s) flagged`]:[])]},
    marketDemand:{score:market,weight:READINESS_WEIGHTS.marketDemand,inputs:{postings:input.postings,recentPostings:input.recentPostings,locationFit:input.locationFit},evidence:input.postings?[`${input.postings} collected postings`]:[],missing:input.postings<10?["Collect more target-role postings"]:[]}
  };
  const score=Math.round(Object.entries(components).reduce((s,[k,c])=>s+c.score*READINESS_WEIGHTS[k as ReadinessComponent],0));
  const confidence=input.postings>=20&&interview.length>=5&&input.applications>=10?"High":input.postings>=8&&interview.length>=2?"Medium":"Low";
  const width=confidence==="High"?5:confidence==="Medium"?10:18;
  const verdict=score<40?"Not yet":score<60?"Build first":score<75?"Nearly ready":"Ready to apply";
  return {score,low:Math.max(0,score-width),high:Math.min(100,score+width),confidence,verdict,rationale: score>=75?"Your evidence is aligned across the key readiness areas. Apply to well-matched roles while continuing to strengthen your portfolio and interview practice.":`You are ${verdict.toLowerCase()} for this target role. The strongest next step is to address the highest-frequency evidenced skill gaps and build proof through projects and practice.`,components};
}

export function rankActions(input: ReadinessInput, actions: {name:string;hours:number;apply:(i:ReadinessInput)=>ReadinessInput}[], current=scoreReadiness(input).score) {
  return actions.map(a=>({name:a.name,hours:a.hours,gain:Math.max(0,scoreReadiness(a.apply(input)).score-current),perHour:Math.max(0,scoreReadiness(a.apply(input)).score-current)/Math.max(0.5,a.hours)})).sort((a,b)=>b.perHour-a.perHour).slice(0,3);
}
