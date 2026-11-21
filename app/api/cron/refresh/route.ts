import { createHash } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { AdzunaProvider, FallbackJobProvider, JSearchProvider, type Job } from "@/lib/jobs/provider";
import { loadReadinessData } from "@/lib/readiness/data";
import { scoreReadiness } from "@/lib/readiness/score";

// Keep each invocation inside Vercel Hobby's function window. The scheduled
// workflow follows nextOffset until every active role has been processed.
export const maxDuration = 60;
const PAGE_SIZE = 4;

type TargetRole = { id: string; user_id: string; title: string; location: string | null };
type PlanRow = { id: string; week: number; status: string };

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function serviceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Scheduled refresh requires Supabase URL and service-role key.");
  return createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function makePlanTask(skill: string, week: number) {
  const lower = skill.toLowerCase();
  const practical = lower.includes("sql") || lower.includes("python") || lower.includes("excel") || lower.includes("tableau") || lower.includes("power bi");
  return {
    week,
    objective: `Build evidence for ${skill}`,
    activities: practical
      ? [`Complete a focused ${skill} lesson`, `Apply ${skill} to a small real-world dataset`, `Review the result against target-role requirements`]
      : [`Study core ${skill} concepts`, `Practice ${skill} using a role-relevant example`, `Explain your approach and trade-offs in writing`],
    resources: [`Choose a current, reputable ${skill} learning resource`],
    deliverable: `A shareable ${skill} artifact with a short explanation of the decisions and results.`,
  };
}

function makeNextPhaseTask(index: number, week: number) {
  const tasks = [
    { objective: "Practice role-specific interviews", activities: ["Complete one technical mock interview", "Answer one behavioral question using a clear evidence-based story", "Review recurring feedback and choose one drill"], deliverable: "A saved interview answer and a short reflection on the next improvement." },
    { objective: "Prepare a focused application batch", activities: ["Select roles that match confirmed evidence", "Tailor resume bullets using truthful, quantified outcomes", "Log each application and follow-up date"], deliverable: "A reviewed application batch with role-specific resumes and tracker entries." },
    { objective: "Strengthen positioning with evidence", activities: ["Review target-role requirements against resume evidence", "Add missing metrics only where supported by real work", "Ask a peer to review clarity and role alignment"], deliverable: "A revised, evidence-backed resume section ready for review." },
  ];
  return { week, ...tasks[Math.min(index, tasks.length - 1)], resources: ["Use the saved target-role postings and your confirmed evidence as the reference set."] };
}

async function adjustPlan(client: ReturnType<typeof serviceClient>, role: TargetRole, gaps: Awaited<ReturnType<typeof loadReadinessData>>["gaps"]) {
  const { data: rows, error } = await client.from("learning_plan").select("id,week,status").eq("user_id", role.user_id).eq("target_role_id", role.id).order("week");
  if (error) throw error;
  const planRows = (rows || []) as PlanRow[];
  const focus = gaps.filter((gap) => !gap.evidenced && gap.bucket !== "Nice-to-have").slice(0, 8);
  const pending = planRows.filter((row) => row.status === "pending").sort((a, b) => a.week - b.week);
  const nextWeek = Math.max(0, ...planRows.map((row) => row.week)) + 1;

  for (const [index, row] of pending.entries()) {
    const task = index < focus.length ? makePlanTask(focus[index].name, row.week) : makeNextPhaseTask(index - focus.length, row.week);
    const { error: updateError } = await client.from("learning_plan").update(task).eq("id", row.id).eq("user_id", role.user_id);
    if (updateError) throw updateError;
  }

  for (const [index, gap] of focus.entries()) {
    if (!pending[index]) {
      const week = nextWeek + index - pending.length;
      const task = makePlanTask(gap.name, week);
      const { error: insertError } = await client.from("learning_plan").insert({ ...task, user_id: role.user_id, target_role_id: role.id, status: "pending" });
      if (insertError) throw insertError;
    }
  }

  // Completed and in-progress tasks are never selected for modification.
  return { focusedGaps: focus.length, pendingRetargeted: pending.length, preservedCompleted: planRows.filter((row) => row.status === "completed").length, preservedInProgress: planRows.filter((row) => row.status === "in-progress" || row.status === "in_progress").length };
}

