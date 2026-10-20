// Arranca el servidor de desarrollo en modo local (SQLite, sin login) aunque .env.local tenga Supabase.
import { spawn } from "node:child_process";

const child = spawn(["npx next dev", ...process.argv.slice(2)].join(" "), {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, FOS_FORCE_LOCAL: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
