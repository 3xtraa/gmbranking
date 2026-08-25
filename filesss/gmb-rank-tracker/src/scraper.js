// scraper.js
//
// Para cada ficha configurada (por link de Google, o por nombre manual) y cada
// keyword asociada, busca en Google Maps y guarda posición, estrellas y reseñas.
// Las fichas con "url" se resuelven una vez (nombre + coords) y esa resolución
// se cachea en data/resolved.json para no repetirla en cada ejecución.
//
// Lee las notas de scraping/robustez en el README antes de programar esto a diario.

const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { appendRecord, readResolvedCache, writeResolvedCache } = require("./store");
const {
  sleep,
  randomDelay,
  isSameBusiness,
  parseRatingReviews,
  acceptConsentIfPresent,
  looksLikeBlocked,
  resolveBusinessUrl,
} = require("./utils");

const CONFIG_PATH = process.argv.includes("--config")
  ? process.argv[process.argv.indexOf("--config") + 1]
  : path.join(__dirname, "..", "config.json");

const FORCE_REFRESH_LINKS = process.argv.includes("--refresh-links");

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(
      `No encuentro ${CONFIG_PATH}. Copia config.example.json a config.json y edítalo con tus fichas.`
    );
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

async function scrollFeed(page, feedSelector, maxResults) {
  let previousCount = 0;
  let stagnantRounds = 0;

  while (stagnantRounds < 3) {
    const count = await page.locator(`${feedSelector} a[href*="/maps/place/"]`).count();
    if (count >= maxResults) break;

    await page.evaluate((sel) => {
      const feed = document.querySelector(sel);
      if (feed) feed.scrollTop = feed.scrollHeight;
    }, feedSelector);

    await sleep(1200 + Math.random() * 800);
    stagnantRounds = count === previousCount ? stagnantRounds + 1 : 0;
    previousCount = count;
  }
}

async function searchOnce(page, { business, keyword, location, maxResultsToScan }) {
  const query = encodeURIComponent(keyword);
  const url = `https://www.google.com/maps/search/${query}/@${location.lat},${location.lng},${location.zoom}z?hl=es`;

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await acceptConsentIfPresent(page);

  if (await looksLikeBlocked(page)) {
    return { blocked: true };
  }

  const feedSelector = 'div[role="feed"]';
  try {
    await page.waitForSelector(feedSelector, { timeout: 15000 });
  } catch (_) {
    // Puede que solo haya salido 1 resultado (Google redirige directo a la ficha).
    const singleResult = await page.locator("h1").first().innerText().catch(() => null);
    if (singleResult && isSameBusiness(singleResult, business)) {
      const bodyText = await page.locator("body").innerText().catch(() => "");
      const { rating, reviews } = parseRatingReviews(bodyText);
      return { found: true, position: 1, rating, reviews, totalScanned: 1 };
    }
    return { found: false, totalScanned: 0 };
  }

  await scrollFeed(page, feedSelector, maxResultsToScan);

  const items = await page.$$eval(
    `${feedSelector} a[href*="/maps/place/"]`,
    (anchors, max) =>
      anchors.slice(0, max).map((a, idx) => {
        const name = a.getAttribute("aria-label") || a.textContent.trim();
        const block = a.closest("div[jsaction]") || a.parentElement?.parentElement || a.parentElement;
        return { index: idx + 1, name, text: block ? block.innerText : "" };
      }),
    maxResultsToScan
  );

  const match = items.find((item) => isSameBusiness(item.name, business));
  if (!match) return { found: false, totalScanned: items.length };

  const { rating, reviews } = parseRatingReviews(match.text);
  return { found: true, position: match.index, rating, reviews, totalScanned: items.length };
}

