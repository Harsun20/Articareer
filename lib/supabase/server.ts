import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
export async function createClient(){const jar=await cookies();const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!url||!key)return null;return createServerClient(url,key,{cookies:{getAll(){return jar.getAll()},setAll(values:{name:string;value:string;options:CookieOptions}[]){try{values.forEach(({name,value,options})=>jar.set(name,value,options))}catch{}}}})}
