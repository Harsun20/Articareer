import SignIn from "@/app/auth/page";
import Onboarding from "@/components/onboarding";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage(){
 const client=await createClient();
 if(!client)return <SignIn/>;
 const {data:{user}}=await client.auth.getUser();
 return user?<Onboarding/>:<SignIn/>;
}
