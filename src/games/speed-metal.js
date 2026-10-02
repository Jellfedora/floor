const { HttpError } = require('../players')

// Un entier entre min et max, ou une erreur 400.
function int (body, key, min, max) {
  const v = body[key]
  if (!Number.isInteger(v) || v < min || v > max) throw new HttpError(400, `${key} : un entier entre ${min} et ${max}`)
  return v
}

// Le jeu de frappe de la page d'accueil de Ronnie : des lettres tapées juste en une minute (plus les
// secondes gagnées par les combos). Les bornes écartent l'impossible, pas la triche.
module.exports = {
  id: 'speed-metal',
  name: 'Speed Metal',
  order: 'desc',
  score (body) {
    const details = {
      letters: int(body, 'letters', 1, 2000),
      words: int(body, 'words', 0, 600),
      wpm: int(body, 'wpm', 0, 400),
      accuracy: int(body, 'accuracy', 0, 100),
      combo: int(body, 'combo', 0, 600)
    }
    return { score: details.letters, details }
  }
}
