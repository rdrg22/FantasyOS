import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublishableKey, supabaseSecretKey, supabaseUrl } from "./config";
import { isAllowedUser } from "./access";

const g = globalThis as unknown as { __fosAdmin?: SupabaseClient };

/** Cliente con la clave secreta: solo en el servidor, para leer/escribir datos. */
export function adminClient(): SupabaseClient {
  if (!g.__fosAdmin) {
    g.__fosAdmin = createClient(supabaseUrl()!, supabaseSecretKey()!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    });
  }
  return g.__fosAdmin;
}

/** Cliente con la sesión del usuario (cookies), para saber quién ha iniciado sesión. */
export async function authClient() {
  const store = await cookies();
  return createServerClient(supabaseUrl()!, supabasePublishableKey()!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const c of list) store.set(c.name, c.value, c.options);
        } catch {
          // En componentes de servidor no se pueden escribir cookies; el proxy las refresca.
        }
      },
    },
  });
}

/** Id del usuario autenticado (validado contra Supabase Auth) y con acceso permitido, o null. */
export async function currentAuthUserId(): Promise<string | null> {
  const sb = await authClient();
  const { data } = await sb.auth.getUser();
  const id = data.user?.id ?? null;
  return isAllowedUser(id) ? id : null;
}
