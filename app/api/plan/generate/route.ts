import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { generateJsonResult } from "@/lib/ai/client";
import { learningPlanPrompt } from "@/lib/ai/prompts/plan";
import { LearningPlanSchema } from "@/lib/ai/schemas";
import { deterministicLearningPlan, type PlanGap } from "@/lib/plan/generation";
import { loadReadinessData } from "@/lib/readiness/data";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const RequestSchema = z.object({
  targetRoleId: z.string().optional(),
  targetRoleTitle: z.string().min(1).max(120).optional(),
  weeklyHours: z.number().int().min(1).max(80).default(5),
  gaps: z.array(z.object({ name: z.string().min(1), frequency: z.number().nonnegative(), totalPostings: z.number().nonnegative(), evidenced: z.boolean(), bucket: z.string() })).max(80).optional(),
});
const COMPLETE = new Set(["completed", "in-progress", "in_progress"]);

export async function POST(request: Request) {
  const parsedRequest = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedRequest.success) return NextResponse.json({ error: "Choose a valid target role and weekly time budget." }, { status: 400 });
  const body = parsedRequest.data;
  const isDemo = request.headers.get("x-articareer-demo") === "true";
  if (isDemo) {
    const gaps = body.gaps || [];
    const weeks = deterministicLearningPlan(gaps, body.weeklyHours);
    return NextResponse.json({ source: "demo", persisted: false, weeks, message: "Demo plan generated from the sample gap map. It was not saved to an account." });
  }

  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Sign in and configure Supabase to save a personalized learning plan." }, { status: 503 });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to generate and save a learning plan." }, { status: 401 });
  if (!body.targetRoleId) return NextResponse.json({ error: "Select one of your saved target roles first." }, { status: 400 });
  const { data: role, error: roleError } = await client.from("target_roles").select("id,title,seniority,industry").eq("id", body.targetRoleId).eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (roleError || !role) return NextResponse.json({ error: "That target role is not active in your account." }, { status: 404 });
  const [{ data: profile, error: profileError }, existingResult, analysis] = await Promise.all([
    client.from("profiles").select("weekly_hours").eq("id", user.id).maybeSingle(),
    client.from("learning_plan").select("*").eq("user_id", user.id).eq("target_role_id", role.id).order("week"),
    loadReadinessData(client, user.id, role.id),
  ]);
  if (profileError || existingResult.error) return NextResponse.json({ error: profileError?.message || existingResult.error?.message || "Unable to load plan inputs." }, { status: 500 });
  const weeklyHours = profile?.weekly_hours || body.weeklyHours;
  const gaps: PlanGap[] = analysis.gaps.map(({ name, frequency, totalPostings, evidenced, bucket }) => ({ name, frequency, totalPostings, evidenced, bucket }));
  const previous = existingResult.data || [];
  const completedDeliverables = previous.filter((task) => task.status === "completed").map((task) => task.deliverable);
  const fallback = { weeks: deterministicLearningPlan(gaps, weeklyHours, completedDeliverables) };
  const hash = createHash("sha256").update(JSON.stringify({ role: role.title, seniority: role.seniority, industry: role.industry, weeklyHours, gaps, completedDeliverables })).digest("hex");
  const generated = await generateJsonResult(
    `learning-plan:${hash}`,
    learningPlanPrompt({ role: role.title, seniority: role.seniority || "", industry: role.industry || "", weeklyHours, gaps, completedDeliverables }),
    LearningPlanSchema,
    fallback,
    { client, userId: user.id },
  );
  const keepIds = new Set<string>();
  const plan: Record<string, unknown>[] = [];
  for (const week of generated.data.weeks) {
    const sameWeek = previous.filter((task) => task.week === week.week);
    const preserved = sameWeek.find((task) => COMPLETE.has(task.status));
    if (preserved) {
      keepIds.add(preserved.id);
      plan.push(preserved);
      continue;
    }
    const pending = sameWeek.find((task) => task.status === "pending");
    if (pending) {
      const { data, error } = await client.from("learning_plan").update({ objective: week.objective, activities: week.activities, resources: week.resources, deliverable: week.deliverable }).eq("id", pending.id).eq("user_id", user.id).select("*").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      keepIds.add(pending.id);
      plan.push(data);
    } else {
      const { data, error } = await client.from("learning_plan").insert({ user_id: user.id, target_role_id: role.id, week: week.week, objective: week.objective, activities: week.activities, resources: week.resources, deliverable: week.deliverable, status: "pending" }).select("*").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      keepIds.add(data.id);
      plan.push(data);
    }
  }
  for (const task of previous.filter((row) => COMPLETE.has(row.status))) {
    if (!keepIds.has(task.id)) {
      keepIds.add(task.id);
      plan.push(task);
    }
  }
  plan.sort((left, right) => Number(left.week) - Number(right.week));
  const obsoletePending = previous.filter((task) => task.status === "pending" && !keepIds.has(task.id)).map((task) => task.id);
  if (obsoletePending.length) {
    const { error } = await client.from("learning_plan").delete().eq("user_id", user.id).in("id", obsoletePending);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ source: generated.source, persisted: true, role: role.title, weeks: plan, preservedCompleted: previous.filter((task) => task.status === "completed").length, message: generated.source === "ai" ? "Gemini drafted this plan from your saved role requirements, evidence, and available weekly hours." : generated.source === "cache" ? "Loaded your cached, validated plan and preserved completed work." : "Gemini was unavailable, so a deterministic plan was built from your saved skill gaps." });
}
