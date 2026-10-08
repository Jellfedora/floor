// Le chat des jeux : un message est du texte d'une ligne, sans caractères de contrôle, pas trop long.
const CHAT_MAX = 200
// Gardés par partie (Puissance 4), ou envoyés au plus tant par seconde (Ronnie.io).
const CHAT_KEEP = 50

// Le message nettoyé, ou null s'il n'en reste rien.
function clean (text) {
  if (typeof text !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const line = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, CHAT_MAX)
  return line || null
}

module.exports = { clean, CHAT_MAX, CHAT_KEEP }
