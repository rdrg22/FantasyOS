// Arranca Next en modo local (SQLite, sin login) aunque .env.local tenga Supabase.
//   node scripts/dev-local.mjs            → servidor de desarrollo
//   node scripts/dev-local.mjs start ...  → versión compilada (npm run build antes)
import { spawn } from "node:child_process";

const [mode, ...rest] = process.argv.slice(2);
const cmd = mode === "start" ? ["npx next start", ...rest] : ["npx next dev", ...(mode ? [mode] : []), ...rest];
const child = spawn(cmd.join(" "), {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, FOS_FORCE_LOCAL: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
