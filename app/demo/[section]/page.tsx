import { notFound } from "next/navigation";
import { Dashboard } from "@/components/dashboard";

const pages:Record<string,string>={resume:"Resume",roles:"Target Roles",market:"Job Market",skills:"Skill Gaps",plan:"Learning Plan",portfolio:"Portfolio",interviews:"Interviews",applications:"Applications",readiness:"Readiness",settings:"Settings"};
export function generateStaticParams(){return Object.keys(pages).map(section=>({section}))}
export default async function DemoSection({params}:{params:Promise<{section:string}>}){const {section}=await params;const page=pages[section];if(!page)notFound();return <Dashboard page={page} initialDemoMode/>;}
