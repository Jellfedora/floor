const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Database = require('better-sqlite3')
const { open } = require('../src/db')

test('les doublons d’avant les pseudos uniques sont numérotés, le plus ancien garde le sien', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'floor-')), 'floor.db')
  // Une base à la version 1.
  const old = new Database(file)
  old.exec(`CREATE TABLE players (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, name TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE scores (game TEXT NOT NULL, player_id TEXT NOT NULL, score INTEGER NOT NULL, details TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (game, player_id));
    PRAGMA user_version = 1;`)
  const add = old.prepare('INSERT INTO players VALUES (?, ?, ?, ?)')
  add.run('a', 'ha', 'Dio', 1)
  add.run('b', 'hb', 'DIO', 2)
  add.run('c', 'hc', 'dio', 3)
  add.run('d', 'hd', null, 4)
  add.run('e', 'he', null, 5)
  old.close()

  const db = open(file)
  const names = db.prepare('SELECT name FROM players ORDER BY created_at').all().map((p) => p.name)
  assert.deepEqual(names, ['Dio', 'DIO 2', 'dio 3', null, null])
  assert.throws(() => db.prepare("UPDATE players SET name_key = 'dio' WHERE id = 'b'").run())
})
