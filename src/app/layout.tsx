import type { Metadata, Viewport } from "next";
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
  applicationName: "Fantasy OS",
  // Instalable en la pantalla de inicio del móvil (iOS y Android)
  appleWebApp: { capable: true, title: "Fantasy OS", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#050a14",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
  const [settings, market, fixtures, lineups] = await Promise.all([
    repo.getSettings(),
    repo.lastSync("futbolfantasy", "market"),
    repo.lastSync("calendario", "fixtures"),
    repo.lastSync("futbolfantasy", "lineups"),
  ]);
  return shell(
    <div className="flex min-h-screen">
      <Sidebar workspace={workspace} teamName={settings.teamName} freshness={{ market: market?.finishedAt ?? null, fixtures: fixtures?.finishedAt ?? null, lineups: lineups?.finishedAt ?? null }} canLogout={supabaseEnabled()} />
      <main className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-60">
        {workspace === "demo" && (
          <div className="sticky top-0 z-30 border-b border-gold/30 bg-gold/10 px-6 py-1.5 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-gold backdrop-blur">
            Modo demostración · jugadores y datos ficticios · no se mezclan con tus datos reales
          </div>
        )}
        <div className="mx-auto max-w-[1500px] px-4 pb-6 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6 lg:px-8 lg:pt-6">{children}</div>
      </main>
    </div>,
  );
}
