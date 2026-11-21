import { demoJobs,demoSkills } from "@/lib/demo-data";
import type { ReadinessInput } from "@/lib/readiness/score";

export function getDemoReadinessInput(asOf=new Date()):ReadinessInput{
 const counts=new Map<string,number>();for(const job of demoJobs)for(const alias of job.skills){const skill=alias==="A/B testing"?"Experiment design":alias;counts.set(skill,(counts.get(skill)||0)+1)}
 const all=[...counts].map(([name,frequency])=>({name,frequency,evidenced:demoSkills.some(skill=>skill.canonical_skill===name&&skill.confirmed)}));
 const bucket=(frequency:number):"must"|"differentiator"|"nice"=>frequency/demoJobs.length>=.5?"must":frequency/demoJobs.length>=.25?"differentiator":"nice";
 const mustHave=all.filter(skill=>bucket(skill.frequency)==="must");const differentiators=all.filter(skill=>bucket(skill.frequency)==="differentiator");const aligned=[...mustHave,...differentiators];
 return{mustHave,differentiators,projects:[{completed:true,mappedToGap:true,artifact:true,metricMet:true}],interviewScores:[{score:3.8,date:new Date(asOf.getTime()-6*86400000).toISOString(),type:"technical"},{score:4.1,date:new Date(asOf.getTime()-3*86400000).toISOString(),type:"behavioral"}],applications:3,resumeKeywordCoverage:aligned.length?Math.round(aligned.filter(skill=>skill.evidenced).length/aligned.length*100):0,unsupportedClaims:0,postings:demoJobs.length,recentPostings:demoJobs.length,locationFit:100,asOf:asOf.toISOString()};
}
