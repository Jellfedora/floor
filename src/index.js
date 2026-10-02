const path = require('path')
const { open } = require('./db')
const { createApp } = require('./app')

const port = Number(process.env.PORT) || 5002
const file = process.env.FLOOR_DB || path.join(__dirname, '..', 'data', 'floor.db')
// Derrière un reverse proxy (nginx, Traefik...) : l'adresse du joueur vient de X-Forwarded-For.
const trustProxy = process.env.TRUST_PROXY ? (Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY) : false

const db = open(file)
const server = createApp(db, { trustProxy }).listen(port, () => {
  console.log(`floor écoute sur le port ${port} (base : ${file})`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    db.close()
    process.exit(0)
  }))
}
