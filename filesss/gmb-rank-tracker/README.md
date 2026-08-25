# GMB Rank Tracker

Monitor casero de posicionamiento local: le pasas el link de Google (share.google,
maps.app.goo.gl, o un `google.com/maps/place/...`) de cada ficha que gestiones, y
para cada una comprueba en qué posición sale en Google Maps para las keywords que
te importan, junto con estrellas y nº de reseñas. Con el histórico genera un panel
que te dice de un vistazo qué fichas suben, cuáles bajan y cuáles conviene reforzar
con más reseñas.

Pensado para vivir en GitHub: **GitHub Actions hace el scraping** (con un navegador
real, sin límites de CORS) y comitea los resultados al repo; **GitHub Pages sirve
el panel** como una página estática que ves siempre actualizada, sin depender de
tener nada abierto en tu ordenador ni de un backend de pago.

## Por qué así (y no todo en el navegador)

Lo más cómodo sería un panel 100% en el navegador donde pegas un link y ya — pero
un link de `share.google` no se puede resolver con `fetch()` desde JavaScript de
cliente: Google no permite leer esa respuesta entre dominios (CORS), así que una
página estática de GitHub Pages sola no puede seguir ese redirect ni leer el
nombre de la ficha. Un navegador automatizado (Playwright) sí puede, porque
navega de verdad a la página en vez de pedirla por fetch. Por eso el resolver de
links y el scraping viven en GitHub Actions (un runner con navegador real) y
Pages se limita a mostrar el resultado ya generado.

## 1. Súbelo a un repo de GitHub

Este proyecto ya es un repo git local. Crea uno vacío en GitHub y súbelo:

```bash
cd gmb-rank-tracker
git remote add origin https://github.com/<tu-usuario>/<tu-repo>.git
git branch -M main
git push -u origin main
```

## 2. Permisos y Pages

- **Settings → Actions → General → Workflow permissions** → marca *"Read and write
  permissions"*. Sin esto, el workflow no podrá comitear el histórico ni el panel.
- **Settings → Pages** → Source: *"Deploy from a branch"* → branch `main`,
  carpeta `/docs` → Save. En un par de minutos tendrás el panel en
  `https://<tu-usuario>.github.io/<tu-repo>/`.

## 3. Configura tus fichas

Edita `config.json` en el repo (o cópialo desde `config.example.json` si no
existe todavía) y añade una entrada por ficha con su link de Google:

```json
{
  "location": { "label": "Barcelona centro", "lat": 41.3851, "lng": 2.1734, "zoom": 13 },
  "maxResultsToScan": 20,
  "businesses": [
    { "url": "https://share.google/1skNsjgFoLyo5NvC5" }
  ]
}
```

Cuando corra el scraping, esa ficha se resuelve automáticamente: abre el link,
lee el nombre real ("Cerrajero Viladecans 24h") y sugiere una keyword quitando
coletillas típicas ("24h", "urgente", "abierto 24 horas"...) → `"Cerrajero
Viladecans"`. La resolución se guarda en `data/resolved.json` para no repetirla
cada día, y su resultado (nombre y keyword usados) queda ahí para que lo revises.

Puedes forzar tu propia keyword o nombre en vez de la sugerida:

```json
{ "url": "https://share.google/1skNsjgFoLyo5NvC5", "keywords": ["cerrajero viladecans", "cerrajero urgente viladecans"] }
```

**location** es el punto desde el que "buscas" — como el ranking local depende
mucho de la ubicación exacta, ponlo en el centro de la zona que más te importa
(tu ciudad o barrio), no en la propia ficha, o estarás midiendo un caso irreal
(la búsqueda desde el propio local casi siempre sale primera).

### Añadir fichas sin tocar código

Pestaña **Actions** del repo → workflow **"Añadir ficha"** → *Run workflow* →
pega el link (y opcionalmente keywords separadas por `;`, o un nombre exacto) →
*Run*. Resuelve el link y comitea la entrada en `config.json` por ti — es lo más
parecido a un formulario de "añadir ficha" sin montar un backend propio.

## 4. Lanzar el scraping

