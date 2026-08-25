// store.js
// Guarda cada resultado de búsqueda como una línea JSON (JSONL) en data/history.jsonl.
// Usar JSONL en vez de un único JSON grande evita corromper todo el histórico
// si un scrape se interrumpe a mitad, y permite hacer "append" sin reescribir el fichero.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const HISTORY_FILE = path.join(DATA_DIR, "history.jsonl");
const RESOLVED_FILE = path.join(DATA_DIR, "resolved.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Añade un registro de resultado al histórico.
 * @param {object} record
 */
function appendRecord(record) {
  ensureDataDir();
  const line = JSON.stringify(record) + "\n";
  fs.appendFileSync(HISTORY_FILE, line, "utf8");
}

/**
 * Lee todos los registros de un fichero JSONL (por defecto, el histórico real).
 * Ignora líneas vacías o corruptas en vez de romper la lectura completa.
 */
function readAll(filePath = HISTORY_FILE) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8");
  const records = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch (err) {
      console.warn(`Línea corrupta ignorada en ${filePath}: ${trimmed.slice(0, 80)}...`);
    }
  }
  return records;
}

/**
 * Caché de fichas ya resueltas a partir de su URL (share.google / maps.app.goo.gl):
 * nombre, keyword sugerida y coordenadas. Evita tener que re-resolver el link en
 * cada ejecución — se persiste en data/resolved.json, que se comitea al repo igual
 * que el histórico, así que sobrevive entre ejecuciones de GitHub Actions.
 */
function readResolvedCache() {
  if (!fs.existsSync(RESOLVED_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(RESOLVED_FILE, "utf8"));
  } catch (err) {
    console.warn(`No se pudo leer ${RESOLVED_FILE}, empiezo con caché vacía: ${err.message}`);
    return {};
  }
}

function writeResolvedCache(cache) {
  ensureDataDir();
  fs.writeFileSync(RESOLVED_FILE, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

module.exports = {
  appendRecord,
  readAll,
  readResolvedCache,
  writeResolvedCache,
  HISTORY_FILE,
  RESOLVED_FILE,
  DATA_DIR,
};
