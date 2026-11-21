import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AdzunaProvider, DemoJobProvider, FallbackJobProvider, JSearchProvider, type Job } from "@/lib/jobs/provider";
import { loadReadinessData } from "@/lib/readiness/data";
import { scoreReadiness } from "@/lib/readiness/score";

const monthStart=()=>{const date=new Date();return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1)).toISOString().slice(0,10)};

export async function GET(request:Request){
 const {searchParams}=new URL(request.url);const query=searchParams.get("query")||"product data analyst";const location=searchParams.get("location")||"Remote";const targetRoleId=searchParams.get("targetRoleId");
 if(process.env.DEMO_MODE!=="false"){const jobs=await new DemoJobProvider().search(query,location,1);return NextResponse.json({jobs,source:"Demo",remainingQuota:Number(process.env.JSEARCH_MONTHLY_QUOTA||200)});}
 const supabase=await createClient();if(!supabase)return NextResponse.json({error:"Live job collection requires Supabase sign-in."},{status:503});
 const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"Sign in to refresh postings."},{status:401});
 if(targetRoleId){const {data:role,error}=await supabase.from("target_roles").select("id").eq("id",targetRoleId).eq("user_id",user.id).eq("is_active",true).maybeSingle();if(error||!role)return NextResponse.json({error:"Choose one of your active target roles."},{status:400});}
 let cachedQuery=supabase.from("job_postings").select("title,company,url,location,raw_ad,source,fetched_at").eq("user_id",user.id).ilike("title",`%${query}%`).ilike("location",`%${location}%`).gte("fetched_at",new Date(Date.now()-7*86400000).toISOString());if(targetRoleId)cachedQuery=cachedQuery.eq("target_role_id",targetRoleId);const {data:cached,error:cacheError}=await cachedQuery.limit(50);
 if(cacheError)return NextResponse.json({error:cacheError.message},{status:500});
 if(cached?.length){const jobs=cached.map(posting=>({title:posting.title,company:posting.company||"Company",url:posting.url,location:posting.location||location,description:posting.raw_ad,source:posting.source as Job["source"]}));const {data:usage}=await supabase.from("api_usage").select("request_count").eq("user_id",user.id).eq("provider","JSearch").eq("period_start",monthStart()).maybeSingle();return NextResponse.json({jobs,source:"cache",remainingQuota:Math.max(0,Number(process.env.JSEARCH_MONTHLY_QUOTA||200)-(usage?.request_count||0))});}
 const quota=Number(process.env.JSEARCH_MONTHLY_QUOTA||200);const {data:usage}=await supabase.from("api_usage").select("request_count").eq("user_id",user.id).eq("provider","JSearch").eq("period_start",monthStart()).maybeSingle();const used=usage?.request_count||0;
 const jsearch=used<quota?new JSearchProvider(async()=>{const {error}=await supabase.rpc("record_api_usage",{p_provider:"JSearch",p_tokens:0,p_quota:quota});if(error)throw error;}):new AdzunaProvider();const provider=used<quota?new FallbackJobProvider(jsearch,new AdzunaProvider()):jsearch;
 try{
  const jobs=await provider.search(query,location,1);if(!jobs.length)return NextResponse.json({jobs,source:"none",remainingQuota:Math.max(0,quota-used)});
  const rows=jobs.map(job=>({user_id:user.id,target_role_id:targetRoleId||null,source:job.source,source_id:job.url,url:job.url,content_hash:createHash("sha256").update(job.url).digest("hex"),title:job.title,company:job.company,location:job.location,raw_ad:job.description,requirements:[],fetched_at:new Date().toISOString()}));
  const {data:stored,error:storeError}=await supabase.from("job_postings").upsert(rows,{onConflict:"user_id,content_hash"}).select("id,raw_ad,title");if(storeError)throw storeError;
  const {data:taxonomy,error:taxonomyError}=await supabase.from("skill_taxonomy").select("canonical_skill,aliases");if(taxonomyError)throw taxonomyError;
  const requirements=(stored||[]).flatMap(posting=>(taxonomy||[]).filter(skill=>[skill.canonical_skill,...skill.aliases].some(term=>`${posting.title} ${posting.raw_ad}`.toLowerCase().includes(term.toLowerCase()))).map(skill=>({user_id:user.id,posting_id:posting.id,canonical_skill:skill.canonical_skill,importance:"must-have",confidence:0.75,evidence:`Matched in posting: ${posting.title}`})));
  if(requirements.length){const {error}=await supabase.from("skill_requirements").upsert(requirements,{onConflict:"posting_id,canonical_skill"});if(error)throw error;}
  const overall=await loadReadinessData(supabase,user.id);const readiness=scoreReadiness(overall.input);const scoped=targetRoleId?await loadReadinessData(supabase,user.id,targetRoleId):null;const roleReadiness=scoped?{targetRoleId:targetRoleId!,title:query,...scoreReadiness(scoped.input)}:null;
  const snapshot=await supabase.from("readiness_scores").insert({user_id:user.id,target_role_id:null,score:readiness.score,score_low:readiness.low,score_high:readiness.high,component_breakdown:readiness.components,confidence:readiness.confidence,verdict:readiness.verdict,event_type:"job_refresh",change_summary:"Recalculated after collected job postings changed."});if(snapshot.error)throw snapshot.error;
  if(roleReadiness){const roleSnapshot=await supabase.from("readiness_scores").insert({user_id:user.id,target_role_id:targetRoleId,score:roleReadiness.score,score_low:roleReadiness.low,score_high:roleReadiness.high,component_breakdown:roleReadiness.components,confidence:roleReadiness.confidence,verdict:roleReadiness.verdict,event_type:"job_refresh",change_summary:`Recalculated for ${query} after collecting new postings.`});if(roleSnapshot.error)throw roleSnapshot.error;}
  return NextResponse.json({jobs,source:jobs[0]?.source??"none",remainingQuota:Math.max(0,quota-used-(used<quota?1:0)),readiness,readinessInput:overall.input,gaps:overall.gaps,roleReadiness});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to retrieve postings",jobs:[],remainingQuota:Math.max(0,quota-used)},{status:503});}
}
