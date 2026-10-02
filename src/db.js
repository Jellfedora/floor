const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

// Chaque entrée fait passer la base à la version suivante (PRAGMA user_version).
const migrations = [
  `CREATE TABLE players (
     id TEXT PRIMARY KEY,
     token_hash TEXT NOT NULL UNIQUE,
     name TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE scores (
     game TEXT NOT NULL,
     player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
     score INTEGER NOT NULL,
     details TEXT NOT NULL,
     at INTEGER NOT NULL,
     PRIMARY KEY (game, player_id)
   );
   CREATE INDEX scores_board ON scores (game, score DESC, at ASC);`
]

// Ouvre (ou crée) la base : `file` vaut ':memory:' pour les tests.
function open (file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  const version = db.pragma('user_version', { simple: true })
  for (let v = version; v < migrations.length; v++) {
    db.transaction(() => {
      db.exec(migrations[v])
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
  return db
}

module.exports = { open }
