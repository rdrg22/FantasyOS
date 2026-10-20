import { PageHeader, Section } from "@/components/ui";

const GLOSSARY: [string, string][] = [
  ["Pts esp. (puntos esperados)", "Estimación de los puntos que hará el jugador en la próxima jornada: media de puntos × probabilidad de jugar × dificultad del rival."],
  ["Oportunidad (0–100)", "Combina el impulso del precio y los puntos esperados. Cuanto más alta, más interesante como fichaje. Es orientativa."],
  ["Confianza", "Cuántos datos reales hay detrás de una recomendación (histórico de precios, puntos, titularidad, rival, tu mercado del día). Baja = faltan datos."],
  ["Tendencia y aceleración", "Cómo se mueve el valor en el último mercado, 3 y 7 días. «Acelera» significa que la subida o la bajada va a más; «frena», que pierde fuerza; «giro», cambio de dirección."],
  ["Alineación probable", "Estimación de la fuente (o tuya) de quién será titular. No es la alineación oficial, que solo se conoce poco antes del partido."],
  ["Para revalorizar / para puntuar", "Una compra «para revalorizar» busca ganar dinero porque el precio sube; «para puntuar», mejorar tu once."],
  ["J10 · J11 (rivales)", "Los dos próximos rivales de cada jugador. Verde: asequible; ámbar: medio; rojo: difícil. «@» significa que juega fuera."],
  ["Puja recomendada y máxima", "Para un jugador de tu mercado: la recomendada es lo que conviene ofrecer (cerca del mínimo si nadie más puja; más alta si marcas «Alguien más ha pujado»). La máxima es el límite: por encima, el fichaje deja de compensar. Para puntuar, el límite sube cuanto más mejora tu once en las 2 próximas jornadas; para ganar dinero, solo compensa pagar de más si se espera que su precio suba en los próximos días. Las cifras acaban en 137 € para ganar a quien puja números redondos."],
  ["Añadir a la pantalla de inicio", "En el móvil, abre la web en Safari (iPhone) o Chrome (Android) → Compartir / menú → «Añadir a pantalla de inicio». Se abrirá a pantalla completa, como una app."],
];

const METHOD: [string, string][] = [
  ["Tendencia de valor", "Variación del último mercado, 3 y 7 días, ponderando lo reciente. Usa los precios que guarda la app cada día y, mientras no hay suficientes, el histórico que publica la fuente. Nunca se inventan datos."],
  ["Puntos esperados", "Media de puntos (60 % últimas 5 jornadas, 40 % temporada) × probabilidad de jugar × factor de rival (±20 % según su clasificación y la localía)."],
  ["Probabilidad de jugar", "Alineación probable si existe; si no, el % publicado por la fuente; si no, los partidos recientes. Lesionados, sancionados o equipos sin partido cuentan como 0."],
  ["Compras", "«Para revalorizar» si el precio sube con fuerza y el jugador juega; «para puntuar» si mejora a tu titular más flojo de esa posición en al menos 0,8 puntos esperados."],
  ["Viabilidad", "Si no te llega el saldo o tienes la plantilla llena, se busca la venta menos dolorosa (suplentes con peor perspectiva) sin dejarte sin jugadores para alinear. Ninguna compra recomendada deja el saldo en negativo."],
  ["Ventas", "Se recomienda vender a quien cae con fuerza o en aceleración, está lesionado o apenas juega, sobre todo si no está en tu once ideal."],
  ["Once ideal", "Para cada formación se eligen los jugadores con más puntos esperados por línea y gana la formación que más suma."],
];

const SOURCES: [string, string, string][] = [
  ["FútbolFantasy — mercado y puntos", "Valor actual y de días anteriores, tendencia, próximo rival, % de titularidad y puntos LaLiga Fantasy.", "No es una API oficial: se lee su página pública con pocas peticiones. Si cambian su web, la sincronización avisa y puedes seguir con datos manuales."],
  ["FútbolFantasy — alineaciones probables", "Once probable, alternativas, % por jugador, lesionados y sancionados.", "Son estimaciones; algunos partidos se publican tarde. Se pueden editar a mano."],
  ["openfootball", "Calendario, horarios y resultados (sin clave).", "Lo mantienen voluntarios: los resultados pueden llegar con días de retraso, así que la clasificación calculada puede ir por detrás."],
  ["football-data.org (opcional)", "Calendario y resultados oficiales con una clave gratuita.", "10 peticiones por minuto; sin alineaciones ni estadísticas de jugador."],
  ["API de LaLiga Fantasy", "No se usa.", "No es pública y exige tu login; automatizarlo puede vulnerar las normas del juego. Por eso el mercado de tu liga se introduce a mano o por CSV."],
];

export default function AyudaPage() {
  return (
    <>
      <PageHeader eyebrow="Ayuda" title="Cómo funciona Fantasy OS" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section title="Glosario">
          <dl className="space-y-3 text-[13px]">
            {GLOSSARY.map(([k, v]) => (
              <div key={k}>
                <dt className="font-medium">{k}</dt>
                <dd className="text-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>
        <Section title="Cómo se calculan las recomendaciones">
          <dl className="space-y-3 text-[13px]">
            {METHOD.map(([k, v]) => (
              <div key={k}>
                <dt className="font-medium">{k}</dt>
                <dd className="text-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>
        <Section title="Fuentes de datos y límites">
          <div className="space-y-3 text-[13px]">
            {SOURCES.map(([name, gives, limits]) => (
              <div key={name}>
                <div className="font-medium">{name}</div>
                <div className="text-fg/85">{gives}</div>
                <div className="text-muted">{limits}</div>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Importante">
          <ul className="list-disc space-y-2 pl-5 text-[13px] text-muted">
            <li>Ningún modelo conoce el precio de mañana ni la alineación oficial: las recomendaciones son señales para decidir tú, no órdenes.</li>
            <li>En LaLiga Fantasy los fichajes del mercado son por puja: otro mánager puede ofrecer más.</li>
            <li>Si empiezas la jornada con saldo negativo, tu equipo no puntúa.</li>
            <li>Registra en «Mi equipo» cada compra o venta que hagas en la app oficial para que el saldo y las recomendaciones cuadren.</li>
            <li>Los datos de demostración son ficticios y nunca se mezclan con los tuyos.</li>
          </ul>
        </Section>
      </div>
    </>
  );
}
