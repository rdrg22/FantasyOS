import type { MetadataRoute } from "next";

/** Permite "Añadir a pantalla de inicio" y abrir Fantasy OS a pantalla completa, como una app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fantasy OS",
    short_name: "Fantasy OS",
    description: "Asistente de decisiones para LaLiga Fantasy",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#050a14",
    theme_color: "#050a14",
    lang: "es",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
