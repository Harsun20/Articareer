import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDemoReadinessInput } from "@/lib/readiness/demo";
import { loadReadinessData } from "@/lib/readiness/data";
import { scoreReadiness } from "@/lib/readiness/score";

export async function GET(){
 if(process.env.DEMO_MODE!=="false"){
  const input=getDemoReadinessInput();
  return NextResponse.json({source:"demo",input,gaps:[],...scoreReadiness(input)});
 }
 const client=await createClient();
 if(!client)return NextResponse.json({error:"Supabase is not configured"},{status:503});
 const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:"Sign in to calculate your readiness score"},{status:401});
 try{const {input,gaps}=await loadReadinessData(client,user.id);return NextResponse.json({source:"workspace",input,gaps,...scoreReadiness(input)});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not calculate readiness from workspace data"},{status:500});}
}
