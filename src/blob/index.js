const { WebSocketServer } = require('ws')
const { World, SIZE, mass, fxBits, skinsOf } = require('./world')

// Le monde avance tant de fois par seconde, et les joueurs le voient une fois sur deux.
const TICK_MS = 25
const SEND_EVERY = 2
// Le classement, envoyé une fois par seconde.
const BOARD_EVERY = 40
// Au-delà, les messages d'un joueur sont ignorés (par seconde).
const MESSAGES_MAX = 80
// Un joueur qui ne lit plus (tant d'octets en attente) ne reçoit plus d'images.
const BUFFER_MAX = 256 * 1024
// Sa connexion tombée, les cellules d'un joueur l'attendent tant (il revient s'il se reconnecte).
const GRACE_MS = 10 * 1000
// Une partie en pause attend tant, connecté ou non ; ensuite le joueur sort (sa masse compte).
const PAUSE_MS = 30 * 60 * 1000
// Par adresse : connexions ouvertes en même temps, et ouvertes par minute.
const PER_IP = 4
const PER_IP_MINUTE = 30

// Ronnie.io en ligne : un WebSocket sur /v1/blob/ws, ouvert sur le serveur HTTP de floor.
//
// Le premier message donne le jeton ({ t: 'hello', token, aspect }) : seulement avec un pseudo.
// Ensuite { t: 'join', skin } pour entrer, { t: 'aim', x, y } (la souris, dans le monde),
// { t: 'split' }, { t: 'eject' }, { t: 'leave' } (pour regarder), { t: 'pause' } puis { t: 'resume' }
// (la bulle attend, protégée, au plus PAUSE_MS : le joueur peut fermer la connexion et revenir),
// { t: 'ping', n } (floor répond { t: 'pong', n }, pour mesurer le délai).
//
// floor envoie { t: 'welcome', size, skins }, puis 20 fois par seconde ce que le joueur voit
// ({ t: 's' }, voir `frame`), le classement chaque seconde ({ t: 'board' }), le classement des
// records ({ t: 'records' }) à l'arrivée et à chaque nouveau record, { t: 'dead' } quand il s'est
// fait manger (expired : sa pause a trop duré), et au fil de la partie : les morts ({ t: 'kill' }), les événements ({ t: 'event' }),
// ses bonus ({ t: 'bonus' }), son badge Ronnie ({ t: 'badge' }).
//
// Tout vit en mémoire ; la plus grosse masse de chaque joueur va au classement `ronnie-io`. Quand
// le dernier joueur s'en va, le monde s'arrête et repart de zéro avec le suivant.
function blob (server, db, players, { random, trustProxy = false, graceMs = GRACE_MS, pauseMs = PAUSE_MS, perIp = PER_IP, perIpMinute = PER_IP_MINUTE } = {}) {
  // Un monde neuf à chaque fois que quelqu'un arrive dans un monde vide (voir `idle`).
  let world = new World({ random })
  const wss = new WebSocketServer({ server, path: '/v1/blob/ws', maxPayload: 4096 })
  const clients = new Set()
  // Les joueurs dont la connexion est tombée, par compte : { id (dans le monde), at }.
  const orphans = new Map()
  // Par adresse : connexions ouvertes, et les ouvertures de la dernière minute.
  const ips = new Map()
  const keep = db.prepare(`INSERT INTO scores (game, player_id, score, details, at) VALUES ('ronnie-io', @player, @score, @details, @at)
    ON CONFLICT (game, player_id) DO UPDATE SET score = excluded.score, details = excluded.details, at = excluded.at
    WHERE excluded.score > scores.score`)
  const best = db.prepare(`SELECT s.player_id, p.name, s.score FROM scores s JOIN players p ON p.id = s.player_id
    WHERE s.game = 'ronnie-io' ORDER BY s.score DESC, s.at ASC LIMIT 10`)
  const mine = db.prepare(`SELECT s.score, (SELECT COUNT(*) FROM scores o WHERE o.game = s.game AND (o.score > s.score OR (o.score = s.score AND o.at < s.at))) + 1 AS rank
    FROM scores s WHERE s.game = 'ronnie-io' AND s.player_id = ?`)
  const badges = db.prepare('SELECT badge FROM badges WHERE player_id = ?')
  const award = db.prepare('INSERT OR IGNORE INTO badges (player_id, badge, at) VALUES (?, ?, ?)')
  const stats = db.prepare('SELECT games, kills FROM blob_stats WHERE player_id = ?')
  const played = db.prepare(`INSERT INTO blob_stats (player_id, games, kills) VALUES (?, 1, ?)
    ON CONFLICT (player_id) DO UPDATE SET games = games + 1, kills = kills + excluded.kills`)
  let timer = null
  let ticks = 0
  let last = 0

  const send = (client, msg) => {
    if (client.ws.readyState === client.ws.OPEN) client.ws.send(JSON.stringify(msg))
  }
  const ready = () => [...clients].filter((c) => c.ready)
  const clientOf = (id) => [...clients].find((c) => c.id === id)

  // Les skins d'un compte, d'après ses parties, ses joueurs mangés, son record et ses badges.
  function skins (account) {
    const s = account && stats.get(account)
    const m = account && mine.get(account)
    return skinsOf({ games: s?.games, kills: s?.kills, best: m?.score, badges: account ? badges.all(account).map((b) => b.badge) : [] })
  }

  // Une vie finie (mangé, sorti, parti) : une partie de plus et ses joueurs mangés, sa masse au
  // classement. True si c'est le record du joueur (le classement des records repart alors vers tout
  // le monde ; vers lui de toute façon, ses skins ont pu changer).
  function record (account, best, kills, time) {
    if (!account || best <= 0) return false
    played.run(account, kills)
    const changed = keep.run({ player: account, score: Math.round(best), details: JSON.stringify({ kills, seconds: Math.round(time) }), at: Date.now() }).changes > 0
    for (const c of ready()) {
      if (changed || c.account?.id === account) send(c, records(c))
    }
    return changed
  }

  // Le classement des records (la plus grosse masse de chaque joueur) : l : [nom, masse, le sien]...,
  // me : [rang, masse] du joueur (null sans record), et ses skins (un record en débloque).
  function records (client) {
    const id = client.account?.id
    const m = id && mine.get(id)
    return { t: 'records', l: best.all().map((r) => [r.name, r.score, r.player_id === id]), me: m ? [m.rank, m.score] : null, skins: skins(id) }
  }

  // Le joueur sort du monde (vers les spectateurs, ou parti) : sa masse compte si elle était en vie.
  function out (client) {
    const p = client.id && world.players.get(client.id)
    if (p) {
      if (p.cells.length) record(client.account?.id, p.best, p.kills, world.time - p.born)
      world.leave(p.id)
    }
    client.id = null
  }

  function tick () {
    const t = Date.now()
    const dt = Math.min((t - last) / 1000, 0.1)
    last = t
    // Personne de connecté (que des joueurs attendus) : le monde ne bouge pas en attendant.
    const deaths = clients.size ? world.step(dt) : []
    for (const death of deaths) {
      const p = death.player
      if (p.bot) continue
      const client = clientOf(p.id)
      const isRecord = record(p.account, death.best, death.kills, death.time)
      if (client) {
        send(client, { t: 'dead', by: death.by, best: death.best, kills: death.kills, time: Math.round(death.time), record: isRecord })
        client.id = null
      }
      orphans.delete(p.account)
      world.leave(p.id)
    }
    for (const news of world.drain()) announce(news)
    // Les orphelins qui ne sont pas revenus (en pause : au bout de la pause).
    for (const [account, o] of orphans) {
      const p = world.players.get(o.id)
      if (p?.paused ? t - p.paused < pauseMs : t - o.at < graceMs) continue
      if (p?.cells.length) record(account, p.best, p.kills, world.time - p.born)
      world.leave(o.id)
      orphans.delete(account)
    }
    // Connectés mais en pause depuis trop longtemps : sortis.
    for (const client of ready()) {
      const p = client.id && world.players.get(client.id)
      if (!p?.paused || t - p.paused < pauseMs) continue
      const isRecord = record(client.account.id, p.best, p.kills, world.time - p.born)
      send(client, { t: 'dead', by: '', best: Math.round(p.best), kills: p.kills, time: Math.round(world.time - p.born), record: isRecord, expired: true })
      world.leave(p.id)
      client.id = null
    }
    if (idle()) return
    ticks++
    if (ticks % SEND_EVERY === 0) {
      for (const client of ready()) {
        if (client.ws.bufferedAmount < BUFFER_MAX) send(client, frame(client))
      }
    }
    if (ticks % BOARD_EVERY === 0) {
      const all = world.leaders(Infinity)
      const leaders = all.slice(0, 10)
      const humans = [...world.players.values()].filter((p) => !p.bot).length
      const watching = ready().length
      for (const client of ready()) {
        // l : [nom, masse, le sien, un bot]... ; sa place quand il est en vie : [rang, masse].
        const rank = all.findIndex((p) => p.id === client.id)
        const me = rank >= 0 ? [rank + 1, Math.round(mass(all[rank]))] : null
        send(client, { t: 'board', l: leaders.map((p) => [p.name, Math.round(mass(p)), p.id === client.id, p.bot]), me, playing: humans, online: watching })
      }
    }
  }

  // Ce qui s'est passé : les morts et les événements pour tout le monde, un bonus pour qui l'a pris,
  // le badge pour qui a mangé Ronnie.
  function announce (news) {
    if (news.t === 'kill' || news.t === 'event') {
      for (const c of ready()) send(c, news)
    } else if (news.t === 'bonus') {
      const c = clientOf(news.player)
      if (c) send(c, { t: 'bonus', kind: news.kind })
    } else if (news.t === 'ronnie' && news.account) {
      award.run(news.account, 'ronnie', Date.now())
      const c = clientOf(news.player)
      if (c) {
        send(c, { t: 'badge', badge: 'ronnie' })
        send(c, records(c))
      }
    }
  }

  // Personne, ni connecté ni attendu : la partie s'arrête, la suivante repartira d'un monde neuf.
  function idle () {
    if (clients.size || orphans.size) return false
    clearInterval(timer)
    timer = null
    world = new World({ random })
    return true
  }

  // Ce que voit le joueur : le centre et la hauteur vue (x, y, h) ; les cellules (c : id, joueur, x,
  // y, masse, effets...) ; les granules apparues depuis la dernière image (g : id, x, y, couleur...)
  // et celles parties (gx : id...) ; la masse éjectée (e : x, y, couleur...), les virus (v : x, y...),
  // les bonus (b : x, y, sorte...) ; les joueurs pas encore vus (n : id → [nom, couleur, skin]) ;
  // ses effets (fx : secondes restantes de vitesse, aimant, bouclier) ; l'événement (ev : sorte, secondes).
  function frame (client) {
    const v = world.view(client.id, client.aspect)
    const c = []
    const n = {}
    for (const { c: cell, p } of v.cells) {
      c.push(cell.id, p.id, Math.round(cell.x), Math.round(cell.y), Math.round(cell.m), fxBits(p))
      if (!client.known.has(p.id)) {
        client.known.add(p.id)
        n[p.id] = [p.name, p.hue, p.skin]
      }
    }
    const g = []
    const e = []
    const seen = new Set()
    for (const pellet of v.pellets) {
      if (pellet.ejected) {
        e.push(Math.round(pellet.x), Math.round(pellet.y), pellet.hue)
        continue
      }
      seen.add(pellet.id)
      if (!client.pellets.has(pellet.id)) g.push(pellet.id, Math.round(pellet.x), Math.round(pellet.y), pellet.hue)
    }
    const gx = [...client.pellets].filter((id) => !seen.has(id))
    client.pellets = seen
    const me = client.id && world.players.get(client.id)
    const round = (s) => Math.round(s * 10) / 10
    const ev = world.event
    return {
      t: 's',
      me: client.id,
      x: Math.round(v.at.x),
      y: Math.round(v.at.y),
      h: Math.round(v.height),
      c,
      g,
      gx,
      e,
      v: v.viruses.flatMap((x) => [Math.round(x.x), Math.round(x.y)]),
      b: v.bonuses.flatMap((x) => [Math.round(x.x), Math.round(x.y), x.kind]),
      n,
      fx: me ? [round(me.fx.speed), round(me.fx.magnet), round(me.fx.shield)] : null,
      ev: ev ? [ev.kind, Math.ceil(ev.until - world.time)] : null
    }
  }

  function start () {
    if (timer) return
    last = Date.now()
    timer = setInterval(tick, TICK_MS)
  }

  function ipOf (req) {
    const forwarded = trustProxy && req.headers['x-forwarded-for']
    return (forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress) || '?'
  }

  wss.on('connection', (ws, req) => {
    const ip = ipOf(req)
    const now = Date.now()
    const seen = ips.get(ip) ?? { open: 0, opened: [] }
    seen.opened = seen.opened.filter((at) => now - at < 60 * 1000)
    if (seen.open >= perIp || seen.opened.length >= perIpMinute) {
      ws.send(JSON.stringify({ t: 'error', error: 'Trop de connexions' }))
      ws.close(4002, 'Trop de connexions')
      return
    }
    seen.open++
    seen.opened.push(now)
    ips.set(ip, seen)
    const client = { ws, account: null, ready: false, id: null, aspect: 1.6, known: new Set(), pellets: new Set(), count: 0, second: 0 }
    clients.add(client)
    start()
    ws.on('message', (data) => {
      const t = Date.now()
      if (t - client.second > 1000) {
        client.second = t
        client.count = 0
      }
      if (++client.count > MESSAGES_MAX) return
      let msg
      try {
        msg = JSON.parse(data)
      } catch {
        return
      }
      if (!client.ready) {
        if (msg?.t === 'hello') hello(client, msg)
        return
      }
      switch (msg?.t) {
        case 'join':
          if (!client.id) {
            const skin = skins(client.account.id).find(([id, , , ok]) => ok && id === msg.skin)?.[0] ?? 'plain'
            client.id = world.join(client.account.name, { account: client.account.id, skin }).id
            send(client, { t: 'joined', id: client.id })
          }
          break
        case 'aim':
          if (client.id) world.aim(client.id, Number(msg.x), Number(msg.y))
          aspect(client, msg.aspect)
          break
        case 'split':
          if (client.id && !world.players.get(client.id)?.paused) world.split(client.id)
          break
        case 'eject':
          if (client.id && !world.players.get(client.id)?.paused) world.eject(client.id)
          break
        case 'pause':
          if (client.id && !world.players.get(client.id)?.paused) world.pause(client.id, Date.now())
          break
        case 'resume':
          if (client.id) world.pause(client.id, null)
          break
        case 'leave':
          out(client)
          break
        case 'ping':
          send(client, { t: 'pong', n: msg.n })
          break
      }
    })
    ws.on('close', () => {
      seen.open--
      if (!seen.open && !seen.opened.length) ips.delete(ip)
      // Tombée en pleine vie : ses cellules l'attendent un moment.
      const p = client.id && world.players.get(client.id)
      if (p?.cells.length && client.account) {
        world.stop(p.id)
        orphans.set(client.account.id, { id: p.id, at: Date.now() })
        client.id = null
      }
      out(client)
      clients.delete(client)
      idle()
    })
    ws.on('error', () => {})
  })

  function hello (client, msg) {
    const account = players.fromToken(msg.token)
    if (!account) return refuse(client, 'Joueur inconnu')
    if (!account.name) return refuse(client, 'Choisis d’abord un pseudo')
    // Une seule connexion par joueur : la nouvelle remplace l'ancienne, et reprend ses cellules.
    for (const other of clients) {
      if (other !== client && other.account?.id === account.id) {
        client.id = other.id
        other.id = null
        other.ws.close(4000, 'Remplacé')
      }
    }
    // Revenu à temps : ses cellules l'attendaient.
    const orphan = orphans.get(account.id)
    if (orphan && world.players.get(orphan.id)?.cells.length) client.id = orphan.id
    orphans.delete(account.id)
    Object.assign(client, { account, ready: true })
    aspect(client, msg.aspect)
    send(client, { t: 'welcome', size: SIZE, skins: skins(account.id) })
    send(client, records(client))
    if (client.id) send(client, { t: 'joined', id: client.id, resumed: true, paused: !!world.players.get(client.id)?.paused })
  }

  function refuse (client, error) {
    send(client, { t: 'error', error })
    client.ws.close(4001, 'Refusé')
  }

  function aspect (client, value) {
    const a = Number(value)
    if (Number.isFinite(a)) client.aspect = Math.min(Math.max(a, 0.5), 3)
  }

  server.on('close', () => {
    if (timer) clearInterval(timer)
    wss.close()
  })
  return {
    get world () {
      return world
    },
    wss
  }
}

module.exports = { blob }
