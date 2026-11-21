import { notFound } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import SignIn from "@/app/auth/page";
import { createClient } from "@/lib/supabase/server";
const pages:Record<string,string>={resume:"Resume",roles:"Target Roles",market:"Job Market",skills:"Skill Gaps",plan:"Learning Plan",portfolio:"Portfolio",interviews:"Interviews",applications:"Applications",readiness:"Readiness",settings:"Settings"};
export default async function Section({params}:{params:Promise<{section:string}>}){const {section}=await params;const page=pages[section];if(!page)notFound();const client=await createClient();if(!client)return <SignIn/>;const {data:{user}}=await client.auth.getUser();return user?<Dashboard page={page}/>:<SignIn/>}
