// Añade una ficha a config.json resolviendo su nombre/keyword desde un link de Google
// (share.google, maps.app.goo.gl, o un google.com/maps/place directo).
//
// Uso:
//   node scripts/add-business.js "<url>" ["keyword1;keyword2"] ["nombre opcional"]
//
// keywords y nombre son opcionales: si no los pasas, se usa el nombre resuelto de
// la ficha y una keyword sugerida a partir de él (revisa el resultado en config.json).

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { resolveBusinessUrl } = require("../src/utils");
const { readResolvedCache, writeResolvedCache } = require("../src/store");

async function main() {
  const [, , url, keywordsArg, nameArg] = process.argv;
  if (!url) {
    console.error('Uso: node scripts/add-business.js "<url>" ["keyword1;keyword2"] ["nombre opcional"]');
    process.exit(1);
  }

  const configPath = path.join(__dirname, "..", "config.json");
  if (!fs.existsSync(configPath)) {
    console.error("No encuentro config.json. Copia config.example.json a config.json primero.");
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  if (config.businesses.some((b) => b.url === url)) {
    console.log("Esa URL ya está en config.json — no añado un duplicado.");
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "es-ES" });
  const page = await context.newPage();
  const resolved = await resolveBusinessUrl(page, url);
  await browser.close();

  if (!resolved.name) {
    console.warn(
      "No he podido leer el nombre de la ficha desde ese link. La añado igualmente, pero " +
        "tendrás que poner 'name' y 'keywords' a mano en config.json."
    );
  }

  const cache = readResolvedCache();
  cache[url] = resolved;
  writeResolvedCache(cache);

  const entry = { url };
  if (nameArg) entry.name = nameArg;
  if (keywordsArg) {
    entry.keywords = keywordsArg
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  config.businesses.push(entry);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");

  const finalKeyword = entry.keywords ? entry.keywords.join(", ") : resolved.keywordSuggested;
  console.log(
    `Añadida: "${resolved.name || "(nombre no resuelto)"}" — keyword: "${
      finalKeyword || "(ninguna detectada, añádela a mano)"
    }"`
  );
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
