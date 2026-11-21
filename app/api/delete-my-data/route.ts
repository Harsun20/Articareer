import { createClient as createAdmin } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSameOrigin } from "@/lib/security/origin";

export async function DELETE(request:Request){
  if(!hasSameOrigin(request))return NextResponse.json({error:"This request could not be verified."},{status:403});
  const supabase=await createClient();
  if(!supabase)return NextResponse.json({error:"Supabase is not configured."},{status:503});
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user)return NextResponse.json({error:"Sign in again before deleting your information."},{status:401});

  const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!serviceKey)return NextResponse.json({error:"Account deletion is unavailable because the server-side Supabase service key is not configured."},{status:503});
  const admin=createAdmin(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});

  try{
    const paths:string[]=[];
    for(let offset=0;;offset+=100){
      const {data,error}=await admin.storage.from("resumes").list(user.id,{limit:100,offset});
      if(error)throw new Error(`Could not list resume files: ${error.message}`);
      for(const file of data||[])paths.push(`${user.id}/${file.name}`);
      if(!data||data.length<100)break;
    }
    for(let start=0;start<paths.length;start+=100){
      const {error}=await admin.storage.from("resumes").remove(paths.slice(start,start+100));
      if(error)throw new Error(`Could not delete resume files: ${error.message}`);
    }
    const {error}=await admin.auth.admin.deleteUser(user.id);
    if(error)throw new Error(`Could not delete the account: ${error.message}`);
    await supabase.auth.signOut({scope:"local"});
    return NextResponse.json({ok:true});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Could not delete your information."},{status:500});
  }
}
