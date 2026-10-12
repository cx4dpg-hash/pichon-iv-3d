// Genera config.local.js para el despliegue en GitHub Pages a partir del secreto CESIUM_ION_TOKEN
// (variable de entorno). NUNCA imprime el valor. Uso: node .github/scripts/write-config.mjs <salida>
import { writeFileSync } from "node:fs";

const output = process.argv[2];
if (!output) {
  console.error("Usage: node write-config.mjs <output-file>");
  process.exit(2);
}
const token = (process.env.CESIUM_ION_TOKEN ?? "").trim();
if (!token) {
  console.error("CESIUM_ION_TOKEN is not configured");
  process.exit(1);
}
// JSON.stringify escapa comillas y barras: el archivo queda siempre como JavaScript válido.
writeFileSync(output, `window.PICHON_CONFIG = {\n  cesiumIonToken: ${JSON.stringify(token)},\n};\n`);
console.log(`Wrote ${output}`);
