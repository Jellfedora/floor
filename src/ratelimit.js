const { HttpError } = require('./players')

// Au plus `max` requêtes par `windowMs` et par adresse (en mémoire : remis à zéro au redémarrage).
function rateLimit (max, windowMs) {
  const hits = new Map()
  setInterval(() => {
    const now = Date.now()
    for (const [ip, h] of hits) if (now - h.since > windowMs) hits.delete(ip)
  }, windowMs).unref()
  return (req, res, next) => {
    const now = Date.now()
    let h = hits.get(req.ip)
    if (!h || now - h.since > windowMs) {
      h = { since: now, count: 0 }
      hits.set(req.ip, h)
    }
    if (++h.count > max) {
      res.set('Retry-After', Math.ceil((h.since + windowMs - now) / 1000))
      return next(new HttpError(429, 'Trop de requêtes'))
    }
    next()
  }
}

module.exports = { rateLimit }
