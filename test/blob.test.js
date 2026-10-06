const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const WebSocket = require('ws')
const { open } = require('../src/db')
const { createApp } = require('../src/app')
const { blob } = require('../src/blob')
const { World, radius, mass, GOLD, skinsOf } = require('../src/blob/world')

// Un hasard qui se répète, pour des tests stables.
function seeded (seed) {
  let x = seed
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648
    return x / 2147483648
  }
}

test('les règles : manger, se diviser, fusionner, éclater sur un virus', { timeout: 15000 }, () => {
  const world = new World({ random: seeded(1), bots: false })
  const big = world.join('Dio')
  const small = world.join('Ozzy')
  big.cells[0].m = 200
  Object.assign(big.cells[0], { x: 1000, y: 1000 })
  Object.assign(small.cells[0], { x: 1010, y: 1000, m: 20 })
  world.viruses = []
  world.step(1 / 40)
  assert.equal(small.cells.length, 0)
  assert.ok(mass(big) >= 220 - 1)
  assert.deepEqual(world.drain().map((n) => n.t), ['kill'])

  world.split(big.id)
  assert.equal(big.cells.length, 2)
  // Les moitiés finissent par revenir ensemble.
  for (let k = 0; k < 40 * 30; k++) world.step(1 / 40)
  assert.equal(big.cells.length, 1)

  big.cells[0].m = 300
  world.viruses = [{ x: big.cells[0].x, y: big.cells[0].y, m: 100 }]
  world.step(1 / 40)
  assert.ok(big.cells.length > 1, 'éclatée')
  assert.ok(Math.abs(mass(big) - 400) < 5)
  assert.ok(world.viruses[0].x !== big.cells[0].x)
})

test('les bonus : vitesse, aimant, bouclier', { timeout: 15000 }, () => {
  const world = new World({ random: seeded(3), bots: false })
  const dio = world.join('Dio')
  const ozzy = world.join('Ozzy')
  const at = { x: 2000, y: 2000 }
  Object.assign(dio.cells[0], at)
  world.bonuses = [{ id: 1, ...at, kind: 2, back: 0 }]
  world.step(1 / 40)
  assert.ok(dio.fx.shield > 3)
  assert.deepEqual(world.drain(), [{ t: 'bonus', player: dio.id, kind: 'shield' }])
  // Protégé : le gros ne le mange pas.
  Object.assign(ozzy.cells[0], { ...at, m: 500 })
  world.step(1 / 40)
  assert.equal(dio.cells.length, 1)
  // L'aimant attrape les granules de plus loin.
  dio.fx.magnet = 5
  ozzy.cells = []
  world.pellets = [{ id: 9, x: at.x + 100, y: at.y, hue: 0, m: 1, vx: 0, vy: 0, ejected: false, gold: false }]
  const before = mass(dio)
  world.step(1 / 40)
  assert.ok(mass(dio) > before)
})

test('les événements : pluie dorée, boss, Ronnie', { timeout: 15000 }, () => {
  const world = new World({ random: seeded(5) })
  world.start('rain')
  for (let k = 0; k < 40 * 5; k++) world.step(1 / 40)
  assert.ok(world.pellets.filter((g) => g.hue === GOLD).length > 50)
  assert.equal(world.event.kind, 'rain')
  for (let k = 0; k < 40 * 16; k++) world.step(1 / 40)
  assert.equal(world.event, null)
  assert.deepEqual(world.drain().filter((n) => n.t === 'event').map((n) => [n.kind, n.on]), [['rain', true], ['rain', false]])

  world.start('boss')
  const boss = [...world.players.values()].find((p) => p.special === 'boss')
  assert.ok(mass(boss) > 2000)

  // Ronnie, mangé par un joueur : la nouvelle du badge.
  world.ronnie()
  const ronnie = [...world.players.values()].find((p) => p.special === 'ronnie')
  const dio = world.join('Dio', { account: 'compte-dio' })
  Object.assign(dio.cells[0], { x: ronnie.cells[0].x, y: ronnie.cells[0].y, m: 1000 })
  world.drain()
  world.step(1 / 40)
  const news = world.drain()
  assert.ok(news.some((n) => n.t === 'kill' && n.special === 'ronnie' && n.by[1] === dio.id))
  assert.ok(news.some((n) => n.t === 'ronnie' && n.account === 'compte-dio'))
  world.step(1 / 40)
  assert.ok(![...world.players.values()].some((p) => p.special === 'ronnie'))
})

