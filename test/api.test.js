const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { open } = require('../src/db')
const { createApp } = require('../src/app')

let server, base

before(async () => {
  server = createApp(open(':memory:')).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())

async function call (method, path, { body, token } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(base + path, { method, headers, body: body && JSON.stringify(body) })
  return { status: res.status, body: await res.json() }
}

const round = (letters) => ({ letters, words: Math.round(letters / 6), wpm: Math.round(letters / 5), accuracy: 97, combo: 12 })

test('ne garde que le meilleur score de chaque joueur', async () => {
  const a = (await call('POST', '/v1/players', { body: { name: '  Ronnie   James ' } })).body
  const b = (await call('POST', '/v1/players', { body: {} })).body
  assert.equal(a.name, 'Ronnie James')
  assert.equal(b.name, null)

  let r = await call('POST', '/v1/games/speed-metal/scores', { token: a.token, body: round(300) })
  assert.equal(r.status, 201)
  assert.equal(r.body.record, true)
  r = await call('POST', '/v1/games/speed-metal/scores', { token: a.token, body: round(250) })
  assert.equal(r.status, 200)
  assert.equal(r.body.record, false)
  assert.equal(r.body.best.score, 300)
  await call('POST', '/v1/games/speed-metal/scores', { token: b.token, body: round(320) })
  await call('POST', '/v1/games/speed-metal/scores', { token: a.token, body: round(400) })

  const board = (await call('GET', '/v1/games/speed-metal/leaderboard', { token: b.token })).body
  assert.equal(board.players, 2)
  assert.deepEqual(board.entries.map((e) => [e.rank, e.name, e.score, e.me]), [[1, 'Ronnie James', 400, false], [2, null, 320, true]])
  assert.equal(board.me.rank, 2)
  assert.equal(board.entries[0].details.accuracy, 97)
})

test('renommer change le nom au classement', async () => {
  const a = (await call('POST', '/v1/players', { body: { name: 'Dio' } })).body
  await call('POST', '/v1/games/speed-metal/scores', { token: a.token, body: round(900) })
  assert.equal((await call('PATCH', '/v1/players/me', { token: a.token, body: { name: 'Holy Diver' } })).body.name, 'Holy Diver')
  const board = (await call('GET', '/v1/games/speed-metal/leaderboard?limit=1')).body
  assert.equal(board.entries[0].name, 'Holy Diver')
  assert.equal(board.me, null)
})

test('refuse les scores impossibles, les joueurs inconnus et les jeux inconnus', async () => {
  const a = (await call('POST', '/v1/players', { body: {} })).body
  assert.equal((await call('POST', '/v1/games/speed-metal/scores', { token: a.token, body: round(99999) })).status, 400)
  assert.equal((await call('POST', '/v1/games/speed-metal/scores', { token: a.token, body: { ...round(100), accuracy: 'x' } })).status, 400)
  assert.equal((await call('POST', '/v1/games/speed-metal/scores', { token: 'faux', body: round(100) })).status, 401)
  assert.equal((await call('POST', '/v1/games/tetris/scores', { token: a.token, body: round(100) })).status, 404)
  assert.equal((await call('POST', '/v1/players', { body: { name: 'x'.repeat(25) } })).status, 400)
})
