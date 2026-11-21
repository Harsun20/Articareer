import { NextResponse } from "next/server";
export async function POST(request:Request){if(!process.env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json({ok:true,message:"Refresh worker endpoint is ready; connected users are refreshed by deployment scheduling."});}
