# Fantasy OS

Asistente personal para **LaLiga Fantasy**: centraliza tu plantilla, tu presupuesto, el mercado y la próxima jornada, y te recomienda **qué comprar, vender, mantener o vigilar** y **qué once alinear**, explicando cada decisión, sus riesgos y los datos en los que se basa.

> Las recomendaciones son estimaciones, no certezas. Fantasy OS no conoce el precio de mañana ni la alineación oficial: te da señales razonadas para que decidas tú.

## Qué incluye

| Sección | Para qué sirve |
|---|---|
| **Hoy** | «Qué debería hacer hoy»: decisiones priorizadas, las tres clave, presupuesto, valor y evolución de la plantilla, balance de compras/ventas, oportunidades del día, jugadores bajando, lesiones/dudas y cuenta atrás de la jornada. |
| **Recomendaciones** | Motor COMPRAR / VENDER / MANTENER / VIGILAR (+ avisos de alineación y saldo). Cada una con motivo, beneficios, riesgos, efecto en el presupuesto, impacto en el once, confianza y datos usados. Distingue compra *para revalorizar* de compra *para puntuar*. |
| **Mi equipo** | Once sobre un campo (clic para intercambiar, arrastrar y soltar), formación, entrenador opcional, suplentes; plantilla con precio de compra, valor actual y ganancia/pérdida; alta por buscador o manual; compras, ventas, ajustes de saldo e historial; evolución diaria. |
| **Mercado** | Tabla ordenable y filtrable (posición, equipo, precio, tendencia, estado, % de jugar) con valor, valor anterior, variación, 7 días, minigráfica, puntos, media, titularidad, rival y puntuación de oportunidad. «Mi mercado de hoy»: alta individual o CSV. |
| **Once ideal** | Mejor formación y once por puntos esperados, alternativas por línea, razones por jugador y comparación con tu once guardado. |
| **Jornada** | Partidos de la próxima jornada con fecha/hora, alineaciones probables (titulares, dudas, suplentes, lesionados, sancionados, %), edición manual, revisión de tus jugadores y clasificación calculada. |
| **Datos y fuentes** | Sincronización, registro de cada actualización, límites de cada fuente, ajustes, copia de seguridad y modo demo. |

## Requisitos

- **Node.js 22.13 o superior** (probado con Node 24). La base de datos usa `node:sqlite`, que viene integrado en Node: no hay que compilar nada ni instalar un servidor de base de datos.
- npm 10+.

## Instalación y ejecución

```bash
npm install
```

```bash
npm run dev
```

Abre <http://localhost:3000>. Para producción:

```bash
npm run build
```

```bash
npm start
```

### Primeros pasos

1. En **Hoy** pulsa **Actualizar datos**: descarga calendario, precios, puntos y alineaciones probables (tarda ~30 s porque espacia las peticiones).
2. En **Mi equipo → Presupuesto y operaciones** introduce tu saldo real.
3. En **Mi equipo → Añadir jugador** busca tus jugadores y marca «Ya lo tengo» con su precio de compra.
4. Cada día, registra en **Mercado → Mi mercado de hoy** los jugadores que ves en el mercado de tu liga (uno a uno o por CSV).
5. Revisa **Hoy** y **Once ideal** antes de que empiece la jornada.

¿Solo quieres probar? Cambia a **Demo** en la barra lateral: carga una liga ficticia completa en una base de datos separada.

## Configuración (variables de entorno)

Copia `.env.example` a `.env.local`. Todas son opcionales y **solo se leen en el servidor**; ninguna clave llega al navegador.

