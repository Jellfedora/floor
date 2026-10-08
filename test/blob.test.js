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

test('la pause : ni bouger, ni manger, ni se faire manger, et les bots l’ignorent', { timeout: 15000 }, () => {
  const world = new World({ random: seeded(3), bots: false })
  const me = world.join('Dio')
  const big = world.join('Ozzy')
  world.viruses = []
  Object.assign(me.cells[0], { x: 1000, y: 1000, m: 50 })
  world.pause(me.id, Date.now())
  world.aim(me.id, 3000, 3000)
  // Un plus gros posé dessus, une granule dessous : rien ne se passe.
  Object.assign(big.cells[0], { x: 1005, y: 1000, m: 2000 })
  world.pellets = [{ id: 1, x: 1000, y: 1000, hue: 0, m: 1, vx: 0, vy: 0, ejected: false, gold: false }]
  world.step(1 / 40)
  assert.equal(me.cells.length, 1)
  assert.deepEqual([me.cells[0].x, me.cells[0].y, me.cells[0].m], [1000, 1000, 50])
  assert.equal(world.pellets.length, 1)
  assert.ok(world.drain().every((n) => n.t !== 'kill'))
  // Reprise : il repart d'où il était (pas vers où visait la souris pendant la pause)... et se fait manger.
  world.pause(me.id, null)
  world.step(1 / 40)
  assert.equal(me.cells.length, 0)

  // Les bots ne le chassent pas.
  const bot = world.join('Lemmy', { bot: true })
  const prey = world.join('Rob')
  Object.assign(bot.cells[0], { x: 2000, y: 2000, m: 300 })
  Object.assign(prey.cells[0], { x: 2200, y: 2000, m: 20 })
  world.pause(prey.id, Date.now())
  world.thinkBot(bot)
  assert.notDeepEqual(bot.target, { x: 2200, y: 2000 })
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

test('les bots : la limite suit le plus gros joueur, le chasseur se divise et vise devant', { timeout: 15000 }, () => {
  const world = new World({ random: seeded(9), bots: false })
  const dio = world.join('Dio')
  dio.cells[0].m = 3000
  assert.equal(world.botFull(), 3750)
  dio.cells[0].m = 200
  assert.equal(world.botFull(), 1000)

  const hunter = world.join('Lemmy', { bot: true, kind: 'hunter' })
  Object.assign(hunter.cells[0], { x: 2000, y: 2000, m: 400 })
  Object.assign(dio.cells[0], { x: 2250, y: 2000, m: 60 })
  dio.target = { x: 2250, y: 3000 }
  world.random = () => 0
  world.thinkBot(hunter)
  assert.equal(hunter.cells.length, 2, 'divisé pour l’attraper')
  assert.ok(hunter.target.y > 2000, 'visé là où il va')

  // Le fermier ne se divise jamais.
  const farmer = world.join('Ozzy', { bot: true, kind: 'farmer' })
  Object.assign(farmer.cells[0], { x: 1000, y: 1000, m: 400 })
  Object.assign(dio.cells[0], { x: 1200, y: 1000 })
  world.thinkBot(farmer)
  assert.equal(farmer.cells.length, 1)
})

test('la prime : premier une minute, sa tête mise à prix ; il tient, elle tombe', { timeout: 15000 }, () => {
  const world = new World({ random: seeded(11), bots: false })
  const dio = world.join('Dio')
  Object.assign(dio.cells[0], { x: 500, y: 500, m: 800 })
  world.viruses = []
  for (let k = 0; k < 61; k++) {
    world.time += 1
    world.hunt()
  }
  assert.ok(dio.bounty)
  assert.deepEqual(world.drain().map((n) => [n.kind, n.on, n.name]), [['bounty', true, 'Dio']])
  // Un bot qui peut le manger vient de loin.
  const bot = world.join('Lemmy', { bot: true, kind: 'farmer' })
  Object.assign(bot.cells[0], { x: 1500, y: 500, m: 2000 })
  world.thinkBot(bot)
  assert.ok(Math.abs(bot.target.x - 500) < 50)
  world.leave(bot.id)
  for (let k = 0; k < 61; k++) {
    world.time += 1
    world.hunt()
  }
  assert.ok(!dio.bounty)
  assert.deepEqual(world.drain().map((n) => [n.kind, n.on, n.held]), [['bounty', false, true]])
})

test('la zone se resserre, le trou noir avale, le fantôme passe, la mine fait éclater', { timeout: 15000 }, () => {
  const world = new World({ random: seeded(13) })
  for (const p of [...world.players.values()]) world.leave(p.id)
  world.bots = true
  world.viruses = []
  world.start('zone')
  Object.assign(world.event, { x: 2000, y: 2000 })
  const out = world.join('Dio')
  const ghost = world.join('Ozzy')
  Object.assign(out.cells[0], { x: 100, y: 100, m: 500 })
  Object.assign(ghost.cells[0], { x: 3900, y: 3900, m: 500 })
  ghost.fx.ghost = 100
  for (const p of [out, ghost]) p.target = { x: p.cells[0].x, y: p.cells[0].y }
  for (let k = 0; k < 40 * 46; k++) world.step(1 / 40)
  assert.ok(Math.abs(world.event.r - 650) < 1)
  assert.ok(mass(out) < 100, 'fondu dehors')
  assert.ok(mass(ghost) > 400, 'le fantôme ne fond pas')
  world.endEvent()

  world.start('hole')
  Object.assign(world.event, { x: 2000, y: 2000 })
  const small = world.join('Rob')
  Object.assign(small.cells[0], { x: 2300, y: 2000, m: 50 })
  small.target = { x: 2300, y: 2000 }
  const deaths = []
  for (let k = 0; k < 40 * 10 && !deaths.length; k++) deaths.push(...world.step(1 / 40))
  assert.equal(deaths[0]?.player, small, 'avalé')
  assert.equal(deaths[0].by, 'hole')
  world.endEvent()

  // La mine : posée derrière, sans effet sur qui l'a posée, elle fait éclater le suivant.
  ghost.fx.ghost = 0
  ghost.mines = 1
  Object.assign(ghost.cells[0], { x: 1000, y: 1000, m: 300 })
  ghost.target = { x: 1500, y: 1000 }
  world.mine(ghost.id)
  assert.equal(world.mines.length, 1)
  assert.ok(world.mines[0].x < 1000)
  Object.assign(out.cells[0], { x: world.mines[0].x, y: world.mines[0].y, m: 300 })
  out.cells.length = 1
  world.eatMines()
  assert.ok(out.cells.length > 1, 'éclaté')
  assert.equal(world.mines.length, 0)
})

let server, url, app, game, db
before(async () => {
  db = open(':memory:')
  app = createApp(db)
  server = app.listen(0)
  game = blob(server, db, app.locals.players, { graceMs: 1500, pauseMs: 3000 })
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

test('le chat : à tous les connectés, nettoyé, pas trop souvent', { timeout: 15000 }, async () => {
  const dio = await connect()
  dio.say({ t: 'hello', token: await account('Gillan') })
  await dio.next('welcome')
  const ozzy = await connect()
  ozzy.say({ t: 'hello', token: await account('Blackmore') })
  await ozzy.next('welcome')
  dio.say({ t: 'say', text: ' salut\u0007 ' })
  dio.say({ t: 'say', text: 'trop vite' })
  assert.deepEqual(await ozzy.next('chat'), { t: 'chat', from: 'Gillan', text: 'salut' })
  assert.deepEqual(await dio.next('chat'), { t: 'chat', from: 'Gillan', text: 'salut' })
  await pause(800)
  ozzy.say({ t: 'say', text: 'yo' })
  assert.deepEqual(await dio.next('chat'), { t: 'chat', from: 'Blackmore', text: 'yo' })
  dio.ws.close()
  ozzy.ws.close()
  await Promise.all([dio.closed, ozzy.closed])
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
  assert.deepEqual(back, { t: 'joined', id, resumed: true, paused: false })
  // Partie pour de bon : après le délai, ses cellules s'en vont.
  b.ws.terminate()
  await b.closed
  await pause(2000)
  assert.equal(game.world.players.get(id), undefined)
})

test('la pause : il ferme, revient, reprend ; trop longue, il sort', { timeout: 15000 }, async () => {
  const token = await account('Ronnie')
  const a = await connect()
  a.say({ t: 'hello', token })
  await a.next('welcome')
  a.say({ t: 'join' })
  const { id } = await a.next('joined')
  a.say({ t: 'pause' })
  await pause(100)
  a.ws.close()
  await a.closed
  // Plus longtemps que la grâce d'une connexion tombée : toujours là, en pause.
  await pause(1800)
  assert.ok(game.world.players.get(id)?.paused, 'en pause')
  const b = await connect()
  b.say({ t: 'hello', token })
  assert.deepEqual(await b.next('joined'), { t: 'joined', id, resumed: true, paused: true })
  b.say({ t: 'resume' })
  await pause(100)
  assert.equal(game.world.players.get(id).paused, null)
  // En pause trop longtemps, même connecté : sorti, sa masse au classement.
  game.world.players.get(id).fx.shield = 60
  b.say({ t: 'pause' })
  const dead = await b.next('dead')
  assert.equal(dead.expired, true)
  assert.equal(game.world.players.get(id), undefined)
  b.ws.close()
  await b.closed
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
