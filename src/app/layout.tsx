import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ToastProvider } from "@/components/Toast";
import { currentUserId, getWorkspace, storeFor } from "@/lib/services/context";
import { supabaseEnabled } from "@/lib/supabase/config";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

export const metadata: Metadata = {
  title: "Fantasy OS",
  description: "Asistente de decisiones para LaLiga Fantasy",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const userId = await currentUserId();
  const shell = (content: React.ReactNode) => (
    <html lang="es" className={`${inter.variable} ${outfit.variable}`}>
      <body className="min-h-screen antialiased">
        <ToastProvider>{content}</ToastProvider>
      </body>
    </html>
  );
  // Sin sesión (solo con Supabase): página de login sin barra lateral.
  if (!userId) return shell(<main className="min-h-screen">{children}</main>);

  const workspace = await getWorkspace();
  const repo = await storeFor(workspace, userId);
  const [settings, last] = await Promise.all([repo.getSettings(), repo.lastSync("futbolfantasy", "market")]);
  return shell(
    <div className="flex min-h-screen">
      <Sidebar workspace={workspace} teamName={settings.teamName} lastMarketSync={last?.finishedAt ?? null} canLogout={supabaseEnabled()} />
      <main className="min-w-0 flex-1 lg:pl-60">
        {workspace === "demo" && (
          <div className="sticky top-0 z-30 border-b border-gold/30 bg-gold/10 px-6 py-1.5 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-gold backdrop-blur">
            Modo demostración · jugadores y datos ficticios · no se mezclan con tus datos reales
          </div>
        )}
        <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>,
  );
}
