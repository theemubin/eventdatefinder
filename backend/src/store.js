import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "data", "db.json");

function ensureDbFile() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const initial = { events: [], participants: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
  }
}

function loadDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, "utf8");
  return JSON.parse(raw);
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function readDb() {
  return loadDb();
}

export function writeDb(mutator) {
  const db = loadDb();
  mutator(db);
  saveDb(db);
  return db;
}
