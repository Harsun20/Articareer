import { Dashboard } from "@/components/dashboard";
import SignIn from "@/app/auth/page";
import { createClient } from "@/lib/supabase/server";

export default async function Workspace(){
  const supabase=await createClient();
  if(!supabase)return <SignIn/>;
  const {data:{user}}=await supabase.auth.getUser();
  return user?<Dashboard/>:<SignIn/>;
}
