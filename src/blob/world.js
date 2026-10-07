// Ronnie.io, un jeu comme agar.io : des cellules dans un monde fermé mangent les granules et les
// cellules plus petites, se divisent pour les attraper, éclatent sur les virus. Ici les règles et le
// monde, que floor fait tourner pour tous (voir index.js) ; des bots le peuplent quand il y a peu de
// joueurs. Des bonus traînent (vitesse, aimant, bouclier), des événements passent (une pluie de
// granules dorées, un boss), et Ronnie, rose, apparaît parfois : qui le mange gagne son skin.
// Les distances sont en unités du monde, les temps en secondes.

const SIZE = 4000
const PELLETS = 700
const VIRUSES = 14
const START_MASS = 12
const MAX_CELLS = 16
const SPLIT_MIN = 35
const EJECT_MIN = 35
const EJECT_LOSS = 16
const EJECT_MASS = 12
const VIRUS_MASS = 100
// Une cellule en mange une autre si elle pèse tant de fois plus.
const EAT_RATIO = 1.25
// La vitesse d'une cellule lancée (divisée, éclatée, éjectée), et à quel point elle s'éteint.
const BOOST = 1100
const BOOST_FADE = 5
// Les couleurs, que Ronnie prend dans son thème.
const HUES = 12
// Autant de joueurs au moins (les bots complètent), mais toujours quelques bots.
const CROWD = 14
const BOTS_MIN = 4
// Au-delà, un bot ne chasse plus et fond deux fois plus vite : le monde ne finit pas à un seul bot géant.
const BOT_FULL = 1000

// Les bonus : combien sur la carte, combien de temps ils durent, quand ils reviennent une fois pris.
const BONUSES = 6
const BONUS = { speed: 0, magnet: 1, shield: 2 }
const BONUS_TIME = [6, 8, 4]
const BONUS_BACK = 12
// Les effets, en bits (les autres joueurs les voient) ; `paused` : le joueur a mis sa partie en pause.
const FX = { speed: 1, magnet: 2, shield: 4, paused: 8 }

// Les événements : le premier après tant, puis entre deux.
const EVENT_FIRST = [60, 120]
const EVENT_EVERY = [120, 240]
const RAIN_TIME = 20
const RAIN_RATE = 25
const RAIN_MAX = 400
const GOLD = 99
const GOLD_MASS = 4
const BOSS_MASS = 2500
const BOSS_TIME = 90
// Ronnie : rare, rapide, il fuit tout le monde.
const RONNIE_EVERY = [180, 420]
const RONNIE_CHANCE = 0.6
const RONNIE_TIME = 45
const RONNIE_MASS = 120

// Les skins, et l'objectif qui débloque chacun : des parties jouées, une masse atteinte en une
// partie, des joueurs mangés (au total), un badge.
const SKINS = [
  ['plain', 'games', 0],
  ['stripes', 'games', 1],
  ['checker', 'games', 5],
  ['flames', 'games', 10],
  ['galaxy', 'games', 25],
  ['crown', 'kills', 25],
  ['lightning', 'best', 1000],
  ['skull', 'best', 3000],
  ['ronnie', 'badge', 1]
]

const BOT_NAMES = ['Lemmy', 'Ozzy', 'Halford', 'Dickinson', 'Hetfield', 'Mustaine', 'Angus', 'Iommi',
  'Doro', 'Tarja', 'Slash', 'Zakk', 'Rhoads', 'Malmsteen', 'Hammett', 'Cronos', 'Abbath', 'Dimebag', 'Cliff', 'Lita']

const radius = (m) => 4 + Math.sqrt(m) * 6
// Ce qu'une cellule perd par seconde (une part de sa masse, plus grande pour les grosses).
const decay = (m) => (m > 100 ? 0.002 + m / 500000 : 0)
const speed = (m) => 420 * Math.pow(m, -0.24)
const mass = (p) => p.cells.reduce((s, c) => s + c.m, 0)

// Le centre des cellules d'un joueur, pondéré par leur masse.
function center (p) {
  let x = 0; let y = 0; let m = 0
  for (const c of p.cells) {
    x += c.x * c.m; y += c.y * c.m; m += c.m
  }
  return m > 0 ? { x: x / m, y: y / m } : null
}

