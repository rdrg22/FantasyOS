/**
 * Acceso privado: por ahora solo pueden entrar las cuentas de esta lista (la del propietario).
 * Supabase permite crear cuentas desde fuera con la clave pública, así que no basta con no
 * tener formulario de registro: aquí se cierra la puerta aunque alguien llegue a registrarse.
 * Para abrirlo a más usuarios: FOS_ALLOWED_USER_IDS="id1,id2" (ids de Supabase Auth) o "*" para todos.
 */
const OWNER_USER_ID = "c3c88692-1aaa-44b1-bb34-a7500e8c31a4";

export function allowedUserIds(): string[] | "*" {
  const env = process.env.FOS_ALLOWED_USER_IDS?.trim();
  if (env === "*") return "*";
  return env ? env.split(",").map((s) => s.trim()).filter(Boolean) : [OWNER_USER_ID];
}

export function isAllowedUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const list = allowedUserIds();
  return list === "*" || list.includes(userId);
}
