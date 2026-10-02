const crypto = require('crypto')

const NAME_MAX = 24

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex')

// Le nom affiché : sans caractères de contrôle ni espaces en trop, null s'il est vide.
function cleanName (name) {
  if (name == null) return null
  if (typeof name !== 'string') throw new HttpError(400, 'name doit être une chaîne')
  const clean = name.replace(/[\p{C}]/gu, '').replace(/\s+/g, ' ').trim()
  if ([...clean].length > NAME_MAX) throw new HttpError(400, `name : ${NAME_MAX} caractères au plus`)
  return clean || null
}

class HttpError extends Error {
  constructor (status, message) {
    super(message)
    this.status = status
  }
}

function players (db) {
  const insert = db.prepare('INSERT INTO players (id, token_hash, name, created_at) VALUES (?, ?, ?, ?)')
  const byToken = db.prepare('SELECT id, name FROM players WHERE token_hash = ?')
  const rename = db.prepare('UPDATE players SET name = ? WHERE id = ?')

  return {
    // Un nouveau joueur : son jeton n'est rendu qu'ici (la base n'en garde que l'empreinte).
    create (name) {
      const player = { id: crypto.randomUUID(), name: cleanName(name) }
      const token = crypto.randomBytes(32).toString('base64url')
      insert.run(player.id, hash(token), player.name, Date.now())
      return { ...player, token }
    },
    rename (id, name) {
      const clean = cleanName(name)
      rename.run(clean, id)
      return { id, name: clean }
    },
    // Middleware : `Authorization: Bearer <jeton>` → req.player. `required` : 401 sans joueur.
    auth (required) {
      return (req, res, next) => {
        const header = req.get('authorization') || ''
        const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null
        req.player = token ? byToken.get(hash(token)) || null : null
        if (required && !req.player) return next(new HttpError(401, 'Joueur inconnu'))
        next()
      }
    }
  }
}

module.exports = { players, HttpError, NAME_MAX }
