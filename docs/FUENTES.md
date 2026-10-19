# Fuentes de datos: investigación y limitaciones

Investigación del 19/10/2026 (jornada 9–10 de LaLiga 2026/27). Cada fuente se probó con peticiones reales antes de integrarla.

## Resumen

| Fuente | Estado | Autenticación | Qué aporta | Fiabilidad |
|---|---|---|---|---|
| FútbolFantasy — mercado | **Integrada** | No | Valores LaLiga Fantasy y su histórico (1/2/3/7/14/30 mercados), tendencia, aceleración, próximo rival, % de titularidad | Alta mientras no cambie el HTML |
| FútbolFantasy — puntos | **Integrada** | No | Puntos LaLiga Fantasy: total, media, últimas 1/3/5 jornadas, partidos jugados | Alta |
| FútbolFantasy — alineaciones probables | **Integrada** | No | Once probable, alternativas, % por jugador, lesionados, sancionados | Estimaciones de la web; se publican progresivamente |
| openfootball/football.json | **Integrada** | No | Calendario 2026/27 (380 partidos), horarios, resultados | Media: voluntarios, retrasos de días |
| football-data.org v4 | **Opcional** | Clave gratuita (`X-Auth-Token`) | Calendario y resultados oficiales | Alta; 10 peticiones/min |
| API de LaLiga Fantasy | **No integrada** | Login de usuario | Datos oficiales del juego | No pública |
| ESPN (`site.api.espn.com`) | No integrada | No | Marcadores | API no documentada |

## FútbolFantasy

**URLs**
- Mercado: `https://www.futbolfantasy.com/analytics/laliga-fantasy/mercado`
- Puntos: `https://www.futbolfantasy.com/analytics/laliga-fantasy/puntos`
- Hub de alineaciones: `https://www.futbolfantasy.com/laliga/posibles-alineaciones`
- Partido: `https://www.futbolfantasy.com/partidos/<id>-<local>-<visitante>`

**Acceso.** No existe una API pública documentada. Las páginas se sirven **renderizadas en el servidor** y cada jugador lleva atributos estructurados (`data-id`, `data-valor`, `data-valor1…30`, `data-tendencia`, `data-aceleracion`, `data-probabilidad`, `data-lesion`…). `robots.txt` (`User-agent: * / Disallow:`) no restringe ninguna ruta. No se encontró un aviso legal que regule la reutilización: **se usa para consulta personal**; revisa sus condiciones antes de cualquier otro uso (publicación, uso comercial).

**Cómo lo usa Fantasy OS (no agresivo).**
- Solo bajo demanda (botón o una vez al día); intervalo mínimo configurable (60 min por defecto) por fuente.
- Mercado: 2 peticiones. Alineaciones: 1 hub + 1 por partido (~11), en serie y con 1,5 s entre peticiones.
- User-Agent identificativo, timeout de 20 s, un reintento, y tratamiento de 429/403.
- No se eluden protecciones ni se usan endpoints internos.

**Validación.** Cada fila se valida con Zod; las filas inválidas se descartan y se cuentan. Si se leen menos de 50 jugadores o el once tiene menos de 8, la sincronización se marca como error («la página puede haber cambiado») y los datos anteriores se conservan.

**Identificadores.** Los ids de jugador coinciden entre mercado y puntos (`data-id` / `openPlayerPointsStats(id…)`); los entrenadores usan `e<n>`. Los equipos se mapean por su id numérico (`teams.ts`). En las páginas de partido el jugador se identifica por el *slug* de su URL y se cruza con el catálogo por nombre normalizado y equipo.

**Limitaciones observadas.**
- Hay filiales (Celta Fortuna, R. Sociedad B) en el mercado: se descartan.
- Alineaciones de partidos lejanos o de equipos que aún juegan la jornada anterior pueden no estar publicadas (en la prueba: 16 de 20 equipos disponibles).
- `data-tendencia` se presenta como «racha en días» según la fuente; se muestra tal cual, sin reinterpretarla.

## openfootball / football.json

`https://raw.githubusercontent.com/openfootball/football.json/master/<temporada>/es.1.json` — dominio público, sin clave.

- 380 partidos de 2026/27 con jornada, fecha, hora (cuando está publicada) y resultado.
- **Retrasos**: el 19/10/2026 tenía resultado en 64 de ~89 partidos jugados. Algunos marcadores vienen como lista `[0,0]` ambigua; Fantasy OS solo acepta el marcador final explícito (`ft`). Consecuencia: la clasificación calculada puede ir por detrás de la oficial; solo se usa para estimar la dificultad del rival (efecto acotado a ±20 %).
- Las horas se interpretan como hora de Madrid y se convierten a UTC respetando el horario de verano.

## football-data.org

`GET https://api.football-data.org/v4/competitions/PD/matches?season=2026` con cabecera `X-Auth-Token`. Sin clave responde **403** (comprobado). Plan gratuito: 10 peticiones/min, sin alineaciones ni estadísticas de jugador. Si `FOOTBALL_DATA_API_KEY` está definida se usa como fuente principal del calendario, con openfootball como respaldo.

## API de LaLiga Fantasy

Proyectos de terceros usan `api-fantasy.llt-services.com`, pero:
- No es pública ni está documentada; requiere iniciar sesión con la cuenta del usuario (tokens de 24 h según esos proyectos).
- Automatizar el login para extraer datos puede vulnerar las condiciones de uso del juego.
- En la prueba (`/api/v3/players`) respondió **502**.

Por eso **no se integra**. Los datos exclusivos del juego (el mercado concreto de tu liga, pujas, saldo) se introducen a mano o por CSV. Que otros proyectos la usen no la convierte en pública.

## ESPN

`site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard` responde sin clave, pero no está documentada para uso de terceros. No se integra; queda como posible respaldo de resultados si openfootball se retrasa demasiado.

## Qué se introduce a mano

- Tu plantilla, precios de compra y saldo.
- El mercado diario de tu liga (individual o CSV: `nombre;equipo;posicion;precio;vendedor`).
- Correcciones de cualquier dato de jugador (valor, estado, posición, equipo, % de jugar): prevalecen sobre la sincronización hasta que las restauras.
- Alineaciones probables cuando la fuente no las tiene o no estás de acuerdo.
