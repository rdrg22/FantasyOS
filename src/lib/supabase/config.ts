/**
 * Configuración de Supabase. Si no hay URL y claves, la app funciona en modo local
 * (SQLite, una sola cuenta, sin login). Con ellas, usa Postgres y exige iniciar sesión.
 *
 *  NEXT_PUBLIC_SUPABASE_URL              URL del proyecto (pública)
 *  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  clave pública (solo para iniciar sesión)
 *  SUPABASE_SECRET_KEY                   clave secreta (solo servidor; nunca en el navegador)
 */
export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

export function supabasePublishableKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined;
}

export function supabaseSecretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

/** Modo Supabase activo (requiere las tres variables). */
export function supabaseEnabled(): boolean {
  return Boolean(supabaseUrl() && supabasePublishableKey() && supabaseSecretKey());
}
