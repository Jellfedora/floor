const path = require('path')
const { open } = require('./db')
const { createApp } = require('./app')
const { blob } = require('./blob')
const { ronnheim } = require('./ronnheim')

const port = Number(process.env.PORT) || 5002
const file = process.env.FLOOR_DB || path.join(__dirname, '..', 'data', 'floor.db')
// Derrière un reverse proxy (nginx, Traefik...) : l'adresse du joueur vient de X-Forwarded-For.
const trustProxy = process.env.TRUST_PROXY ? (Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY) : false

const db = open(file)
const app = createApp(db, { trustProxy })
const server = app.listen(port, () => {
  console.log(`floor écoute sur le port ${port} (base : ${file})`)
})
const { wss } = blob(server, db, app.locals.players, { trustProxy })
const game = ronnheim(server, db, app.locals.players, { trustProxy })

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    // Les WebSockets ouverts empêcheraient le serveur de se fermer.
    for (const ws of [...wss.clients, ...game.wss.clients]) ws.terminate()
    server.close(() => {
      db.close()
      process.exit(0)
    })
  })
}