// La hauteur du monde qu'un joueur voit : plus il est gros, plus il voit loin.
const viewHeight = (m) => 900 + Math.sqrt(m) * 45

// Les effets d'un joueur, en bits.
const fxBits = (p) => (p.fx.speed > 0 ? FX.speed : 0) | (p.fx.magnet > 0 ? FX.magnet : 0) | (p.fx.shield > 0 ? FX.shield : 0) | (p.paused ? FX.paused : 0)

class World {
  // `bots` : false pour un monde sans bots, bonus ni événements (les tests des règles).
  constructor ({ random = Math.random, bots = true } = {}) {
    this.random = random
    this.bots = bots
    this.players = new Map()
    this.pellets = []
    this.viruses = []
    this.bonuses = []
    this.nextId = 1
    this.time = 0
    // Ce qui s'est passé depuis la dernière fois (index.js l'annonce) : morts, événements, Ronnie.
    this.news = []
    // L'événement en cours : { kind: 'rain' | 'boss', until }.
    this.event = null
    this.nextEvent = this.between(...EVENT_FIRST)
    this.nextRonnie = this.between(...RONNIE_EVERY)
    for (let k = 0; k < PELLETS; k++) this.pellets.push(this.pellet())
    for (let k = 0; k < VIRUSES; k++) this.viruses.push({ ...this.free(200), m: VIRUS_MASS })
    if (bots) {
      for (let k = 0; k < BONUSES; k++) this.bonuses.push(this.bonus())
    }
  }

  id () {
    return this.nextId++
  }

  between (a, b) {
    return a + this.random() * (b - a)
  }

  // Une granule ; dorée (pendant la pluie), elle pèse plus et ne revient pas une fois mangée.
  pellet (gold = false) {
    return { id: this.id(), x: this.between(20, SIZE - 20), y: this.between(20, SIZE - 20), hue: gold ? GOLD : Math.floor(this.random() * HUES), m: gold ? GOLD_MASS : 1, vx: 0, vy: 0, ejected: false, gold }
  }

  bonus () {
    return { id: this.id(), ...this.free(100), kind: Math.floor(this.random() * 3), back: 0 }
  }

  // Un endroit loin des cellules (au moins `room` de leur bord), sinon le meilleur de dix essais.
  free (room) {
    let best = null; let bestGap = -Infinity
    for (let k = 0; k < 10; k++) {
      const at = { x: this.between(room, SIZE - room), y: this.between(room, SIZE - room) }
      let gap = Infinity
      for (const p of this.players.values()) {
        for (const c of p.cells) gap = Math.min(gap, Math.hypot(c.x - at.x, c.y - at.y) - radius(c.m))
      }
      for (const v of this.viruses) gap = Math.min(gap, Math.hypot(v.x - at.x, v.y - at.y) - radius(v.m))
      if (gap >= room) return at
      if (gap > bestGap) {
        best = at; bestGap = gap
      }
    }
    return best
  }

  cell (x, y, m) {
    return { id: this.id(), x, y, m, bx: 0, by: 0, merge: 0 }
  }

  // Un joueur entre (ou revient) : une cellule, loin des autres. `account` : son compte floor ;
  // `special` : 'boss' ou 'ronnie' (pas compté parmi les bots, pas de retour une fois mangé).
  join (name, { bot = false, account = null, startMass = START_MASS, skin = 'plain', special = null } = {}) {
    const p = {
      id: this.id(),
      name,
      hue: Math.floor(this.random() * HUES),
      skin,
      bot,
      special,
      account,
      cells: [],
      target: null,
      best: 0,
      kills: 0,
      born: this.time,
      think: 0,
      fx: { speed: 0, magnet: 0, shield: 0 },
      // En pause depuis (Date.now()), sinon null : ses cellules ne bougent plus, ne mangent rien et
      // ne se font pas manger ; les bots l'ignorent.
      paused: null
    }
    this.players.set(p.id, p)
    this.spawn(p, startMass)
    return p
  }

  spawn (p, m = START_MASS) {
    const at = this.free(150)
    p.cells = [this.cell(at.x, at.y, m)]
    p.target = { ...at }
    p.best = m
    p.kills = 0
    p.born = this.time
    p.fx = { speed: 0, magnet: 0, shield: 0 }
  }