- **Manual**: Actions → *"Scrape rankings y publicar panel"* → *Run workflow*.
- **Programado**: corre solo una vez al día (`0 6 * * *` UTC) — edítalo en
  `.github/workflows/scrape-and-publish.yml` si quieres otra hora, pero no lo
  pongas muy frecuente: no ayuda (el ranking local no cambia cada hora) y sube
  el riesgo de que Google bloquee las búsquedas.

Cada ejecución añade un registro por ficha+keyword a `data/history.jsonl`
(nunca se sobrescribe) y regenera `docs/index.html`, comiteando ambos cambios.
Así el panel y el histórico persisten en el repo pase lo que pase con tu
ordenador o el navegador — lo cierras, lo abres otro día, y sigue ahí.

## Cómo detecta la posición y los datos

Abre `google.com/maps/search/<keyword>/@lat,lng,zoom` (la misma vista de lista
que ves tú al buscar en Maps), hace scroll para cargar resultados hasta
`maxResultsToScan`, y busca tu ficha por nombre/alias en esa lista. La posición
es el orden en que aparece; estrellas y reseñas se leen del propio resultado.

## Uso en local (para probar antes de programarlo)

```bash
npm install
npx playwright install chromium
cp config.example.json config.json   # si aún no existe
npm run scrape                        # resuelve links + busca posiciones
npm run report                        # genera docs/index.html
npm run demo-report                   # o, sin datos reales: dashboard.demo.html con 14 días de ejemplo
```

## Limitaciones y cosas a tener en cuenta

- **No es una API oficial.** Es lectura del HTML de Google Maps: puede romperse
  si Google cambia el diseño, y puede bloquear o pedir CAPTCHA si detecta
  tráfico automatizado. El script mete esperas aleatorias y para tras varios
  bloqueos seguidos, pero eso reduce el riesgo, no lo anula. Para uso serio a
  diario con garantías, la alternativa robusta es una SERP API de pago (SerpApi,
  DataForSEO, Oxylabs...) que ya gestiona proxies y bloqueos por ti.
- **El ranking local es muy sensible a la ubicación de búsqueda** (y también
  varía por dispositivo, hora, historial del usuario...). Esto te da una muestra
  consistente y comparable día a día desde el mismo punto — muy útil para ver
  tendencia — pero no es "la" posición absoluta que ve cada cliente.
- **Estrellas y reseñas**: para esto existe la **Google Business Profile API**
  oficial (gratuita, requiere verificar que gestionas la ficha), mucho más
  fiable que leerlo del HTML. El scraping de Maps sigue siendo la única vía
  práctica para saber en qué puesto sales para una keyword, porque eso no lo
  expone ninguna API oficial.
- **La keyword sugerida es una heurística** (quita "24h", "urgente"...). Revisa
  `data/resolved.json` tras la primera resolución y, si no es la búsqueda que te
  interesa medir, pon `"keywords"` explícitas en esa entrada de `config.json`.
- El matching de negocio es por nombre. Si gestionas varias fichas con nombres
  muy parecidos en la misma zona, revisa `data/history.jsonl` para confirmar
  que ha encontrado la correcta.
- `config.json` y el histórico se comitean al repo tal cual — no metas ahí nada
  sensible (no hace falta: solo son links públicos de Maps y números de
  posición/reseñas).

## Estructura del proyecto

```
gmb-rank-tracker/
├── .github/workflows/
│   ├── scrape-and-publish.yml   # scraping diario + genera y publica el panel
│   └── add-business.yml         # formulario para añadir una ficha por link
├── config.example.json           # plantilla de configuración
├── config.json                    # tu configuración real (si no existe, cópiala de la anterior)
├── src/
│   ├── scraper.js                 # resuelve links, busca y guarda resultados
│   ├── utils.js                   # helpers compartidos (resolver link, parseo, anti-bloqueo)
│   ├── store.js                   # lectura/escritura del histórico y la caché de fichas
│   └── report.js                  # genera docs/index.html
├── scripts/
│   ├── add-business.js            # añade una ficha a config.json resolviendo su link
│   └── generate-sample-data.js    # datos de ejemplo para probar el panel sin scrapear
├── docs/
│   └── index.html                 # el panel — esto es lo que sirve GitHub Pages
└── data/
    ├── history.jsonl               # histórico real (se crea/actualiza al scrapear)
    └── resolved.json                # caché de nombre/keyword/coords por link
```
