import { Dashboard } from "@/components/dashboard";
import SignIn from "@/app/auth/page";
import { createClient } from "@/lib/supabase/server";

export default async function Home(){
 const supabase=await createClient();
 if(supabase){const {data:{user}}=await supabase.auth.getUser();if(user)return <Dashboard/>;}
 return <SignIn/>;
}