test('les skins : parties jouées, masse en une partie, joueurs mangés, badge', () => {
  const ok = (stats) => skinsOf(stats).filter(([, , , ok]) => ok).map(([id]) => id)
  assert.deepEqual(ok({}), ['plain'])
  assert.deepEqual(ok({ games: 5 }), ['plain', 'stripes', 'checker'])
  assert.deepEqual(ok({ games: 10, best: 1200 }), ['plain', 'stripes', 'checker', 'flames', 'lightning'])
  assert.deepEqual(ok({ kills: 30, best: 3000, badges: ['ronnie'] }), ['plain', 'crown', 'lightning', 'skull', 'ronnie'])
  // Où il en est, sans dépasser l'objectif.
  assert.deepEqual(skinsOf({ games: 40 }).find(([id]) => id === 'galaxy'), ['galaxy', 'games', 25, true, 25])
  assert.deepEqual(skinsOf({ best: 700 }).find(([id]) => id === 'skull'), ['skull', 'best', 3000, false, 700])
})

test('les bots peuplent le monde et ne se font pas tous manger', { timeout: 15000 }, () => {
  const world = new World({ random: seeded(7) })
  for (let k = 0; k < 40 * 60; k++) world.step(1 / 40)
  const bots = [...world.players.values()].filter((b) => !b.special)
  assert.equal(bots.length, 14)
  assert.ok(bots.some((b) => mass(b) > 60), 'un bot a grossi')
  for (const b of bots) for (const c of b.cells) assert.ok(c.x >= 0 && c.x <= 4000 && radius(c.m) > 0)
})

let server, url, app, game, db
before(async () => {
  db = open(':memory:')
  app = createApp(db)
  server = app.listen(0)
  game = blob(server, db, app.locals.players, { graceMs: 1500 })
  await new Promise((resolve) => server.once('listening', resolve))
  url = `127.0.0.1:${server.address().port}`
})
after(() => {
  server.closeAllConnections()
  server.close()
})

function connect (at = url) {
  const ws = new WebSocket(`ws://${at}/v1/blob/ws`)
  const queue = []
  const waiting = []
  ws.on('message', (data) => {
    const msg = JSON.parse(data)
    const k = waiting.findIndex((w) => w.type === msg.t)
    if (k >= 0) waiting.splice(k, 1)[0].resolve(msg)
    else queue.push(msg)
  })
  const next = (type) => {
    const k = queue.findIndex((m) => m.t === type)
    if (k >= 0) return Promise.resolve(queue.splice(k, 1)[0])
    return new Promise((resolve) => waiting.push({ type, resolve }))
  }
  const say = (msg) => ws.send(JSON.stringify(msg))
  const closed = new Promise((resolve) => ws.once('close', resolve))
  return new Promise((resolve) => ws.on('open', () => resolve({ ws, next, say, closed })))
}

