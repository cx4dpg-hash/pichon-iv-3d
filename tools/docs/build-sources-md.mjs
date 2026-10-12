// Genera docs/SOURCES.md a partir de data/metadata.json (la misma fuente que usa la ventana ⓘ de
// la interfaz), para que el documento refleje exactamente lo que se ve en pantalla.
// Uso: node tools/docs/build-sources-md.mjs   (escribe docs/SOURCES.md)
//      node tools/docs/build-sources-md.mjs --check   (falla si el archivo está desactualizado)
import { readFileSync, writeFileSync } from "node:fs";

const CONFIDENCE = { high: "alta", medium: "media", low: "baja", unknown: "desconocida", low_to_medium: "baja a media" };
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);

export function renderSourcesMd(meta) {
  const byId = new Map(meta.sources.map((s) => [s.id, s]));
  const out = [];
  out.push("# Fuentes de datos, metodología y limitaciones");
  out.push("");
  out.push(
    "> Este documento se **genera** desde [`data/metadata.json`](../data/metadata.json) con `node tools/docs/build-sources-md.mjs` y refleja exactamente la ventana ⓘ de la interfaz (Metodología, Fuentes de datos, Limitaciones). No se edita a mano: se cambia `metadata.json` y se regenera.",
  );
  out.push("");
  out.push("## Metodología");
  out.push("");
  for (const item of meta.methodology) out.push(`- **${item.title}.** ${item.text}`);
  out.push("");
  out.push("## Fuentes de datos");
  for (const group of meta.groups) {
    out.push("");
    out.push(`### ${group.title}`);
    out.push("");
    for (const point of group.points) out.push(`- ${point}`);
    for (const id of group.sourceIds) {
      const s = byId.get(id);
      out.push("");
      out.push(`**${s.name}** (\`${s.id}\`) · ${s.type.replaceAll("_", " ")} · confianza ${CONFIDENCE[s.generalConfidence] ?? s.generalConfidence}`);
      if (s.provides?.length) out.push(`- Sustenta: ${s.provides.join("; ")}.`);
      if (list(s.file).length) out.push(`- Archivo: ${list(s.file).map((f) => `\`${f}\``).join(", ")}${s.versioned === false ? " (no versionado)" : ""}`);
      if (list(s.url).length) out.push(`- Enlace: ${list(s.url).join(" · ")}`);
      if (s.notes) out.push(`- Notas: ${s.notes}`);
    }
  }
  out.push("");
  out.push("## Limitaciones");
  out.push("");
  for (const text of meta.limitations) out.push(`- ${text}`);
  out.push("");
  return out.join("\n");
}

if (process.argv[1] && process.argv[1].endsWith("build-sources-md.mjs")) {
  const meta = JSON.parse(readFileSync(new URL("../../data/metadata.json", import.meta.url), "utf8"));
  const text = renderSourcesMd(meta);
  const target = new URL("../../docs/SOURCES.md", import.meta.url);
  if (process.argv.includes("--check")) {
    const current = readFileSync(target, "utf8").replace(/\r\n/g, "\n");
    if (current !== text) {
      console.error("docs/SOURCES.md está desactualizado: ejecute node tools/docs/build-sources-md.mjs");
      process.exit(1);
    }
  } else {
    writeFileSync(target, text);
    console.log("docs/SOURCES.md actualizado");
  }
}
