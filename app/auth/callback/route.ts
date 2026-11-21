import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
export async function GET(request:NextRequest){
 const url=new URL(request.url);
 const code=url.searchParams.get("code");
 const destination=url.searchParams.get("next");
 const safeDestination=destination?.startsWith("/")&&!destination.startsWith("//")?destination:"/workspace";
 const response=NextResponse.redirect(new URL(safeDestination,request.url));
 const projectUrl=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
 const projectKey=process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!projectUrl||!projectKey||!code){response.headers.set("location",new URL("/auth?error=setup",request.url).toString());return response;}
 const supabase=createServerClient(projectUrl,projectKey,{cookies:{getAll:()=>request.cookies.getAll(),setAll(cookies:{name:string;value:string;options:CookieOptions}[]){cookies.forEach(({name,value,options})=>response.cookies.set(name,value,options));}}});
 const {error}=await supabase.auth.exchangeCodeForSession(code);
 if(error)response.headers.set("location",new URL("/auth?error=callback",request.url).toString());
 return response;
}
