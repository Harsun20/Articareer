import { rankActions, type ReadinessInput } from "@/lib/readiness/score";
import type { GapAnalysisRow } from "@/lib/readiness/data";

export function suggestReadinessActions(input:ReadinessInput,gaps:GapAnalysisRow[]){
 const candidates:{name:string;hours:number;apply:(current:ReadinessInput)=>ReadinessInput}[]=[];
 for(const gap of gaps.filter(row=>row.bucket!=="Nice-to-have"&&!row.evidenced).slice(0,6)){
  const group=input.mustHave.some(skill=>skill.name===gap.name)?"mustHave":"differentiators";
  const suggestedEvidence=gap.evidenceCandidates.length>0;
  if(suggestedEvidence){candidates.push({name:`Review and confirm ${gap.name} evidence`,hours:0.25,apply:current=>({...current,[group]:current[group].map(skill=>skill.name===gap.name?{...skill,evidenced:true}:skill)})});}
  candidates.push({name:`Build a ${gap.name} portfolio project`,hours:6,apply:current=>({...current,[group]:current[group].map(skill=>skill.name===gap.name?{...skill,evidenced:true}:skill),projects:[...current.projects,{completed:true,mappedToGap:true,artifact:true,metricMet:true}]})});
 }
 const types=new Set(input.interviewScores.map(session=>session.type));const missingTypes=["technical","behavioral","role-specific","project"].filter(type=>!types.has(type));
 if(input.interviewScores.length<3||missingTypes.length){const drills=Math.max(1,3-input.interviewScores.length);candidates.push({name:`Complete ${drills} scored mock interview${drills===1?"":"s"}${missingTypes.length?` (${missingTypes.slice(0,2).join(" + ")})`:""}`,hours:drills,apply:current=>({...current,interviewScores:[...current.interviewScores,...Array.from({length:drills},(_,index)=>({score:4,date:current.asOf,type:missingTypes[index%Math.max(1,missingTypes.length)]||"technical"}))]})});}
 if(input.resumeKeywordCoverage<65)candidates.push({name:"Align resume bullets to target-role requirements",hours:1,apply:current=>({...current,resumeKeywordCoverage:Math.min(65,current.resumeKeywordCoverage+15)})});
 if(input.postings<8)candidates.push({name:"Refresh target-role postings",hours:0.25,apply:current=>({...current,postings:Math.max(8,current.postings),recentPostings:Math.max(3,current.recentPostings)})});
 return rankActions(input,candidates).filter(action=>action.gain>0).slice(0,3);
}