function resolveSearchLocation(config, resolvedCache) {
  if (config.location) return config.location;

  const firstResolved = Object.values(resolvedCache).find((r) => r.lat && r.lng);
  if (firstResolved) {
    console.warn(
      "No has definido 'location' en config.json: uso la ubicación de la primera ficha resuelta. " +
        "Es menos realista que un punto de búsqueda propio (el de un cliente típico) — añade " +
        "'location' en config.json en cuanto puedas."
    );
    return { label: "auto", lat: firstResolved.lat, lng: firstResolved.lng, zoom: 14 };
  }

  console.error("Necesito 'location' (lat/lng) en config.json, o al menos una ficha con url resoluble.");
  process.exit(1);
}

async function run() {
  const config = loadConfig();
  const resolvedCache = readResolvedCache();

  const browser = await chromium.launch({ headless: config.headless !== false });
  const context = await browser.newContext({
    locale: "es-ES",
    viewport: { width: 1366, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  // 1) Resuelve primero los links pendientes (o todos, con --refresh-links).
  for (const business of config.businesses) {
    if (!business.url) continue;
    if (resolvedCache[business.url] && !FORCE_REFRESH_LINKS) continue;

    console.log(`Resolviendo ficha: ${business.url}`);
    try {
      resolvedCache[business.url] = await resolveBusinessUrl(page, business.url);
      writeResolvedCache(resolvedCache);
      const r = resolvedCache[business.url];
      console.log(`  -> "${r.name}" (keyword sugerida: "${r.keywordSuggested}")`);
    } catch (err) {
      console.error(`  Error resolviendo ${business.url}: ${err.message}`);
    }
    await randomDelay(config.delayBetweenSearchesMs || [4000, 9000]);
  }

  // 2) Búsquedas de ranking propiamente dichas.
  const location = resolveSearchLocation(config, resolvedCache);
  const delayRange = config.delayBetweenSearchesMs || [8000, 18000];
  const timestamp = new Date().toISOString();
  let blockedStreak = 0;

  outer: for (const businessCfg of config.businesses) {
    const resolved = businessCfg.url ? resolvedCache[businessCfg.url] : null;
    const name = businessCfg.name || resolved?.name;

    if (!name) {
      console.warn(`Sin nombre para ${businessCfg.url || "(entrada sin url ni name)"}, la salto.`);
      continue;
    }

    const aliases = [...(businessCfg.aliases || []), resolved?.name].filter(Boolean);
    const keywords = businessCfg.keywords?.length
      ? businessCfg.keywords
      : [resolved?.keywordSuggested].filter(Boolean);

    if (keywords.length === 0) {
      console.warn(`Sin keyword para "${name}". Añade "keywords" en config.json para esta ficha.`);
      continue;
    }

    const business = { name, aliases };

    for (const keyword of keywords) {
      console.log(`Buscando: "${keyword}" -> ${name}`);

      let result;
      try {
        result = await searchOnce(page, {
          business,
          keyword,
          location,
          maxResultsToScan: config.maxResultsToScan || 20,
        });
      } catch (err) {
        console.error(`  Error en la búsqueda: ${err.message}`);
        result = { error: err.message };
      }

      if (result.blocked) {
        blockedStreak += 1;
        console.warn("  ⚠️  Google ha mostrado una página de bloqueo/CAPTCHA. Saltando esta búsqueda.");
        if (blockedStreak >= 3) {
          console.error(
            "Varios bloqueos seguidos: paro aquí por hoy para no empeorarlo. Vuelve a intentarlo más tarde."
          );
          break outer;
        }
      } else {
        blockedStreak = 0;
        appendRecord({
          timestamp,
          business: name,
          keyword,
          locationLabel: location.label || null,
          found: !!result.found,
          position: result.found ? result.position : null,
          rating: result.rating ?? null,
          reviews: result.reviews ?? null,
          totalScanned: result.totalScanned ?? null,
          error: result.error || null,
        });
        console.log(
          result.found
            ? `  -> Posición ${result.position} | ${result.rating ?? "?"}★ | ${result.reviews ?? "?"} reseñas`
            : `  -> No aparece entre los primeros ${result.totalScanned ?? 0} resultados`
        );
      }

      await randomDelay(delayRange);
    }
  }

  await browser.close();
  console.log("\nListo. Genera el dashboard con: npm run report");
}

run().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