  leave (id) {
    this.players.delete(id)
  }

  aim (id, x, y) {
    const p = this.players.get(id)
    if (p && Number.isFinite(x) && Number.isFinite(y)) p.target = { x: Math.min(Math.max(x, -500), SIZE + 500), y: Math.min(Math.max(y, -500), SIZE + 500) }
  }

  // La pause (`at` : depuis quand), ou la reprise (null) : les cellules repartent de là où elles sont.
  pause (id, at) {
    const p = this.players.get(id)
    if (!p || !p.cells.length) return
    p.paused = at
    this.stop(id)
    for (const c of p.cells) c.bx = c.by = 0
  }

  // Le joueur ne bouge plus (sa connexion est tombée) : ses cellules s'arrêtent où elles sont.
  stop (id) {
    const p = this.players.get(id)
    const at = p && center(p)
    if (at) p.target = at
  }

  direction (c, target) {
    const dx = target.x - c.x; const dy = target.y - c.y
    const d = Math.hypot(dx, dy)
    return d > 0.001 ? { x: dx / d, y: dy / d } : { x: 1, y: 0 }
  }

  // Chaque cellule assez grosse se coupe en deux, la moitié lancée vers la cible.
  split (id) {
    const p = this.players.get(id)
    if (!p) return
    for (const c of [...p.cells]) {
      if (p.cells.length >= MAX_CELLS) break
      if (c.m < SPLIT_MIN) continue
      const dir = this.direction(c, p.target)
      c.m /= 2
      const half = this.cell(c.x, c.y, c.m)
      half.bx = dir.x * BOOST
      half.by = dir.y * BOOST
      c.merge = half.merge = mergeTime(c.m * 2)
      p.cells.push(half)
    }
  }

  // Chaque cellule assez grosse lance un peu de sa masse vers la cible : n'importe qui peut la manger.
  eject (id) {
    const p = this.players.get(id)
    if (!p) return
    for (const c of p.cells) {
      if (c.m < EJECT_MIN) continue
      const dir = this.direction(c, p.target)
      c.m -= EJECT_LOSS
      const r = radius(c.m) + 14
      this.pellets.push({ id: this.id(), x: c.x + dir.x * r, y: c.y + dir.y * r, hue: p.hue, m: EJECT_MASS, vx: dir.x * BOOST * 0.8, vy: dir.y * BOOST * 0.8, ejected: true, gold: false })
    }
  }

  // Le monde avance de `dt` : ceux qui ont été mangés (le dernier morceau d'un joueur) sont rendus,
  // { player, by, best, kills, time } ; le reste de ce qui s'est passé va dans `news`.
  step (dt) {
    this.time += dt
    const deaths = []
    const fade = Math.exp(-BOOST_FADE * dt)
    for (const p of this.players.values()) {
      // En pause : tout s'arrête pour lui, ses bonus compris.
      if (p.paused) continue
      for (const k of Object.keys(p.fx)) p.fx[k] = Math.max(0, p.fx[k] - dt)
      if (p.bot && p.cells.length) {
        p.think -= dt
        if (p.think <= 0) {
          p.think = this.between(0.15, 0.35)
          this.thinkBot(p)
        }
      }
      const fast = (p.fx.speed > 0 ? 1.5 : 1) * (p.special === 'ronnie' ? 1.3 : 1)
      const full = p.bot && !p.special && mass(p) > BOT_FULL
      for (const c of p.cells) {
        const r = radius(c.m)
        const dx = p.target.x - c.x; const dy = p.target.y - c.y
        const d = Math.hypot(dx, dy)
        // Plus lente quand la cible est tout près (elle s'y arrête au lieu de trembler).
        const v = d > 0.001 ? speed(c.m) * fast * Math.min(1, d / Math.max(r, 30)) / d : 0
        c.x += (dx * v + c.bx) * dt
        c.y += (dy * v + c.by) * dt
        c.bx *= fade
        c.by *= fade
        c.merge = Math.max(0, c.merge - dt)
        // Les grosses cellules fondent, d'autant plus vite qu'elles sont grosses.
        c.m -= c.m * decay(c.m) * (full ? 2 : 1) * dt
        c.x = Math.min(Math.max(c.x, r * 0.5), SIZE - r * 0.5)
        c.y = Math.min(Math.max(c.y, r * 0.5), SIZE - r * 0.5)
      }
      this.together(p)
    }
    this.moveEjected(fade, dt)
    this.eatPellets()
    this.eatBonuses()
    this.eatViruses()
    // Avant les repas entre cellules : ce qu'un joueur vient de prendre compte s'il se fait manger.
    this.keepBest()
    this.eatCells(deaths)
    this.keepBest()
    if (this.bots) {
      this.crowd()
      this.events(dt)
    }
    return deaths
  }

