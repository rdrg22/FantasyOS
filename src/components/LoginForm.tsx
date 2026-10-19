"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { LogIn } from "lucide-react";

export function LoginForm({ url, publishableKey }: { url: string; publishableKey: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createBrowserClient(url, publishableKey);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusy(false);
      setError(error.message === "Invalid login credentials" ? "Email o contraseña incorrectos." : error.message);
      return;
    }
    window.location.assign("/");
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="password">Contraseña</label>
        <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p className="rounded-lg border border-down/40 bg-down/10 px-3 py-2 text-[13px] text-down">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        <LogIn size={15} /> {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
