import { NextResponse } from "next/server";
import { z } from "zod";

const AuthSettingsSchema=z.object({external:z.object({google:z.boolean().optional()}).passthrough()}).passthrough();

export async function GET(){
  const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)return NextResponse.json({googleEnabled:false,configured:false});
  try{
    const response=await fetch(`${url.replace(/\/$/,"")}/auth/v1/settings`,{headers:{apikey:key},next:{revalidate:60}});
    if(!response.ok)return NextResponse.json({googleEnabled:false,configured:true});
    const settings=AuthSettingsSchema.safeParse(await response.json());
    return NextResponse.json({googleEnabled:settings.success&&settings.data.external.google===true,configured:true});
  }catch{return NextResponse.json({googleEnabled:false,configured:true});}
}
