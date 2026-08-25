// utils.js — funciones compartidas entre el scraper y el script de alta de fichas.

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay([min, max]) {
  const ms = Math.floor(min + Math.random() * (max - min));
  return sleep(ms);
}

function normalize(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/\s+/g, " ")
    .trim();
}

function isSameBusiness(candidateName, business) {
  const candidate = normalize(candidateName);
  const targets = [business.name, ...(business.aliases || [])].map(normalize);
  return targets.some((t) => t && (candidate.includes(t) || t.includes(candidate)));
}

// Extrae "rating" y "reseñas" de un bloque de texto tipo "4,5(238) · Cerrajero · Abierto ahora"
// o de un aria-label tipo "4,5 estrellas 238 reseñas".
function parseRatingReviews(text) {
  if (!text) return { rating: null, reviews: null };

  let match = text.match(/(\d[.,]\d)\s*\(([\d.,]+)\)/);
  if (match) {
    return {
      rating: parseFloat(match[1].replace(",", ".")),
      reviews: parseInt(match[2].replace(/[.,]/g, ""), 10),
    };
  }

  match = text.match(/(\d[.,]\d)\s*(estrellas?|stars)\s*([\d.,]+)\s*(rese|opinion|review)/i);
  if (match) {
    return {
      rating: parseFloat(match[1].replace(",", ".")),
      reviews: parseInt(match[3].replace(/[.,]/g, ""), 10),
    };
  }

  return { rating: null, reviews: null };
}

async function acceptConsentIfPresent(page) {
  const consentSelectors = [
    'button:has-text("Aceptar todo")',
    'button:has-text("Rechazar todo")',
    'button:has-text("Accept all")',
    'form[action*="consent"] button',
  ];
  for (const sel of consentSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.click({ timeout: 2000 });
        await sleep(1000);
        return;
      }
    } catch (_) {
      // no estaba presente, seguimos
    }
  }
}

async function looksLikeBlocked(page) {
  const url = page.url();
  if (url.includes("/sorry/")) return true;
  const bodyText = await page.locator("body").innerText().catch(() => "");
  return /unusual traffic|tráfico inusual|no soy un robot/i.test(bodyText);
}

// Quita coletillas típicas ("24h", "urgente", "abierto 24 horas"...) del nombre de
// la ficha para sugerir una keyword de búsqueda razonable.
// Es una heurística: revisa siempre el resultado en config.json y ajústalo a mano
// si la búsqueda sugerida no es la que te interesa medir.
function suggestKeyword(name) {
  if (!name) return null;
  let k = name;
  const suffixPatterns = [
    /\babiert[oa]\s+24\s*h?(?:oras)?\b/gi,
    /\bservicio\s+24\s*h?(?:oras)?\b/gi,
    /\b24\s?\/?\s?7\b/gi,
    /\b24\s?h(?:oras)?\b/gi,
    /\burgente(s)?\b/gi,
    /\bnon[-\s]?stop\b/gi,
  ];
  for (const p of suffixPatterns) k = k.replace(p, " ");
  return k.replace(/\s+/g, " ").trim();
}

// Navega a un link de ficha (share.google, maps.app.goo.gl o un google.com/maps/place
// directo), espera a que resuelva a la página de la ficha, y extrae nombre y coordenadas.
// Al ser una navegación real de un navegador (Playwright), no hay problema de CORS como
// lo habría intentando resolver el mismo link con fetch() desde una página estática.
async function resolveBusinessUrl(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await acceptConsentIfPresent(page);
  await page.waitForURL(/\/maps\/place\//, { timeout: 15000 }).catch(() => {});
  await sleep(1000); // deja que el título termine de cargar tras el redirect

  const finalUrl = page.url();
  const rawName = await page.locator("h1").first().innerText().catch(() => null);
  const name = rawName ? rawName.trim() : null;
  const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+),(\d+\.?\d*)z/);

  return {
    resolvedUrl: finalUrl,
    name,
    keywordSuggested: suggestKeyword(name),
    lat: coordMatch ? parseFloat(coordMatch[1]) : null,
    lng: coordMatch ? parseFloat(coordMatch[2]) : null,
    resolvedAt: new Date().toISOString(),
  };
}

module.exports = {
  sleep,
  randomDelay,
  normalize,
  isSameBusiness,
  parseRatingReviews,
  acceptConsentIfPresent,
  looksLikeBlocked,
  suggestKeyword,
  resolveBusinessUrl,
};
