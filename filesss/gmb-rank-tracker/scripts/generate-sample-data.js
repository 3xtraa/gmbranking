// Genera data/history.sample.jsonl con 14 días de datos simulados para poder
// ver el dashboard (npm run demo-report) antes de tener datos reales.
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "data", "history.sample.jsonl");
const DAYS = 14;
const now = Date.now();

const series = [
  {
    business: "Cerrajería Rapid Barcelona",
    keyword: "cerrajero barcelona",
    locationLabel: "Barcelona centro",
    // sube poco a poco
    positions: [9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3],
    ratingStart: 4.4,
    reviewsStart: 86,
    reviewsPerDay: 1.2,
  },
  {
    business: "Cerrajería Rapid Barcelona",
    keyword: "cerrajero urgente barcelona",
    locationLabel: "Barcelona centro",
    // se mantiene arriba, estable
    positions: [2, 2, 1, 2, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1],
    ratingStart: 4.4,
    reviewsStart: 86,
    reviewsPerDay: 1.2,
  },
  {
    business: "Cerrajería Rapid Gràcia",
    keyword: "cerrajero gracia barcelona",
    locationLabel: "Gràcia, Barcelona",
    // cae, incluso sale del top escaneado los últimos días
    positions: [3, 3, 4, 4, 5, 6, 7, 8, 9, 11, 13, null, 15, null],
    ratingStart: 4.1,
    reviewsStart: 34,
    reviewsPerDay: 0.1,
  },
];

const lines = [];
for (const s of series) {
  for (let i = 0; i < DAYS; i++) {
    const ts = new Date(now - (DAYS - 1 - i) * 24 * 3600 * 1000).toISOString();
    const pos = s.positions[i];
    lines.push(
      JSON.stringify({
        timestamp: ts,
        business: s.business,
        keyword: s.keyword,
        locationLabel: s.locationLabel,
        found: pos !== null,
        position: pos,
        rating: Math.min(5, +(s.ratingStart + i * 0.01).toFixed(1)),
        reviews: Math.round(s.reviewsStart + i * s.reviewsPerDay),
        totalScanned: 20,
        error: null,
      })
    );
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
console.log(`Datos de ejemplo escritos en ${OUT}`);
