import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadinessInput } from "@/lib/readiness/score";
import { priorityScore } from "@/lib/skills/priority";

export type GapPosting = { id:string;title:string;company:string|null;url:string;location:string|null;posted_at:string|null };
export type GapAnalysisRow = { name:string;frequency:number;totalPostings:number;priority:number;bucket:"Must-have"|"Differentiator"|"Nice-to-have";evidenced:boolean;evidence:string[];evidenceCandidates:string[];postings:GapPosting[] };

export async function loadReadinessData(client:SupabaseClient,userId:string,targetRoleId?:string):Promise<{input:ReadinessInput;gaps:GapAnalysisRow[]}>{
 const [postingsResult,requirementsResult,skillsResult,projectsResult,interviewsResult,applicationsResult,rolesResult,resumesResult]=await Promise.all([
  client.from("job_postings").select("id,title,company,url,location,posted_at,target_role_id").eq("user_id",userId).order("posted_at",{ascending:false}).limit(500),
  client.from("skill_requirements").select("posting_id,canonical_skill,importance,evidence").eq("user_id",userId),
  client.from("user_skills").select("id,resume_id,name,canonical_skill,level,evidence,confirmed").eq("user_id",userId),
  client.from("portfolio_projects").select("status,mapped_gaps,repo_url,demo_url,metric_met,target_role_id").eq("user_id",userId),
  client.from("interview_sessions").select("overall_score,question_type,created_at,target_role_id").eq("user_id",userId).not("overall_score","is",null),
  client.from("applications").select("id,response_at,outcome,stage,target_role_id").eq("user_id",userId),
  client.from("target_roles").select("id,location").eq("user_id",userId).eq("is_active",true),
  client.from("resumes").select("id,parsed").eq("user_id",userId)
 ]);
 const results=[postingsResult,requirementsResult,skillsResult,projectsResult,interviewsResult,applicationsResult,rolesResult,resumesResult];
 const failed=results.find(result=>result.error!==null);if(failed?.error)throw new Error(failed.error.message);
 const postings=(postingsResult.data||[]).filter(posting=>!targetRoleId||posting.target_role_id===targetRoleId);const requirements=requirementsResult.data||[];const skills=skillsResult.data||[];const confirmed=new Set(skills.filter(skill=>skill.confirmed).map(skill=>skill.canonical_skill.toLowerCase()));
 const postingMap=new Map(postings.map(posting=>[posting.id,posting]));const grouped=new Map<string,{ids:Set<string>;evidence:Set<string>;importance:Set<string>}>();
 for(const requirement of requirements){const key=requirement.canonical_skill.trim();if(!key||!postingMap.has(requirement.posting_id))continue;const group=grouped.get(key)||{ids:new Set<string>(),evidence:new Set<string>(),importance:new Set<string>()};group.ids.add(requirement.posting_id);if(requirement.evidence)group.evidence.add(requirement.evidence);group.importance.add(requirement.importance);grouped.set(key,group);}
 const gaps:GapAnalysisRow[]=[...grouped].map(([name,group])=>{const frequency=group.ids.size;const share=postings.length?frequency/postings.length:0;const bucket:GapAnalysisRow["bucket"]=share>=0.5?"Must-have":share>=0.25?"Differentiator":"Nice-to-have";const relevantSkills=skills.filter(skill=>skill.canonical_skill.toLowerCase()===name.toLowerCase());const hasEvidence=confirmed.has(name.toLowerCase());const timeToLearn=hasEvidence?15:65;const priority=priorityScore({postingFrequency:share*100,roleRelevance:group.importance.has("must-have")?80:55,userProximity:hasEvidence?100:0,timeToLearn});return{name,frequency,totalPostings:postings.length,priority,bucket,evidenced:hasEvidence,evidence:relevantSkills.filter(skill=>skill.confirmed).map(skill=>skill.evidence),evidenceCandidates:relevantSkills.filter(skill=>!skill.confirmed).map(skill=>skill.evidence),postings:[...group.ids].map(id=>postingMap.get(id)).filter((posting):posting is NonNullable<typeof posting>=>Boolean(posting))};}).sort((a,b)=>b.priority-a.priority);
 const mustHave=gaps.filter(gap=>gap.bucket==="Must-have").map(gap=>({name:gap.name,frequency:gap.frequency,evidenced:gap.evidenced}));
 const differentiators=gaps.filter(gap=>gap.bucket==="Differentiator").map(gap=>({name:gap.name,frequency:gap.frequency,evidenced:gap.evidenced}));
 const roleLocations=(rolesResult.data||[]).filter(role=>!targetRoleId||role.id===targetRoleId).map(role=>role.location?.trim().toLowerCase()).filter((location):location is string=>Boolean(location));
 const located=postings.filter(posting=>posting.location);const locationFit=located.length&&roleLocations.length?Math.round(located.filter(posting=>roleLocations.some(location=>posting.location!.toLowerCase().includes(location)||location.includes(posting.location!.toLowerCase()))).length/located.length*100):0;
 const recentCutoff=Date.now()-30*86400000;const recentPostings=postings.filter(posting=>posting.posted_at&&new Date(posting.posted_at).getTime()>=recentCutoff).length;
 const skillRows=[...mustHave,...differentiators];const keywordCoverage=skillRows.length?Math.round(skillRows.filter(skill=>skill.evidenced).length/skillRows.length*100):0;
 const unsupportedClaims=(resumesResult.data||[]).reduce((count,resume)=>{const parsed=resume.parsed as {skills?:{canonical_skill?:string;name?:string}[]}|null;const claims=parsed?.skills||[];return count+claims.filter(claim=>{const canonical=(claim.canonical_skill||claim.name||"").toLowerCase();return canonical&&!skills.some(skill=>skill.resume_id===resume.id&&skill.confirmed&&skill.canonical_skill.toLowerCase()===canonical)}).length;},0);
 const inRole=(record:{target_role_id:string|null})=>!targetRoleId||record.target_role_id===targetRoleId;const apps=(applicationsResult.data||[]).filter(inRole);const responded=apps.filter(application=>Boolean(application.response_at)||["recruiter screen","interview","offer","rejected","hired"].includes(application.stage.toLowerCase())||Boolean(application.outcome&&!["waiting","in progress","pending"].includes(application.outcome.toLowerCase()))).length;const responseRate=apps.length>=10?Math.round(responded/apps.length*100):null;
 const input:ReadinessInput={mustHave,differentiators,projects:(projectsResult.data||[]).filter(inRole).map(project=>({completed:project.status==="completed",mappedToGap:(project.mapped_gaps||[]).length>0,artifact:Boolean(project.repo_url||project.demo_url),metricMet:project.metric_met})),interviewScores:(interviewsResult.data||[]).filter(inRole).map(session=>({score:Number(session.overall_score),date:session.created_at,type:session.question_type})),applications:apps.length,responseRate,responseSampleSize:apps.length,resumeKeywordCoverage:keywordCoverage,unsupportedClaims,postings:postings.length,recentPostings,locationFit,asOf:new Date().toISOString()};
 return{input,gaps};
}
