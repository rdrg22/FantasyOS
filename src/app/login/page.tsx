import { redirect } from "next/navigation";
import { supabaseEnabled } from "@/lib/supabase/config";
import { LoginForm } from "@/components/LoginForm";
import { QUINIELA_URL } from "@/lib/links";

export const metadata = { title: "Entrar · Fantasy OS" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ acceso?: string }> }) {
  const { acceso } = await searchParams;
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
        {acceso === "denegado" && (
          <p role="alert" className="mb-4 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-[13px] text-gold">
            Esta cuenta no tiene acceso: Fantasy OS es privado por ahora.
          </p>
        )}
        <LoginForm url={process.env.NEXT_PUBLIC_SUPABASE_URL!} publishableKey={(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!} />
        <p className="mt-5 text-center text-[12.5px] text-muted">
          ¿Buscas los pronósticos de la jornada?{" "}
          <a href={QUINIELA_URL} className="text-cyan hover:underline">Quiniela OS</a> es abierto para todos.
        </p>
      </div>
    </div>
  );
}
