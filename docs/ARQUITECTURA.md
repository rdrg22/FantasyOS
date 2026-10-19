# Arquitectura

## Tecnología

- **Next.js 16 (App Router) + React 19 + TypeScript**: páginas renderizadas en el servidor con los cálculos hechos allí; componentes cliente solo para la interacción (campo, filtros, formularios).
- **Tailwind CSS 4** con un sistema de tokens propio (`src/app/globals.css`).
- **Recharts** para los gráficos grandes; minigráficas en SVG propio (rápidas en tablas de cientos de filas).
- **Zod** para validar todo lo que entra: respuestas externas y acciones del usuario.
- **SQLite integrado en Node (`node:sqlite`)** para la persistencia.

### Persistencia: dos almacenes con la misma interfaz

- **SQLite local** (`src/lib/db/repo.ts` + `sqlite-store.ts`): sin cuentas ni servicios externos; ideal para usarlo en tu ordenador y para los tests. Se carga de forma dinámica, así que el despliegue no necesita `node:sqlite`.
- **Supabase / Postgres** (`src/lib/db/supabase-store.ts` + `supabase/migrations/`): se activa con las variables de Supabase. Necesario en Netlify, donde el disco de las funciones es efímero.

Ambos cumplen el tipo `Store` (`src/lib/db/common.ts`); `storeFor()` en `src/lib/services/context.ts` elige uno u otro.

**Seguridad en Supabase**
- El navegador solo usa la clave publicable para iniciar sesión (Supabase Auth, cookies gestionadas por `@supabase/ssr`).
- El servidor valida la sesión (`auth.getUser()`) y accede a los datos con la clave secreta, filtrando siempre por `user_id` (id de Supabase Auth) y `ws` (real/demo).
- RLS activado en todas las tablas y sin políticas: con la clave publicable no se puede leer ni escribir nada.
- `src/proxy.ts` refresca la sesión y redirige a `/login`; cada página y ruta API vuelve a comprobarla.
- Compras, ventas, ajustes de saldo, fusión de jugadores y escrituras masivas son funciones SQL (`fos_*`) ejecutables solo por `service_role`, para que sean atómicas.

**Límites de tiempo en Netlify**: la sincronización está dividida en pasos (`fixtures`, `market`, `points`, `lineups` por tandas) para que cada petición quepa en el tiempo máximo de una función.

## Capas

```
src/
  app/                    Páginas (servidor) y rutas API
  components/             UI (cliente): campo, tablas, formularios, tarjetas
  lib/
    domain/               Tipos, equipos, normalización, formaciones, dinero, fechas, CSV (puro)
    providers/            Un módulo por fuente externa: descarga + parseo + validación
      futbolfantasy/      mercado/puntos y alineaciones
      openfootball.ts     calendario sin clave
      footballdata.ts     calendario con clave (opcional)
      http.ts             timeout, reintento, errores tipados
    db/                   SQLite: esquema/migraciones y repositorio
    analytics/            Motor: tendencias, calendario, puntos esperados, once, recomendaciones (puro)
    services/             Orquestación: sincronización, estado, acciones, demo, contexto
scripts/sync.ts           Sincronización por línea de comandos
```

- **Independencia de proveedor**: los proveedores devuelven estructuras propias; `services/sync.ts` las normaliza al modelo de dominio (`Player`, `Fixture`, `ProbableLineupEntry`). El motor nunca sabe de dónde vino un dato, solo su procedencia declarada (`source`).
- **Normalización**: nombres sin tildes/mayúsculas (`normalizeName`), equipos por alias (`resolveTeamId`), posiciones (`parsePosition`), ids `fuente:id` (`ff:1059`, `manual:…`, `csv:…`, `demo:…`). Los jugadores creados a mano se **fusionan** automáticamente con el de la fuente cuando aparece (`relinkPlayer`).
- **Errores y límites**: cada sincronización queda en `sync_log` (ok / error / skipped + mensaje). Intervalo mínimo por fuente. Si una fuente falla, se conservan los datos anteriores y se muestra su antigüedad en toda la interfaz («Frescura de los datos»).

## Modelo de datos