  // Ce qui s'est passé depuis le dernier appel.
  drain () {
    const news = this.news
    this.news = []
    return news
  }

  keepBest () {
    for (const p of this.players.values()) {
      if (p.cells.length) p.best = Math.max(p.best, mass(p))
    }
  }

  // Les cellules d'un même joueur se poussent tant qu'elles ne peuvent pas fusionner, puis fusionnent.
  together (p) {
    const cells = p.cells
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i]; const b = cells[j]
        const ra = radius(a.m); const rb = radius(b.m)
        const dx = b.x - a.x; const dy = b.y - a.y
        const d = Math.hypot(dx, dy)
        if (a.merge <= 0 && b.merge <= 0) {
          if (d < Math.max(ra, rb)) {
            const [big, small] = a.m >= b.m ? [a, b] : [b, a]
            big.m += small.m
            small.m = 0
          }
          continue
        }
        // Celles qui viennent d'être lancées passent à travers les autres un instant.
        if (Math.hypot(a.bx, a.by) > 300 || Math.hypot(b.bx, b.by) > 300) continue
        const overlap = ra + rb - d
        if (overlap > 0) {
          const nx = d > 0.001 ? dx / d : 1; const ny = d > 0.001 ? dy / d : 0
          const total = a.m + b.m
          a.x -= nx * overlap * (b.m / total)
          a.y -= ny * overlap * (b.m / total)
          b.x += nx * overlap * (a.m / total)
          b.y += ny * overlap * (a.m / total)
        }
      }
    }
    p.cells = cells.filter((c) => c.m > 0)
  }

  moveEjected (fade, dt) {
    for (const g of this.pellets) {
      if (!g.ejected || (g.vx === 0 && g.vy === 0)) continue
      g.x = Math.min(Math.max(g.x + g.vx * dt, 10), SIZE - 10)
      g.y = Math.min(Math.max(g.y + g.vy * dt, 10), SIZE - 10)
      g.vx *= fade
      g.vy *= fade
      if (Math.hypot(g.vx, g.vy) < 5) g.vx = g.vy = 0
    }
  }

  // Les granules sous une cellule (ou dans son aimant) : mangées. Une granule ordinaire revient
  // ailleurs (avec un autre id), la masse éjectée et l'or disparaissent.
  eatPellets () {
    let gone = false
    for (const p of this.players.values()) {
      if (p.paused) continue
      const pull = p.fx.magnet > 0
      for (const c of p.cells) {
        const body = radius(c.m)
        const r = body + (pull ? 120 + body * 0.3 : 0); const r2 = r * r
        for (let k = 0; k < this.pellets.length; k++) {
          const g = this.pellets[k]
          const dx = g.x - c.x
          if (dx > r || dx < -r) continue
          const dy = g.y - c.y
          const d2 = dx * dx + dy * dy
          if (d2 > r2) continue
          // La masse éjectée : pas tant qu'elle file encore, ni par l'aimant.
          if (g.ejected && (Math.hypot(g.vx, g.vy) > 200 || d2 > body * body)) continue
          c.m += g.m
          if (g.ejected || g.gold) {
            g.m = 0
            gone = true
          } else {
            this.pellets[k] = this.pellet()
          }
        }
      }
    }
    if (gone) this.pellets = this.pellets.filter((g) => g.m > 0)
  }

  // Un bonus touché par une cellule : son effet pour le joueur ; il revient ailleurs un peu plus tard.
  eatBonuses () {
    for (const b of this.bonuses) {
      if (b.back > this.time) continue
      if (b.back) {
        Object.assign(b, this.bonus())
        continue
      }
      for (const p of this.players.values()) {
        if (p.paused || !p.cells.some((c) => Math.hypot(c.x - b.x, c.y - b.y) < radius(c.m) + 14)) continue
        const kind = Object.keys(BONUS)[b.kind]
        p.fx[kind] = BONUS_TIME[b.kind]
        b.back = this.time + BONUS_BACK
        if (!p.bot) this.news.push({ t: 'bonus', player: p.id, kind })
        break
      }
    }
  }

  // Une cellule assez grosse qui couvre un virus le mange, et éclate en morceaux.
  eatViruses () {
    for (const v of this.viruses) {
      const rv = radius(v.m)
      for (const p of this.players.values()) {
        if (p.paused) continue
        const c = p.cells.find((c) => c.m >= v.m * EAT_RATIO && Math.hypot(c.x - v.x, c.y - v.y) < radius(c.m) - rv * 0.4)
        if (!c) continue
        c.m += v.m
        const pieces = Math.min(MAX_CELLS - p.cells.length, 8)
        if (pieces > 0) {
          const share = c.m / (pieces + 1)
          c.m = share
          c.merge = mergeTime(share * (pieces + 1))
          const turn = this.random() * Math.PI * 2
          for (let k = 0; k < pieces; k++) {
            const a = turn + (k / pieces) * Math.PI * 2
            const piece = this.cell(c.x, c.y, share)
            piece.bx = Math.cos(a) * BOOST * 0.7
            piece.by = Math.sin(a) * BOOST * 0.7
            piece.merge = c.merge
            p.cells.push(piece)
          }
        }
        Object.assign(v, this.free(200))
        break
      }
    }
  }

  eatCells (deaths) {
    const all = []
    for (const p of this.players.values()) {
      for (const c of p.cells) all.push({ p, c })
    }
    all.sort((a, b) => b.c.m - a.c.m)
    for (let i = 0; i < all.length; i++) {
      const big = all[i]
      if (big.c.m <= 0 || big.p.paused) continue
      const rb = radius(big.c.m)
      for (let j = i + 1; j < all.length; j++) {
        const small = all[j]
        if (small.p === big.p || small.c.m <= 0 || big.c.m < small.c.m * EAT_RATIO) continue
        // Le bouclier, la pause : on ne le mange pas.
        if (small.p.fx.shield > 0 || small.p.paused) continue
        if (Math.hypot(small.c.x - big.c.x, small.c.y - big.c.y) >= rb - radius(small.c.m) * 0.4) continue
        big.c.m += small.c.m
        small.c.m = 0
        if (small.p.cells.every((c) => c.m <= 0)) {
          big.p.kills++
          deaths.push({ player: small.p, by: big.p.name, best: Math.round(small.p.best), kills: small.p.kills, time: this.time - small.p.born })
          // Au fil des morts : celles qui touchent un joueur, et les spéciaux.
          if (!big.p.bot || !small.p.bot || small.p.special) {
            this.news.push({ t: 'kill', by: [big.p.name, big.p.id], victim: [small.p.name, small.p.id], special: small.p.special })
          }
          if (small.p.special === 'ronnie' && !big.p.bot) this.news.push({ t: 'ronnie', player: big.p.id, account: big.p.account })
          if (small.p.special === 'boss' && this.event?.kind === 'boss') this.endEvent()
        }
      }
    }
    for (const p of this.players.values()) p.cells = p.cells.filter((c) => c.m > 0)
  }

  // Les bots : autant qu'il faut pour que le monde ne soit jamais vide ; ceux qui sont morts reviennent.
  // Les spéciaux mangés s'en vont.
  crowd () {
    const players = [...this.players.values()]
    for (const p of players) {
      if (p.special && !p.cells.length) this.players.delete(p.id)
    }
    const humans = players.filter((p) => !p.bot).length
    const bots = players.filter((p) => p.bot && !p.special)
    const want = Math.max(BOTS_MIN, CROWD - humans)
    for (const b of bots.slice(want)) this.players.delete(b.id)
    for (const b of bots.slice(0, want)) {
      if (b.cells.length) continue
      // Trois secondes plus tard.
      b.deadAt ??= this.time
      if (this.time - b.deadAt > 3) {
        b.deadAt = null
        this.spawn(b, this.between(START_MASS, 60))
      }
    }
    const taken = new Set(bots.map((b) => b.name))
    for (let k = bots.length; k < want; k++) {
      const name = BOT_NAMES.find((n) => !taken.has(n)) ?? `Bot ${k + 1}`
      taken.add(name)
      this.join(name, { bot: true, startMass: this.between(START_MASS, 60), skin: this.botSkin() })
    }
  }

  // Un skin pour un bot : souvent uni, parfois un autre.
  botSkin () {
    const skins = SKINS.filter(([id]) => id !== 'ronnie')
    const k = Math.floor(this.random() * skins.length * 2)
    return k < skins.length ? skins[k][0] : 'plain'
  }

  // La pluie dorée et le boss, chacun son tour ; Ronnie, de temps en temps.
  events (dt) {
    const ev = this.event
    if (ev) {
      if (ev.kind === 'rain') {
        const gold = this.pellets.filter((g) => g.gold).length
        const due = Math.floor(RAIN_RATE * dt + this.random())
        for (let k = 0; k < due && gold + k < RAIN_MAX; k++) this.pellets.push(this.pellet(true))
      }
      if (this.time >= ev.until) {
        if (ev.kind === 'boss') {
          for (const p of this.players.values()) if (p.special === 'boss') this.players.delete(p.id)
        }
        this.endEvent()
      }
    } else if (this.time >= this.nextEvent) {
      this.start(this.lastEvent === 'rain' ? 'boss' : 'rain')
    }
    const ronnie = [...this.players.values()].find((p) => p.special === 'ronnie')
    if (ronnie && this.time - ronnie.born > RONNIE_TIME) {
      this.players.delete(ronnie.id)
      this.news.push({ t: 'event', kind: 'ronnie', on: false })
    } else if (!ronnie && this.time >= this.nextRonnie) {
      this.nextRonnie = this.time + this.between(...RONNIE_EVERY)
      if (this.random() < RONNIE_CHANCE) this.ronnie()
    }
  }

  // Un événement commence : 'rain' ou 'boss'.
  start (kind) {
    this.lastEvent = kind
    if (kind === 'rain') {
      this.event = { kind, until: this.time + RAIN_TIME }
    } else {
      this.event = { kind, until: this.time + BOSS_TIME }
      this.join('Boss', { bot: true, special: 'boss', startMass: BOSS_MASS, skin: 'boss' })
    }
    this.news.push({ t: 'event', kind, on: true })
  }

  ronnie () {
    this.join('Ronnie', { bot: true, special: 'ronnie', startMass: RONNIE_MASS, skin: 'ronnie' })
    this.news.push({ t: 'event', kind: 'ronnie', on: true })
  }

  endEvent () {
    this.news.push({ t: 'event', kind: this.event.kind, on: false })
    this.event = null
    this.nextEvent = this.time + this.between(...EVENT_EVERY)
  }

  // Un bot regarde autour de lui : il fuit plus gros, chasse plus petit (en se divisant parfois pour
  // l'attraper), sinon va vers les bonus proches et les granules. Ronnie fuit tout le monde ; le boss
  // chasse sans jamais être rassasié.
  thinkBot (p) {
    const at = center(p)
    const main = p.cells.reduce((a, b) => (b.m > a.m ? b : a))
    const reach = 500 + radius(main.m) * 4
    const hungry = p.special === 'boss' || (p.special !== 'ronnie' && mass(p) < BOT_FULL)
    let fleeX = 0; let fleeY = 0
    let prey = null; let preyScore = 0
    for (const o of this.players.values()) {
      if (o === p || o.paused) continue
      for (const c of o.cells) {
        const d = Math.hypot(c.x - at.x, c.y - at.y)
        if (d > reach) continue
        const gap = d - radius(c.m) - radius(main.m)
        const scary = p.special === 'ronnie' ? gap < 450 : c.m > main.m * EAT_RATIO * 0.95 && gap < 320
        if (scary) {
          const w = 1 / Math.max(gap + 60, 20)
          fleeX += (at.x - c.x) / Math.max(d, 1) * w
          fleeY += (at.y - c.y) / Math.max(d, 1) * w
        } else if (main.m > c.m * EAT_RATIO && hungry && o.fx.shield <= 0) {
          const score = c.m / Math.max(d, 1)
          if (score > preyScore) {
            prey = { c, d }; preyScore = score
          }
        }
      }
    }
    if (fleeX || fleeY) {
      const n = Math.hypot(fleeX, fleeY)
      p.target = { x: at.x + fleeX / n * 600, y: at.y + fleeY / n * 600 }
      // Coincé contre un bord : il le longe.
      if (p.target.x < 100 || p.target.x > SIZE - 100) p.target.y += (p.target.y < SIZE / 2 ? 1 : -1) * 600
      if (p.target.y < 100 || p.target.y > SIZE - 100) p.target.x += (p.target.x < SIZE / 2 ? 1 : -1) * 600
      return
    }
    if (prey) {
      p.target = { x: prey.c.x, y: prey.c.y }
      const close = prey.d - radius(main.m) < 230
      if (close && main.m >= SPLIT_MIN && prey.c.m * EAT_RATIO * 2 < main.m && p.cells.length < 4 && this.random() < 0.4) this.split(p.id)
      return
    }
    const bonus = this.bonuses.find((b) => !b.back && Math.hypot(b.x - at.x, b.y - at.y) < 400)
    if (bonus) {
      p.target = { x: bonus.x, y: bonus.y }
      return
    }
    // La granule la plus proche (avec un peu de hasard, pour que les bots ne se suivent pas tous).
    let best = null; let bestD = Infinity
    for (const g of this.pellets) {
      const d = Math.hypot(g.x - at.x, g.y - at.y) * (0.8 + this.random() * 0.4) * (g.gold ? 0.5 : 1)
      if (d < bestD) {
        best = g; bestD = d
      }
    }
    if (best) p.target = { x: best.x, y: best.y }
  }

  // Ce que voit un joueur (ou un spectateur, qui suit le premier du classement) : le centre et la
  // hauteur vue, les cellules, granules, virus et bonus autour. `aspect` : largeur / hauteur de son écran.
  view (id, aspect) {
    const me = this.players.get(id)
    const followed = me?.cells.length ? me : this.leaders(1)[0]
    const at = (followed && center(followed)) ?? { x: SIZE / 2, y: SIZE / 2 }
    const h = followed ? viewHeight(mass(followed)) * (me?.cells.length ? 1 : 1.3) : 1600
    const w = h * Math.min(Math.max(aspect || 1.6, 0.5), 3)
    // Un peu plus large que l'écran : le client lisse le mouvement.
    const x0 = at.x - w * 0.6; const x1 = at.x + w * 0.6
    const y0 = at.y - h * 0.6; const y1 = at.y + h * 0.6
    const seen = (x, y, r) => x + r > x0 && x - r < x1 && y + r > y0 && y - r < y1
    const cells = []
    for (const p of this.players.values()) {
      for (const c of p.cells) {
        if (seen(c.x, c.y, radius(c.m))) cells.push({ c, p })
      }
    }
    return {
      at,
      height: h,
      cells,
      pellets: this.pellets.filter((g) => seen(g.x, g.y, 20)),
      viruses: this.viruses.filter((v) => seen(v.x, v.y, radius(v.m))),
      bonuses: this.bonuses.filter((b) => !b.back && seen(b.x, b.y, 20))
    }
  }

  // Les joueurs en vie, le plus gros en premier.
  leaders (n) {
    return [...this.players.values()].filter((p) => p.cells.length).sort((a, b) => mass(b) - mass(a)).slice(0, n)
  }
}

// Combien de temps deux moitiés restent séparées.
const mergeTime = (m) => 10 + m * 0.015

// Les skins d'un joueur, d'après ce qu'il a fait ({ games, kills, best, badges }) :
// [id, objectif, il faut, débloqué, où il en est].
function skinsOf ({ games = 0, kills = 0, best = 0, badges = [] } = {}) {
  return SKINS.map(([id, goal, need]) => {
    const progress = goal === 'games' ? games : goal === 'kills' ? kills : goal === 'best' ? best : badges.includes(id) ? 1 : 0
    return [id, goal, need, progress >= need, Math.min(progress, need)]
  })
}

module.exports = { World, SIZE, HUES, GOLD, START_MASS, VIRUS_MASS, MAX_CELLS, SKINS, BONUS, FX, radius, mass, center, fxBits, skinsOf }
