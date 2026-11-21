import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSameOrigin } from "@/lib/security/origin";

const tables=["interview_answers","interview_sessions","readiness_actions","readiness_scores","response_insights","applications","portfolio_projects","learning_plan","skill_gaps","skill_requirements","user_skills","resumes","job_postings","target_roles","api_usage","user_corrections","ai_cache"] as const;

export async function DELETE(request:Request){
  if(!hasSameOrigin(request))return NextResponse.json({error:"This request could not be verified."},{status:403});
  const client=await createClient();
  if(!client)return NextResponse.json({error:"Supabase is not configured"},{status:503});
  const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"Sign in required"},{status:401});
  const files=await client.storage.from("resumes").list(user.id,{limit:100});
  if(files.error)return NextResponse.json({error:files.error.message},{status:500});
  if(files.data?.length){const removed=await client.storage.from("resumes").remove(files.data.map(file=>`${user.id}/${file.name}`));if(removed.error)return NextResponse.json({error:removed.error.message},{status:500});}
  for(const table of tables){
    const {error}=await client.from(table).delete().eq("user_id",user.id);
    if(error)return NextResponse.json({error:`Could not reset ${table}: ${error.message}`},{status:500});
  }
  const {error:cacheError}=await client.from("ai_cache").delete().eq("created_by",user.id);
  if(cacheError)return NextResponse.json({error:`Could not reset ai_cache: ${cacheError.message}`},{status:500});
  const {error}=await client.from("profiles").update({career_goal:null,constraints:{},preferred_locations:[],salary_min:null,salary_max:null,weekly_hours:5,updated_at:new Date().toISOString()}).eq("id",user.id);
  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({ok:true});
}
