// report.js
// Lee data/history.jsonl (o el fichero que se pase con --data) y genera un
// dashboard.html autocontenido (sin backend) con la posición actual, estrellas,
// reseñas y evolución de cada ficha.

const fs = require("fs");
const path = require("path");
const { readAll, HISTORY_FILE } = require("./store");

function argValue(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : fallback;
}

const DATA_PATH = argValue("--data", HISTORY_FILE);
// Por defecto escribe en docs/index.html: es la carpeta que GitHub Pages sirve
// cuando activas Pages con "Deploy from a branch" -> main -> /docs.
const OUT_PATH = argValue("--out", path.join(__dirname, "..", "docs", "index.html"));

function buildGroups(records) {
  const map = new Map();
  for (const r of records) {
    const key = `${r.business}|||${r.keyword}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }

  const groups = [];
  for (const [key, recsUnsorted] of map) {
    const recs = [...recsUnsorted].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );
    const [business, keyword] = key.split("|||");
    const latest = recs[recs.length - 1];
    const previous = recs.length > 1 ? recs[recs.length - 2] : null;

    let delta = null;
    let trend = "same";
    if (previous) {
      const prevPos = previous.found ? previous.position : null;
      const currPos = latest.found ? latest.position : null;
      if (prevPos != null && currPos != null) {
        delta = prevPos - currPos; // positivo = mejora (número de posición más bajo)
        trend = delta > 0 ? "up" : delta < 0 ? "down" : "same";
      } else if (prevPos != null && currPos == null) {
        trend = "down";
      } else if (prevPos == null && currPos != null) {
        trend = "up";
      }
    }

    groups.push({
      business,
      keyword,
      locationLabel: latest.locationLabel || null,
      maxScanned: Math.max(...recs.map((r) => r.totalScanned || 20), 20),
      records: recs.map((r) => ({
        timestamp: r.timestamp,
        position: r.found ? r.position : null,
        rating: r.rating,
        reviews: r.reviews,
        found: r.found,
      })),
      latest,
      previous,
      delta,
      trend,
    });
  }

  groups.sort(
    (a, b) => a.business.localeCompare(b.business) || a.keyword.localeCompare(b.keyword)
  );
  return groups;
}

function buildHtml(groups, generatedAt) {
  const dataJson = JSON.stringify({ groups, generatedAt }).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Panel de fichas — posicionamiento local</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js"></script>
<style>
  :root {
    --bg: #0B0E11;
    --panel: #12161C;
    --panel-border: #1E242D;
    --text: #E8ECF1;
    --muted: #8A94A6;
    --up: #35D399;
    --down: #FF6B5E;
    --stable: #5EA8FF;
    --warn: #F5B342;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  header.top {
    padding: 40px clamp(20px, 5vw, 64px) 24px;
    border-bottom: 1px solid var(--panel-border);
  }
  .eyebrow {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    letter-spacing: 0.12em;
    color: var(--stable);
    text-transform: uppercase;
    margin: 0 0 10px;
  }
  h1 {
    font-family: 'Space Grotesk', sans-serif;
    font-size: clamp(28px, 4vw, 40px);
    margin: 0 0 8px;
    font-weight: 700;
  }
  .subtitle { color: var(--muted); font-size: 14px; margin: 0; }
  .stats-row {
    display: flex; gap: 28px; flex-wrap: wrap;
    margin-top: 22px;
  }
  .stat { min-width: 120px; }
  .stat .n {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 26px; font-weight: 600;
  }
  .stat .l { color: var(--muted); font-size: 12px; margin-top: 2px; }
  main { padding: 32px clamp(20px, 5vw, 64px) 64px; }
  .empty {
    color: var(--muted); font-size: 14px; padding: 40px 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 20px;
    margin-bottom: 40px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--panel-border);
    border-radius: 10px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .card.alert { border-color: rgba(255,107,94,0.45); }
  .card-head .biz {
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 700;
    font-size: 16px;
    margin: 0 0 2px;
  }
  .card-head .kw {
    color: var(--muted);
    font-size: 12px;
    font-family: 'IBM Plex Mono', monospace;
  }
  .position-row { display: flex; align-items: center; gap: 16px; }
  .ladder-wrap { flex-shrink: 0; }
  .pos-block { display: flex; flex-direction: column; }
  .pos-num {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 34px;
    font-weight: 600;
    line-height: 1;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .pos-num .hash { color: var(--muted); font-size: 16px; }
  .trend { font-size: 13px; margin-top: 6px; font-family: 'IBM Plex Mono', monospace; }
  .trend.up { color: var(--up); }
  .trend.down { color: var(--down); }
  .trend.same { color: var(--muted); }
  .meta-row {
    display: flex; gap: 18px; font-size: 13px; color: var(--muted);
    border-top: 1px solid var(--panel-border); padding-top: 12px;
  }
  .meta-row b { color: var(--text); font-family: 'IBM Plex Mono', monospace; }
  .chart-box { height: 90px; margin-top: 4px; }
  section h2 {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 18px;
    border-left: 3px solid var(--warn);
    padding-left: 10px;
    margin: 0 0 16px;
  }
  table {
    width: 100%; border-collapse: collapse; font-size: 13px;
    background: var(--panel); border: 1px solid var(--panel-border); border-radius: 8px; overflow: hidden;
  }
  th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--panel-border); }
  th { color: var(--muted); font-weight: 500; font-family: 'IBM Plex Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  tr:last-child td { border-bottom: none; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 11px;
    font-family: 'IBM Plex Mono', monospace;
  }
  .badge.down { background: rgba(255,107,94,0.15); color: var(--down); }
  .badge.up { background: rgba(53,211,153,0.15); color: var(--up); }
  .badge.same { background: rgba(138,148,166,0.15); color: var(--muted); }
  footer {
    padding: 24px clamp(20px, 5vw, 64px) 48px;
    color: var(--muted); font-size: 12px; border-top: 1px solid var(--panel-border);
  }
</style>
</head>
<body>
<header class="top">
  <p class="eyebrow">SEO local · Google Maps</p>
  <h1>Panel de fichas</h1>
  <p class="subtitle" id="subtitle"></p>
  <div class="stats-row" id="statsRow"></div>
</header>
<main>
  <section>
    <div class="grid" id="cardsGrid"></div>
  </section>
  <section id="alertSection" style="display:none">
    <h2>Fichas a reforzar</h2>
    <table>
      <thead><tr><th>Ficha</th><th>Keyword</th><th>Posición</th><th>Estrellas</th><th>Reseñas</th><th>Tendencia</th></tr></thead>
      <tbody id="alertBody"></tbody>
    </table>
  </section>
</main>
<footer>Generado el <span id="genDate"></span>. Datos de scraping propio de Google Maps — usar como referencia orientativa, no como métrica oficial.</footer>

<script>
const DATA = ${dataJson};

function fmt(n) { return n === null || n === undefined ? '—' : n; }

function trendLabel(g) {
  if (g.delta === null && g.trend === 'same') return { text: 'sin histórico previo', cls: 'same' };
  if (g.trend === 'up') return { text: g.delta ? \`▲ subió \${g.delta} puesto\${g.delta === 1 ? '' : 's'}\` : '▲ entró en el ranking', cls: 'up' };
  if (g.trend === 'down') return { text: g.delta ? \`▼ bajó \${Math.abs(g.delta)} puesto\${Math.abs(g.delta) === 1 ? '' : 's'}\` : '▼ salió del top escaneado', cls: 'down' };
  return { text: '— sin cambios', cls: 'same' };
}

function ladderSvg(position, maxScanned) {
  const h = 70, w = 14, top = 6, bottom = h - 6;
  const clampedMax = Math.max(maxScanned, 10);
  const found = position !== null && position !== undefined;
  const ratio = found ? Math.min((position - 1) / (clampedMax - 1), 1) : 1;
  const y = top + ratio * (bottom - top);
  let color = '#8A94A6';
  if (found) {
    color = position <= 3 ? '#35D399' : position <= 10 ? '#F5B342' : '#FF6B5E';
  } else {
    color = '#FF6B5E';
  }
  return \`<svg width="\${w}" height="\${h}" viewBox="0 0 \${w} \${h}">
    <line x1="\${w/2}" y1="\${top}" x2="\${w/2}" y2="\${bottom}" stroke="#1E242D" stroke-width="2" stroke-linecap="round"/>
    <circle cx="\${w/2}" cy="\${y}" r="4.5" fill="\${color}" />
  </svg>\`;
}

function renderStats(groups) {
  const total = groups.length;
  const up = groups.filter(g => g.trend === 'up').length;
  const down = groups.filter(g => g.trend === 'down').length;
  const outTop3 = groups.filter(g => !g.latest.found || g.latest.position > 3).length;

  const stats = [
    { n: total, l: 'fichas monitorizadas' },
    { n: up, l: 'mejorando', color: 'var(--up)' },
    { n: down, l: 'cayendo', color: 'var(--down)' },
    { n: outTop3, l: 'fuera del top 3', color: 'var(--warn)' },
  ];

  document.getElementById('statsRow').innerHTML = stats.map(s =>
    \`<div class="stat"><div class="n" style="color:\${s.color || 'var(--text)'}">\${s.n}</div><div class="l">\${s.l}</div></div>\`
  ).join('');
}

function renderCards(groups) {
  const grid = document.getElementById('cardsGrid');
  if (groups.length === 0) {
    grid.innerHTML = '<p class="empty">Todavía no hay datos. Ejecuta "npm run scrape" para la primera pasada.</p>';
    return;
  }

  grid.innerHTML = groups.map((g, i) => {
    const t = trendLabel(g);
    const isAlert = t.cls === 'down' || (!g.latest.found) || (g.latest.found && g.latest.position > 5);
    return \`
    <div class="card \${isAlert ? 'alert' : ''}">
      <div class="card-head">
        <p class="biz">\${g.business}</p>
        <p class="kw">"\${g.keyword}"\${g.locationLabel ? ' · ' + g.locationLabel : ''}</p>
      </div>
      <div class="position-row">
        <div class="ladder-wrap">\${ladderSvg(g.latest.found ? g.latest.position : null, g.maxScanned)}</div>
        <div class="pos-block">
          <div class="pos-num"><span class="hash">#</span>\${g.latest.found ? g.latest.position : 'fuera'}</div>
          <div class="trend \${t.cls}">\${t.text}</div>
        </div>
      </div>
      <div class="meta-row">
        <span>★ <b>\${fmt(g.latest.rating)}</b></span>
        <span>reseñas <b>\${fmt(g.latest.reviews)}</b></span>
      </div>
      <div class="chart-box"><canvas id="chart-\${i}"></canvas></div>
    </div>\`;
  }).join('');

  groups.forEach((g, i) => {
    const ctx = document.getElementById('chart-' + i);
    if (!ctx || g.records.length < 2) return;
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: g.records.map(r => new Date(r.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })),
        datasets: [{
          data: g.records.map(r => r.position),
          borderColor: '#5EA8FF',
          backgroundColor: 'rgba(94,168,255,0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          spanGaps: false,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: { reverse: true, suggestedMin: 1, ticks: { color: '#8A94A6', stepSize: 5 }, grid: { color: '#1E242D' } },
          x: { ticks: { color: '#8A94A6', maxTicksLimit: 5 }, grid: { display: false } },
        },
        plugins: { legend: { display: false } },
      }
    });
  });
}

function renderAlerts(groups) {
  const worst = groups
    .filter(g => g.trend === 'down' || !g.latest.found || (g.latest.found && g.latest.position > 3))
    .sort((a, b) => (a.latest.found ? a.latest.position : 999) - (b.latest.found ? b.latest.position : 999) < 0 ? -1 : 1)
    .sort((a, b) => (a.trend === 'down' ? -1 : 1) - (b.trend === 'down' ? -1 : 1));

  if (worst.length === 0) return;
  document.getElementById('alertSection').style.display = 'block';
  document.getElementById('alertBody').innerHTML = worst.map(g => {
    const t = trendLabel(g);
    return \`<tr>
      <td>\${g.business}</td>
      <td>\${g.keyword}</td>
      <td>\${g.latest.found ? '#' + g.latest.position : 'fuera del top escaneado'}</td>
      <td>\${fmt(g.latest.rating)}</td>
      <td>\${fmt(g.latest.reviews)}</td>
      <td><span class="badge \${t.cls}">\${t.text}</span></td>
    </tr>\`;
  }).join('');
}

document.getElementById('subtitle').textContent = DATA.groups[0]?.locationLabel
  ? 'Ubicación de referencia: ' + DATA.groups[0].locationLabel
  : 'Posicionamiento local por ficha y keyword';
document.getElementById('genDate').textContent = new Date(DATA.generatedAt).toLocaleString('es-ES');

renderStats(DATA.groups);
renderCards(DATA.groups);
renderAlerts(DATA.groups);
</script>
</body>
</html>`;
}

function run() {
  const records = readAll(DATA_PATH);
  const groups = buildGroups(records);
  const html = buildHtml(groups, new Date().toISOString());
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, html, "utf8");
  console.log(`Dashboard generado en ${OUT_PATH} (${groups.length} fichas/keywords, ${records.length} registros)`);
}

run();
