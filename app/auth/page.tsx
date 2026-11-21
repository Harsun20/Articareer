"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";

function credentials() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

function isProviderDisabled(message: string, code?: string) {
  return code === "validation_failed" || /unsupported provider|provider is not enabled/i.test(message);
}

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(Boolean(credentials().url && credentials().key));
  const [googleEnabled,setGoogleEnabled]=useState(false);
  const [hasSession,setHasSession]=useState(false);
  useEffect(() => {
    const issue = new URLSearchParams(location.search).get("error");
    if (issue === "setup") setError("Sign-in could not complete because Supabase URL, publishable key, or callback settings are missing.");
    if (issue === "callback") setError("The sign-in link could not be verified. Request a fresh link and open it in the same browser.");
    const {url,key}=credentials();
    if(url&&key){const supabase=createBrowserClient(url,key);void supabase.auth.getUser().then(({data})=>setHasSession(Boolean(data.user)));}
    void fetch("/api/auth/providers").then(response=>response.json()).then(data=>setGoogleEnabled(data.googleEnabled===true)).catch(()=>setGoogleEnabled(false));
  }, []);

  async function magic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError("");
    const { url, key } = credentials();
    if (!url || !key) {
      setConfigured(false);
      setError("Supabase sign-in is not configured in this deployment yet. You can still explore the demo workspace.");
      setWorking(false);
      return;
    }
    try {
      const supabase = createBrowserClient(url, key);
      const { error: authError } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: `${location.origin}/auth/callback` } });
      if (authError) throw authError;
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not send the sign-in link. Check your email settings and try again.");
    } finally {
      setWorking(false);
    }
  }

  async function google() {
    setWorking(true);
    setError("");
    const { url, key } = credentials();
    if (!url || !key) {
      setConfigured(false);
      setError("Supabase sign-in is not configured in this deployment yet. You can still explore the demo workspace.");
      setWorking(false);
      return;
    }
    try {
      const supabase = createBrowserClient(url, key);
      const { error: authError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } });
      if (authError) {
        if (isProviderDisabled(authError.message, authError.code)) throw new Error("Google sign-in is not enabled for this Supabase project. Use the email link below, or enable Google under Supabase → Authentication → Sign In / Providers, then add your Google OAuth client ID and secret.");
        throw authError;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google sign-in could not start. Try the email link instead.");
      setWorking(false);
    }
  }

  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "#f6f7f3" }}>
    <section className="card" style={{ width: "min(460px,100%)", padding: 32 }}>
      <div className="brand" style={{ padding: 0, marginBottom: 25 }}><span className="brand-mark">✳</span> articareer</div>
      <span className="eyebrow">YOUR CAREER WORKSPACE</span>
      <h1 className="page-title" style={{ marginTop: 10 }}>A thoughtful next move starts here.</h1>
      <p className="subhello" style={{ marginBottom: 22 }}>Sign in to save your resume, role targets, learning plan, and readiness history.</p>

      {!configured && <div className="notice" role="status" style={{ marginBottom: 14 }}>Add your Supabase project URL and publishable key to enable account sign-in.</div>}
      {error && <div className="notice" role="alert" style={{ marginBottom: 14, borderColor: "#e0b8a7", color: "#824a3a" }}>{error}</div>}

      {sent ? <div className="notice" role="status"><strong>Check your inbox.</strong><br/>We sent a secure sign-in link to {email}. Open it in this browser to return to your workspace.</div> : <>
        {googleEnabled ? <button type="button" className="btn" style={{ width: "100%", padding: 12 }} disabled={working} onClick={google}>{working ? "Opening Google…" : "Continue with Google"}</button> : <div className="notice" style={{ marginBottom: 14 }}>Google sign-in is currently disabled in this Supabase project. Email sign-in is available; to enable Google, finish its provider setup in Supabase.</div>}
        <div style={{ textAlign: "center", fontSize: 11, color: "#78857e", padding: 14 }}>Sign in with an email link</div>
        <form onSubmit={magic}>
          <label className="section-desc" htmlFor="signin-email" style={{ display: "block", marginBottom: 6 }}>Email address</label>
          <input id="signin-email" className="input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" style={{ width: "100%" }} />
          <button type="submit" className="btn primary" style={{ width: "100%", padding: 12, marginTop: 10 }} disabled={working}>{working ? "Sending link…" : "Send magic link"}</button>
        </form>
      </>}

      {hasSession&&<div className="notice" style={{marginTop:16}}><strong>You’re already signed in.</strong><br/>Continue to your saved career workspace.<br/><Link href="/workspace" className="btn primary" style={{width:"100%",justifyContent:"center",marginTop:10}}>Continue to workspace</Link></div>}

      <div style={{ borderTop: "1px solid #e7ebe5", marginTop: 22, paddingTop: 18, textAlign: "center" }}>
        <p className="section-desc" style={{ marginBottom: 10 }}>Just looking around?</p>
        <Link className="btn" href="/demo" style={{ width: "100%", justifyContent: "center" }}>Explore the demo workspace</Link>
      </div>
    </section>
  </main>;
}
