import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ToastProvider } from "@/components/Toast";
import { getRepo } from "@/lib/services/context";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

export const metadata: Metadata = {
  title: "Fantasy OS",
  description: "Asistente de decisiones para LaLiga Fantasy",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { repo, workspace } = await getRepo();
  const settings = repo.getSettings();
  const last = repo.lastSync("futbolfantasy", "market")?.finishedAt ?? null;
  return (
    <html lang="es" className={`${inter.variable} ${outfit.variable}`}>
      <body className="min-h-screen antialiased">
        <ToastProvider>
          <div className="flex min-h-screen">
            <Sidebar workspace={workspace} teamName={settings.teamName} lastMarketSync={last} />
            <main className="min-w-0 flex-1 lg:pl-60">
              {workspace === "demo" && (
                <div className="sticky top-0 z-30 border-b border-gold/30 bg-gold/10 px-6 py-1.5 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-gold backdrop-blur">
                  Modo demostración · jugadores y datos ficticios · no se mezclan con tus datos reales
                </div>
              )}
              <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
            </main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
