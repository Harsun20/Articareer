import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { generateJsonResult } from "@/lib/ai/client";
import { interviewScoringPrompt } from "@/lib/ai/prompts/interview";
import { InterviewReviewSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { hasSameOrigin } from "@/lib/security/origin";

const RequestSchema=z.object({question:z.string().min(8).max(1200),answer:z.string().min(20).max(8000),questionType:z.enum(["technical","behavioral","role-specific","project"]).default("technical")});

export async function POST(request:Request){
  if(!hasSameOrigin(request))return NextResponse.json({error:"This request could not be verified."},{status:403});
  if(!request.headers.get("content-type")?.includes("application/json"))return NextResponse.json({error:"Send interview answers as JSON."},{status:415});
  const length=Number(request.headers.get("content-length")||0);
  if(length>16_384)return NextResponse.json({error:"The interview answer is too large."},{status:413});
  const isDemo=request.headers.get("x-articareer-demo")==="true"||process.env.DEMO_MODE!=="false";
  const client=isDemo?null:await createClient();
  let userId:string|undefined;
  if(!isDemo){
    if(!client)return NextResponse.json({error:"Sign in to score and save a mock interview."},{status:503});
    const {data:{user}}=await client.auth.getUser();
    if(!user)return NextResponse.json({error:"Sign in to score and save a mock interview."},{status:401});
    userId=user.id;
  }
  const parsed=RequestSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Add a question and an answer of at least 20 characters."},{status:400});
  const {question,answer,questionType}=parsed.data;
  const lower=answer.toLowerCase();
  const signal=(terms:string[])=>terms.some(term=>lower.includes(term));
  const baseline=Math.max(1,Math.min(5,Math.round(1+Math.min(4,answer.trim().split(/\s+/).length/45))));
  const scores={relevance:baseline,evidence:signal(["example","data","result","metric","%","project"])?Math.min(5,baseline+1):baseline,structure:signal(["first","then","finally","because","situation"])?Math.min(5,baseline+1):baseline,roleAlignment:signal(["product","customer","stakeholder","sql","analysis"])?Math.min(5,baseline+1):baseline,communication:baseline,technicalDepth:questionType==="technical"&&signal(["sql","query","experiment","metric","cohort"])?Math.min(5,baseline+1):baseline};
  const fallback={scores,strengths:["You gave a direct response to the prompt."],gaps:[...(answer.trim().split(/\s+/).length<60?["Add one concrete example and its measurable outcome."]:[]),...(Object.values(scores).some(x=>x<3)?["Connect your answer more closely to the target role."]:[])],sampleAnswer:answer.trim(),followUps:["What evidence would you use to validate that conclusion?","What would you do if the result were inconclusive?"]};
  const cacheKey=createHash("sha256").update(`${questionType}:${question}:${answer}`).digest("hex");
  const review=await generateJsonResult(cacheKey,interviewScoringPrompt(question,answer),InterviewReviewSchema,fallback,{...(client&&userId?{client,userId}:{}),forceFallback:isDemo});
  return NextResponse.json({review:review.data,source:review.source});
}
