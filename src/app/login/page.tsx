import { redirect } from "next/navigation";
import { supabaseEnabled } from "@/lib/supabase/config";
import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Entrar · Fantasy OS" };

export default function LoginPage() {
  // En modo local (sin Supabase) no hay login.
  if (!supabaseEnabled()) redirect("/");
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <div className="font-display text-2xl font-semibold tracking-tight">
            Fantasy<span className="text-cyan">OS</span>
          </div>
          <p className="mt-1 text-sm text-muted">Inicia sesión para ver tu equipo</p>
        </div>
        <LoginForm url={process.env.NEXT_PUBLIC_SUPABASE_URL!} publishableKey={(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!} />
      </div>
    </div>
  );
}