| Tabla | Contenido |
|---|---|
| `players` | Catálogo: nombre, equipo, posición, estado, % titularidad, valor, histórico publicado por la fuente, racha, aceleración, próximo rival, puntos, fuente, fecha |
| `player_overrides` | Ediciones manuales por usuario (JSON); prevalecen sobre la sincronización |
| `price_snapshots` | Un valor por jugador y día (PK `player_id, date`). Base de las tendencias propias |
| `squad` | Plantilla del usuario: precio y fecha de compra |
| `transactions` | Compras, ventas (con `cost_basis` para el beneficio realizado) y ajustes de saldo |
| `market_listings` | Mercado diario de la liga del usuario |
| `fixtures` | Calendario y resultados |
| `probable_lineups` | Alineaciones probables por jornada/equipo; `manual=1` sobrevive a reimportaciones |
| `settings` | Saldo, formación, once guardado, entrenador, máximo de plantilla, nombre |
| `squad_value_history` | Valor de plantilla y saldo por día (real, sin rellenar huecos) |
| `sync_log` | Registro de sincronizaciones |

Dos archivos: `fantasy-os.db` (real) y `fantasy-os-demo.db` (demo). El espacio activo se elige con una cookie.

## Motor de análisis

### Tendencia (`analytics/trends.ts`)
- Valor hace N días: primero **instantáneas propias** (fechas reales); si no, el valor que publica la fuente N mercados atrás. Nunca se extrapola.
- Tasa diaria ponderada: 50 % último mercado, 30 % media diaria de 3 días, 20 % de 7 días.
- Aceleración: variación de hoy menos la media diaria de los tres días anteriores → *acelera*, *frena*, *inflexión positiva/negativa*.
- Impulso (−100..100) = tasa diaria × 30 ± ajustes por aceleración.

### Puntos esperados (`analytics/analysis.ts`)
`xP = puntos base × P(jugar) × factor rival`
- Puntos base: 60 % media de las últimas 5 + 40 % media de la temporada (o la que exista). Sin datos: valor por posición y confianza baja.
- P(jugar): lesionado/sancionado = 0; alineación probable; % de la fuente; partidos jugados de 5; si nada, 50 % marcado como supuesto. Duda ≤ 50 %. Sin partido en la jornada = 0.
- Factor rival: 1 + 0,2 × (media de la liga − puntos/partido del rival) / media, ±4 % por localía, acotado a 0,8–1,2.

### Once recomendado (`analytics/lineup.ts`)
Como cada línea es independiente, para cada formación se toman los mejores por xP de cada posición; gana la formación completa con más xP. Se compara con el once guardado y se detectan huecos vacíos, lesionados, sancionados, sin partido y baja probabilidad, con sustituto sugerido.

### Recomendaciones (`analytics/recommendations.ts`)
- **Plantilla** → VENDER si la puntuación de venta (caída fuerte o acelerada, inflexión negativa, lesión, baja titularidad, no titular, saldo negativo) ≥ 45 y no deja la línea por debajo del mínimo (1 POR, 3 DEF, 3 MED, 1 DEL); VIGILAR si hay señales de riesgo sin llegar al umbral; MANTENER en otro caso.
- **Mercado** (tu mercado del día o, si no lo registras, los 60 mejores del catálogo con confianza rebajada):
  - *Revalorizar*: dirección «sube», impulso ≥ 12 y P(jugar) ≥ 0,3.
  - *Puntuar*: mejora ≥ 0,8 xP al titular más flojo de su posición y P(jugar) ≥ 0,5.
  - Coste = precio pedido o valor. Si no llega el saldo o la plantilla está llena se busca la **venta menos dolorosa** que lo cubra (prefiere suplentes y peor perspectiva; nunca deja una línea sin mínimo). Si no hay venta viable → VIGILAR «fuera de presupuesto». **El saldo resultante de una compra recomendada nunca es negativo** (cubierto por pruebas).
  - Máximo 3 compras por posición y 10 en total; si dos compras dependen de la misma venta se avisa.
- **Avisos**: saldo negativo (prioridad 100) y problemas del once guardado (92/72).
- **Confianza**: proporción de datos reales usados frente a ausentes (histórico, puntos, titularidad, rival, mercado del día).
