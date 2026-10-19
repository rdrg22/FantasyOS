# API

Todas las rutas se ejecutan en el servidor (runtime Node). El espacio de datos (real/demo) se toma de la cookie `fos_ws`. En modo Supabase todas (salvo `/api/cron/daily`) exigen sesión iniciada y responden 401 si no la hay.

## Rutas

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/actions` | Punto único de escritura. Cuerpo `{ "type": "<acción>", ... }` validado con Zod. Respuesta `{ ok, message?, data?, error? }`. Errores: 400 (validación), 404/409/422 (reglas de negocio), 500. |
| `POST` | `/api/workspace` | `{ "workspace": "real" \| "demo" }`. Cambia de espacio; la demo se genera la primera vez. |
| `GET` | `/api/state` | Resumen de solo lectura: saldo, plantilla, recomendaciones, frescura de datos. |
| `GET` | `/api/export` | Copia de seguridad JSON (plantilla, operaciones, ajustes, mercado, evolución). |
| `GET` | `/api/cron/daily` | Sincroniza datos reales por pasos: `?step=fixtures\|market\|points\|lineups\|snapshot` (`lineups` admite `&exclude=local-visitante,...`; `snapshot` guarda el valor diario de la plantilla de cada usuario). Sin `step`, todos seguidos. Autorización: `Authorization: Bearer <FOS_CRON_SECRET>` o `?secret=`; sin secreto configurado, solo desde `localhost`. `&force=1` ignora el intervalo mínimo. |
| `POST` | `/api/auth/signout` | Cierra la sesión (modo Supabase) y redirige a `/login`. |

## Acciones de `/api/actions`

Importes en euros enteros (≥ 0). Fechas `AAAA-MM-DD`. Probabilidades 0–1.

| `type` | Campos | Efecto |
|---|---|---|
| `createPlayer` | `name, teamId\|null, position, value\|null, status, startProb?` | Crea un jugador manual |
| `updatePlayer` | `playerId, value?, status?, startProb?, position?, teamId?, statusNote?` | Edición manual (prevalece sobre la sincronización) |
| `resetPlayer` | `playerId` | Restaura los datos de la fuente |
| `addToSquad` | `playerId, purchasePrice, purchaseDate, notes?` | Añade un jugador que ya tenías (no mueve saldo) |
| `updateSquad` | `playerId, purchasePrice?, purchaseDate?, notes?` | Corrige los datos de compra |
| `removeFromSquad` | `playerId` | Quita sin registrar venta (corrección) |
| `buy` | `playerId, price, date, notes?, allowNegative?` | Compra atómica: resta saldo, añade a plantilla, registra operación. 422 si no hay saldo y no se permite negativo |
| `sell` | `playerId, price, date, notes?` | Venta atómica: suma saldo, quita de plantilla y del once, guarda precio de compra |
| `setBudget` | `budget, notes?` | Fija el saldo y registra el ajuste |
| `deleteTransaction` | `id` | Borra una operación del historial (no toca el saldo) |
| `saveLineup` | `formation, useCoach, lineup{slot: playerId\|null}` | Guarda el once (valida posición, pertenencia y duplicados) |
| `changeFormation` | `formation, useCoach` | Cambia de formación reubicando jugadores |
| `applyRecommendedLineup` | — | Guarda el once recomendado |
| `saveSettings` | `teamName?, maxSquadSize?` | Ajustes |
| `addListing` | `playerId, date?, askingPrice?, seller?` | Añade al mercado del día |
| `removeListing` | `id` | — |
| `clearListings` | `date` | Vacía el mercado de ese día |
| `importListingsCsv` | `csv, date?, createMissing` | Importa el mercado del día. Devuelve `data.errors` por línea |
| `upsertLineupEntry` | `id?, matchday, teamId, playerName, playerId?, role, probability?` | Edición manual de alineación probable |
| `deleteLineupEntry` | `id` | — |
| `resetDemo` | — | Regenera la demo (solo en modo demo) |
| `sync` | `kind: fixtures\|market\|points\|lineups, force, exclude?` | Un paso de sincronización de datos reales (no disponible en demo). `lineups` procesa una tanda de partidos y devuelve `data.remaining` y `data.failed` para continuar |

### Ejemplo

```bash
curl -X POST http://localhost:3000/api/actions -H "Content-Type: application/json" -d '{"type":"setBudget","budget":12500000}'
```

### Formato CSV del mercado

```
nombre;equipo;posicion;precio;vendedor
Pedri;Barcelona;MED;45000000;LaLiga
Nico Williams;Athletic;DEL;38.500.000;Mánager X
```

Separador `;`, `,` o tabulador; columnas en cualquier orden (`nombre`/`jugador`, `equipo`/`club`, `posicion`/`pos`, `precio`/`valor`, `vendedor`). Importes `45000000`, `45.000.000`, `45M` o `450k`.