async function refreshRole(client: ReturnType<typeof serviceClient>, role: TargetRole, taxonomy: { canonical_skill: string; aliases: string[] }[], state: { used: number; quota: number }) {
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: cached, error: cacheError } = await client.from("job_postings").select("id").eq("user_id", role.user_id).eq("target_role_id", role.id).gte("fetched_at", cutoff).limit(1);
  if (cacheError) throw cacheError;
  let refreshed = 0;
  let source = "cache";
  if (!cached?.length && (process.env.RAPIDAPI_KEY || process.env.ADZUNA_APP_ID)) {
    const adzuna = new AdzunaProvider();
    const fallback = new FallbackJobProvider(new JSearchProvider(async () => {
      if (state.used >= state.quota) throw new Error("JSearch monthly quota reached");
      state.used += 1;
      const period = monthStart();
      const { data: existing, error } = await client.from("api_usage").select("id,request_count,tokens_used,quota").eq("user_id", role.user_id).eq("provider", "JSearch").eq("period_start", period).maybeSingle();
      if (error) throw error;
      const values = { user_id: role.user_id, provider: "JSearch", period_start: period, request_count: (existing?.request_count || 0) + 1, tokens_used: existing?.tokens_used || 0, quota: state.quota, updated_at: new Date().toISOString() };
      const { error: usageError } = await client.from("api_usage").upsert(values, { onConflict: "user_id,provider,period_start" });
      if (usageError) throw usageError;
    }), adzuna);
    let jobs: Job[] = [];
    try { jobs = await fallback.search(role.title, role.location || "Remote", 1); }
    catch (error) { if (!process.env.ADZUNA_APP_ID) throw error; jobs = await adzuna.search(role.title, role.location || "Remote", 1); }
    source = jobs[0]?.source || "none";
    const rows = jobs.map((job) => ({ user_id: role.user_id, target_role_id: role.id, source: job.source, source_id: job.url, url: job.url, content_hash: createHash("sha256").update(job.url).digest("hex"), title: job.title, company: job.company, location: job.location, raw_ad: job.description, requirements: [], posted_at: job.postedAt || null, fetched_at: new Date().toISOString() }));
    if (rows.length) {
      const { data: stored, error: storeError } = await client.from("job_postings").upsert(rows, { onConflict: "user_id,content_hash" }).select("id,title,raw_ad");
      if (storeError) throw storeError;
      const requirements = (stored || []).flatMap((posting) => taxonomy.filter((skill) => [skill.canonical_skill, ...skill.aliases].some((term) => `${posting.title} ${posting.raw_ad}`.toLowerCase().includes(term.toLowerCase()))).map((skill) => ({ user_id: role.user_id, posting_id: posting.id, canonical_skill: skill.canonical_skill, importance: "must-have", confidence: 0.75, evidence: `Matched in posting: ${posting.title}` })));
      if (requirements.length) {
        const { error: requirementError } = await client.from("skill_requirements").upsert(requirements, { onConflict: "posting_id,canonical_skill" });
        if (requirementError) throw requirementError;
      }
      refreshed = rows.length;
    }
  }

  const analysis = await loadReadinessData(client, role.user_id, role.id);
  const readiness = scoreReadiness(analysis.input);
  const gapRows = analysis.gaps.map((gap) => ({ user_id: role.user_id, target_role_id: role.id, canonical_skill: gap.name, posting_frequency: gap.frequency, role_relevance: gap.bucket === "Must-have" ? 80 : gap.bucket === "Differentiator" ? 55 : 30, user_proximity: gap.evidenced ? 100 : 0, time_to_learn: gap.evidenced ? 15 : 65, priority: gap.priority, bucket: gap.bucket.toLowerCase(), source_posting_ids: gap.postings.map((posting) => posting.id), updated_at: new Date().toISOString() }));
  const { error: clearGapsError } = await client.from("skill_gaps").delete().eq("user_id", role.user_id).eq("target_role_id", role.id);
  if (clearGapsError) throw clearGapsError;
  if (gapRows.length) {
    const { error: gapError } = await client.from("skill_gaps").insert(gapRows);
    if (gapError) throw gapError;
  }
  const { error: snapshotError } = await client.from("readiness_scores").insert({ user_id: role.user_id, target_role_id: role.id, score: readiness.score, score_low: readiness.low, score_high: readiness.high, component_breakdown: readiness.components, confidence: readiness.confidence, verdict: readiness.verdict, event_type: "job_refresh", change_summary: refreshed ? `Weekly refresh stored ${refreshed} postings and recalculated role evidence.` : "Weekly refresh recalculated readiness from cached postings and current evidence." });
  if (snapshotError) throw snapshotError;
  const plan = await adjustPlan(client, role, analysis.gaps);
  return { refreshed, source, readiness: readiness.score, plan };
}

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.DEMO_MODE !== "false") return NextResponse.json({ ok: true, mode: "demo", users: 0, roles: 0, message: "Demo mode uses seeded postings and does not refresh private accounts." });
  try {
    const client = serviceClient();
    const { searchParams } = new URL(request.url);
    const offset = Math.max(0, Number.parseInt(searchParams.get("offset") || "0", 10) || 0);
    const [{ data: roles, error: rolesError }, { data: taxonomy, error: taxonomyError }] = await Promise.all([
      client.from("target_roles").select("id,user_id,title,location").eq("is_active", true).order("user_id").order("id").range(offset, offset + PAGE_SIZE - 1),
      client.from("skill_taxonomy").select("canonical_skill,aliases"),
    ]);
    if (rolesError || taxonomyError) throw rolesError || taxonomyError;
    const roleBatch = (roles || []) as TargetRole[];
    const userIds = [...new Set(roleBatch.map((role) => role.user_id))];
    const { data: usageRows, error: usageError } = userIds.length ? await client.from("api_usage").select("user_id,request_count").eq("provider", "JSearch").eq("period_start", monthStart()).in("user_id", userIds) : { data: [], error: null };
    if (usageError) throw usageError;
    const quota = Math.max(0, Number(process.env.JSEARCH_MONTHLY_QUOTA || 200));
    const usage = new Map((usageRows || []).map((row) => [row.user_id, row.request_count]));
    const userStates = new Map<string, { used: number; quota: number }>();
    for (const role of roleBatch) if (!userStates.has(role.user_id)) userStates.set(role.user_id, { used: usage.get(role.user_id) || 0, quota });
    const results: { roleId: string; ok: boolean; refreshed?: number; source?: string; readiness?: number; plan?: unknown; error?: string }[] = [];
    for (const role of roleBatch) {
      try {
        const result = await refreshRole(client, role, taxonomy || [], userStates.get(role.user_id)!);
        results.push({ roleId: role.id, ok: true, ...result });
      } catch (error) {
        results.push({ roleId: role.id, ok: false, error: error instanceof Error ? error.message : "Role refresh failed" });
      }
    }
    const hasMore = roleBatch.length === PAGE_SIZE;
    return NextResponse.json({ ok: results.every((result) => result.ok), mode: "live", offset, nextOffset: hasMore ? offset + roleBatch.length : null, hasMore, users: userStates.size, roles: results.length, refreshedPostings: results.reduce((sum, result) => sum + (result.refreshed || 0), 0), succeeded: results.filter((result) => result.ok).length, failed: results.filter((result) => !result.ok).length, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scheduled refresh failed" }, { status: 500 });
  }
}