async function account (name) {
  const res = await fetch(`http://${url}/v1/players`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
  return (await res.json()).token
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('en ligne : sans pseudo refusé ; avec, il entre et voit le monde', { timeout: 15000 }, async () => {
  const anon = await connect()
  anon.say({ t: 'hello', token: await account(null) })
  assert.match((await anon.next('error')).error, /pseudo/)

  const dio = await connect()
  dio.say({ t: 'hello', token: await account('Dio'), aspect: 1.5 })
  const welcome = await dio.next('welcome')
  assert.equal(welcome.size, 4000)
  // Seul l'uni, sans record.
  assert.deepEqual(welcome.skins.filter(([, , , ok]) => ok).map(([id]) => id), ['plain'])
  const first = await dio.next('records')
  assert.deepEqual([first.l, first.me], [[], null])
  // En spectateur d'abord.
  const watching = await dio.next('s')
  assert.equal(watching.me, null)
  // Un skin pas encore débloqué : l'uni.
  dio.say({ t: 'join', skin: 'skull' })
  const { id } = await dio.next('joined')
  // À l'abri des bots pendant les vérifications.
  game.world.players.get(id).fx.shield = 60
  let frame
  do frame = await dio.next('s'); while (frame.me !== id)
  const mine = []
  for (let k = 0; k < frame.c.length; k += 6) if (frame.c[k + 1] === id) mine.push(frame.c[k + 4])
  assert.deepEqual(mine, [12])
  assert.deepEqual(frame.n[id], ['Dio', game.world.players.get(id).hue, 'plain'])
  assert.equal(frame.fx[0], 0)
  assert.ok(frame.fx[2] > 50)
  // Les granules : toutes à la première image, ensuite seulement celles qui changent.
  const next = await dio.next('s')
  assert.ok(next.g.length < 40, `${next.g.length / 4} granules renvoyées`)
  // Ceux d'avant son entrée ne le comptent pas encore.
  let board
  do board = await dio.next('board'); while (!board.me)
  assert.equal(board.playing, 1)
  assert.equal(board.l.length, 10)
  // Les bots marqués, lui non.
  assert.ok(board.l.filter(([, , me]) => !me).every(([, , , bot]) => bot))
  assert.ok(board.l.filter(([, , me]) => me).every(([, , , bot]) => !bot))
  assert.equal(board.me[1], 12)

  // Mangé par un bot énorme posé sur lui : la mort au fil, sa masse au classement des records.
  const world = game.world
  const me = world.players.get(id)
  me.cells[0].m = 200
  me.fx.shield = 0
  const bot = [...world.players.values()].find((p) => p.bot && !p.special && p.cells.length)
  Object.assign(bot.cells[0], { x: me.cells[0].x, y: me.cells[0].y, m: 5000 })
  const dead = await dio.next('dead')
  assert.equal(dead.by, bot.name)
  assert.equal(dead.record, true)
  assert.ok(dead.best >= 200)
  const kill = await dio.next('kill')
  assert.deepEqual([kill.by[0], kill.victim], [bot.name, ['Dio', id]])
  const records = await dio.next('records')
  assert.deepEqual(records.l, [['Dio', dead.best, true]])
  assert.deepEqual(records.me, [1, dead.best])
  // Une partie jouée : les rayures sont débloquées, le damier en route.
  assert.deepEqual(records.skins.find(([id]) => id === 'stripes'), ['stripes', 'games', 1, true, 1])
  assert.deepEqual(records.skins.find(([id]) => id === 'checker'), ['checker', 'games', 5, false, 1])
  dio.ws.close()
  await dio.closed
})

test('la connexion tombée : ses cellules l’attendent, il les reprend', { timeout: 15000 }, async () => {
  const token = await account('Tony')
  const a = await connect()
  a.say({ t: 'hello', token })
  await a.next('welcome')
  a.say({ t: 'join' })
  const { id } = await a.next('joined')
  a.ws.terminate()
  await a.closed
  await pause(100)
  assert.ok(game.world.players.get(id), 'toujours là')
  const b = await connect()
  b.say({ t: 'hello', token })
  const back = await b.next('joined')
  assert.deepEqual(back, { t: 'joined', id, resumed: true })
  // Partie pour de bon : après le délai, ses cellules s'en vont.
  b.ws.terminate()
  await b.closed
  await pause(2000)
  assert.equal(game.world.players.get(id), undefined)
})

test('le dernier parti, le monde repart de zéro', { timeout: 15000 }, async () => {
  const lemmy = await connect()
  lemmy.say({ t: 'hello', token: await account('Lemmy') })
  await lemmy.next('welcome')
  const before = game.world
  await lemmy.next('s')
  lemmy.ws.close()
  await lemmy.closed
  // Le temps que floor voie la fermeture.
  await pause(100)
  assert.notEqual(game.world, before)
  assert.equal(game.world.time, 0)
})

test('pas plus de tant de connexions par adresse', { timeout: 15000 }, async () => {
  const other = createApp(db).listen(0)
  blob(other, db, app.locals.players, { perIp: 2 })
  await new Promise((resolve) => other.once('listening', resolve))
  const at = `127.0.0.1:${other.address().port}`
  const one = await connect(at)
  const two = await connect(at)
  const three = await connect(at)
  assert.equal((await three.next('error')).error, 'Trop de connexions')
  for (const c of [one, two]) c.ws.close()
  other.closeAllConnections()
  other.close()
})