| Variable | Por defecto | Descripción |
|---|---|---|
| `FOS_DATA_DIR` | `./data` | Carpeta de las bases de datos SQLite (`fantasy-os.db` y `fantasy-os-demo.db`). |
| `FOS_ENABLE_FUTBOLFANTASY` | `true` | `false` desactiva la lectura de FútbolFantasy (trabajarás solo con datos manuales/CSV). |
| `FOS_MIN_SYNC_INTERVAL_MIN` | `60` | Minutos mínimos entre dos sincronizaciones de la misma fuente (mín. 5). |
| `FOOTBALL_DATA_API_KEY` | — | Clave gratuita de football-data.org para el calendario. Sin ella se usa openfootball. |
| `FOS_CRON_SECRET` | — | Si se define, `/api/cron/daily` exige `?secret=…`. Si no, solo acepta peticiones a `localhost`. |

## Sincronización diaria automática

Las tendencias propias se construyen con **una instantánea de precios por día**. Para no depender de abrir la web:

```bash
npm run sync
```

Opciones: `npm run sync -- market`, `-- fixtures`, `-- lineups`, `-- all --force`. En Windows prográmalo con el Programador de tareas (acción: `npm run sync` en la carpeta del proyecto) una vez al día, p. ej. a las 9:00 (FútbolFantasy actualiza los valores de madrugada). Con la web en marcha también sirve `GET http://localhost:3000/api/cron/daily`.

## Pruebas

```bash
npm test
```

- `tests/domain.test.ts`: importes, normalización, formaciones, fechas (horario de verano), CSV.
- `tests/engine.test.ts`: tendencias (sin inventar histórico), puntos esperados, once óptimo, avisos de alineación, motor (saldo nunca negativo, operaciones combinadas, revalorizar vs puntuar, plantilla llena, saldo negativo), calendario.
- `tests/repo.test.ts`: compras/ventas y saldo, transacciones atómicas, límites de plantilla, validación del once, ediciones manuales, fusión manual→fuente, validación de acciones, importación CSV.
- `tests/live-fixtures.test.ts`: parsers contra HTML real guardado (opcional: `FOS_FIXTURE_DIR=/ruta npm test`).
- `tests/pipeline.test.ts`: flujo completo sobre la demo.

`npm run lint` ejecuta la comprobación de tipos.

## Datos reales y de demostración

- **Mis datos** (`data/fantasy-os.db`): solo datos de fuentes reales o introducidos por ti.
- **Demo** (`data/fantasy-os-demo.db`): jugadores con nombres inventados, precios y resultados simulados, marcados con fuente `demo` y una franja amarilla en toda la interfaz. Nunca se mezclan; la sincronización está desactivada en modo demo.
- Nunca se inventan históricos: si no hay datos anteriores, la tendencia aparece como «sin histórico».

## Copias de seguridad

**Datos y fuentes → Descargar copia de seguridad** (o `GET /api/export`) descarga tu plantilla, operaciones, ajustes y mercado en JSON. Para una copia completa, copia la carpeta `data/` con la app parada.

## Mantenimiento

- **Cambio de temporada**: el calendario se elige por fecha (`2026-27`, `2027-28`…). Revisa en `src/lib/domain/teams.ts` los ascensos y descensos (ids de FútbolFantasy y alias).
- **Si FútbolFantasy cambia su web**: la sincronización falla con un mensaje claro en «Datos y fuentes» y la app sigue funcionando con datos manuales. Los parsers están en `src/lib/providers/futbolfantasy/` y tienen pruebas contra HTML real.
- **Reglas de tu liga**: ajusta el máximo de plantilla en «Datos y fuentes → Ajustes».
- **Proxy corporativo con inspección TLS**: si la sincronización falla con `SELF_SIGNED_CERT_IN_CHAIN`, define `NODE_EXTRA_CA_CERTS` con el certificado raíz de tu proxy. No desactives la verificación TLS.
- El aviso `ExperimentalWarning: SQLite is an experimental feature` de Node es informativo.

## Documentación

- [docs/FUENTES.md](docs/FUENTES.md): investigación de fuentes de datos, qué ofrece cada una, restricciones y riesgos.
- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md): arquitectura, modelo de datos, motor de recomendaciones y decisiones técnicas (incluida la elección de SQLite frente a Supabase).
- [docs/API.md](docs/API.md): endpoints y acciones.
