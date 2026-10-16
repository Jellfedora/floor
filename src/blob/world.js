// Ronnie.io, un jeu comme agar.io : des cellules dans un monde fermé mangent les granules et les
// cellules plus petites, se divisent pour les attraper, éclatent sur les virus. Ici les règles et le
// monde, que floor fait tourner pour tous (voir index.js) ; des bots le peuplent quand il y a peu de
// joueurs. Des bonus traînent (vitesse, aimant, bouclier, fantôme, mine), des événements passent (une pluie de
// granules dorées, un boss, la zone, le trou noir, le rush, la nuit, les météorites, la colline, le festin,
// les virus en folie, les portails, l'Envers et son Démogorgon, l'acide et ses abris),
// et Ronnie, rose, apparaît parfois : qui le mange gagne son skin.
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
// La limite suit le plus gros joueur en vie (un peu au-dessus) : il y a toujours plus gros que lui.
const BOT_FULL = 1000
const BOT_ABOVE = 1.25
const BOT_FULL_MAX = 8000
// Les caractères des bots : le fermier mange ses granules et fuit tôt ; le chasseur se divise pour
// tuer et vise où va sa proie ; l'opportuniste guette les morceaux d'un joueur qui vient de se
// diviser ; le campeur reste près des virus et s'y cache.
const KINDS = ['farmer', 'hunter', 'hunter', 'sneak', 'camper']
const KIND = {
  farmer: { think: [0.25, 0.4], fear: 400, splits: 0, cells: 1, hunt: 260 },
  hunter: { think: [0.1, 0.2], fear: 260, splits: 0.85, cells: 8, hunt: Infinity },
  sneak: { think: [0.12, 0.22], fear: 320, splits: 0.7, cells: 6, hunt: Infinity },
  camper: { think: [0.15, 0.3], fear: 340, splits: 0.5, cells: 4, hunt: 350 }
}
// Jusqu'où va une moitié lancée (BOOST / BOOST_FADE), avant d'avancer à sa vitesse.
const SPLIT_REACH = 220
// La prime : un joueur premier depuis tant de secondes (et assez gros) est chassé par les bots.
const BOUNTY_AFTER = 60
const BOUNTY_MIN = 400
const BOUNTY_TIME = 60
// Les murs : un bot qui fuit à moins de tant d'un bord (plus son rayon) en est repoussé, d'autant plus
// qu'il en est près (WALL_PUSH, au contact, face à une fuite de 1).
const WALL_ROOM = 350
const WALL_PUSH = 1.6

// Les bonus : combien sur la carte, combien de temps ils durent, quand ils reviennent une fois pris.
// Le fantôme traverse les virus, la zone et le trou noir ; la mine se pose derrière soi (E), et fait
// éclater le premier autre qui passe dessus.
const BONUSES = 8
const BONUS = { speed: 0, magnet: 1, shield: 2, ghost: 3, mine: 4 }
const BONUS_TIME = [6, 8, 4, 7, 0]
const BONUS_BACK = 12
const MINES_MAX = 2
const MINE_TIME = 40
// Ce qu'il faut peser pour éclater sur une mine.
const MINE_MIN = 60
// Les effets, en bits (les autres joueurs les voient) ; `paused` : le joueur a mis sa partie en pause ;
// `bounty` : sa tête est mise à prix.
const FX = { speed: 1, magnet: 2, shield: 4, paused: 8, ghost: 16, bounty: 32 }

// Les événements : le premier après tant, puis entre deux (après la fin du dernier). Pendant un
// événement, de temps en temps (EVENT_DOUBLE), un deuxième peut s'y ajouter (DOUBLE_CHANCE), jamais
// plus de EVENTS_MAX à la fois.
const EVENT_FIRST = [10, 20]
const EVENT_EVERY = [8, 20]
const EVENT_DOUBLE = [10, 20]
const DOUBLE_CHANCE = 0.45
const EVENTS_MAX = 2
const RAIN_TIME = 20
const RAIN_RATE = 25
const RAIN_MAX = 400
const GOLD = 99
const GOLD_MASS = 4
const BOSS_MASS = 2500
const BOSS_TIME = 90
// La zone : un cercle qui se resserre, ce qui reste dehors fond.
const ZONE_TIME = 60
const ZONE_SHRINK = 45
const ZONE_END = 650
const ZONE_MELT = 0.07
// Le trou noir : il attire ce qui passe près, avale les petits, ronge les gros.
const HOLE_TIME = 40
const HOLE_REACH = 900
const HOLE_PULL = 260
const HOLE_RADIUS = 70
const HOLE_SWALLOW = 400
const HOLE_EAT = 0.12
// Le rush : tout le monde va bien plus vite.
const RUSH_TIME = 30
const RUSH_SPEED = 1.6
// La nuit : on ne voit plus qu'autour de soi (Ronnie la dessine, rien ne change ici).
const NIGHT_TIME = 35
// Les météorites : un cercle au sol, qui frappe METEOR_WARN plus tard et fait éclater ce qui est dedans.
const METEOR_TIME = 40
const METEOR_EVERY = [0.5, 1.1]
const METEOR_WARN = 2
const METEOR_R = [130, 230]
// Après l'impact, encore là un instant (Ronnie dessine l'explosion).
const METEOR_AFTER = 0.6
// La colline : un cercle où l'on gagne de la masse (la plus grosse cellule dedans, de chaque joueur).
const HILL_TIME = 45
const HILL_R = 420
const HILL_GAIN = 25
// L'acide : des abris apparaissent, un par quart de la carte ; ACID_WARN plus tard l'acide recouvre
// tout le reste pendant ACID_FLOOD, et ce qui n'est pas à l'abri (le centre dans un abri) se dissout.
const ACID_WARN = 18
const ACID_FLOOD = 4
const ACID_SHELTERS = 4
const ACID_R = 280
// Le festin : les granules ordinaires valent tant de fois plus.
const FEAST_TIME = 30
const FEAST = 3
// Les virus en folie : ils filent, rebondissent sur les murs et se multiplient (FRENZY_MAX de plus au
// plus, qui s'en vont à la fin).
const FRENZY_TIME = 35
const FRENZY_SPEED = [60, 150]
const FRENZY_EVERY = [1, 2.5]
const FRENZY_MAX = 14
// Les portails : deux paires de trous de ver, chaque portail loin de son jumeau ; une cellule qui
// entre dans l'un ressort par l'autre, lancée là où elle allait, et ne repasse pas tout de suite.
const PORTAL_TIME = 45
const PORTAL_PAIRS = 2
const PORTAL_R = 70
const PORTAL_APART = 1200
const PORTAL_AGAIN = 1.5
const PORTAL_KICK = 500
// L'Envers : le monde se retourne (Ronnie le dessine) et un Démogorgon rôde. Il ne mange pas : il fait
// éclater ce qu'il attrape (assez gros), puis s'écarte un instant ; il traque les plus gros, les
// joueurs d'abord, et fuit les groupes. Personne ne le mange, il n'est pas au classement.
const UPSIDE_TIME = 40
const DEMO_MASS = 350
const DEMO_SPEED = 2
const DEMO_MIN = 40
const DEMO_REACH = 1800
const DEMO_REST = 2.5
const DEMO_AGAIN = 4
const DEMO_CROWD = 3
const EVENTS = ['rain', 'boss', 'zone', 'hole', 'rush', 'night', 'meteors', 'hill', 'feast', 'viruses', 'portals', 'upside', 'acid']
// Ceux qui ne vont pas ensemble : la colline pourrait être hors de la zone, le trou noir l'avaler ; les
// abris, hors de la zone, sous le trou noir, ou introuvables dans la nuit.
const APART = [['zone', 'hill'], ['hole', 'hill'], ['zone', 'hole'], ['upside', 'night'], ['upside', 'boss'], ['acid', 'zone'], ['acid', 'hole'], ['acid', 'night']]
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
const fxBits = (p) => (p.fx.speed > 0 ? FX.speed : 0) | (p.fx.magnet > 0 ? FX.magnet : 0) | (p.fx.shield > 0 ? FX.shield : 0) |
  (p.paused ? FX.paused : 0) | (p.fx.ghost > 0 ? FX.ghost : 0) | (p.bounty ? FX.bounty : 0)

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
    // Les événements en cours (deux au plus), le plus ancien en premier : { kind, until } (voir EVENTS) ;
    // la zone a aussi son centre, son rayon de départ et le rayon actuel (x, y, from, r), le trou noir
    // et la colline leur centre, les météorites celles qui vont tomber ({ id, x, y, r, at }) et quand
    // vient la suivante, l'acide ses abris ({ x, y }) et quand il coule (flood).
    this.live = []
    // Les derniers commencés, pour ne pas les revoir tout de suite.
    this.recent = []
    // Les mines posées : { id, x, y, owner, hue, until }.
    this.mines = []
    // Le joueur premier, depuis quand ; la prime en cours : { player, until }.
    this.top = null
    this.bounty = null
    // Jusqu'où un bot peut grossir (voir botFull), revu à chaque pas.
    this.full = BOT_FULL
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
    return { id: this.id(), ...this.free(100), kind: Math.floor(this.random() * Object.keys(BONUS).length), back: 0 }
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
  // `special` : 'boss', 'ronnie' ou 'demo' (pas compté parmi les bots, pas de retour une fois mangé).
  join (name, { bot = false, account = null, startMass = START_MASS, skin = 'plain', special = null, kind = null } = {}) {
    const p = {
      id: this.id(),
      name,
      hue: Math.floor(this.random() * HUES),
      skin,
      bot,
      special,
      // Son caractère, pour un bot (voir KIND).
      kind: bot && !special ? (kind ?? KINDS[Math.floor(this.random() * KINDS.length)]) : null,
      mines: 0,
      bounty: false,
      account,
      cells: [],
      target: null,
      best: 0,
      kills: 0,
      born: this.time,
      think: 0,
      fx: { speed: 0, magnet: 0, shield: 0, ghost: 0 },
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
    p.fx = { speed: 0, magnet: 0, shield: 0, ghost: 0 }
    p.mines = 0
    p.bounty = false
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

  // Une mine posée derrière la plus grosse cellule du joueur (à l'opposé de là où il va).
  mine (id) {
    const p = this.players.get(id)
    if (!p || p.paused || !p.mines || !p.cells.length) return
    const main = p.cells.reduce((a, b) => (b.m > a.m ? b : a))
    const dir = this.direction(main, p.target)
    const r = radius(main.m) + 24
    p.mines--
    this.mines.push({ id: this.id(), x: main.x - dir.x * r, y: main.y - dir.y * r, owner: p.id, hue: p.hue, until: this.time + MINE_TIME })
  }

  // Le monde avance de `dt` : ceux qui ont été mangés (le dernier morceau d'un joueur) sont rendus,
  // { player, by, best, kills, time } ; le reste de ce qui s'est passé va dans `news`.
  step (dt) {
    this.time += dt
    const deaths = []
    const fade = Math.exp(-BOOST_FADE * dt)
    this.full = this.botFull()
    const hole = this.on('hole')
    const rush = this.on('rush') ? RUSH_SPEED : 1
    for (const p of this.players.values()) {
      // En pause : tout s'arrête pour lui, ses bonus compris.
      if (p.paused) continue
      for (const k of Object.keys(p.fx)) p.fx[k] = Math.max(0, p.fx[k] - dt)
      if (p.bot && p.cells.length) {
        p.think -= dt
        if (p.think <= 0) this.thinkBot(p)
      }
      const fast = (p.fx.speed > 0 ? 1.5 : 1) * (p.special === 'ronnie' ? 1.3 : p.special === 'demo' ? DEMO_SPEED : 1) * rush
      const full = p.bot && !p.special && mass(p) > this.full
      const ghost = p.fx.ghost > 0
      for (const c of p.cells) {
        const r = radius(c.m)
        const dx = p.target.x - c.x; const dy = p.target.y - c.y
        const d = Math.hypot(dx, dy)
        // Plus lente quand la cible est tout près (elle s'y arrête au lieu de trembler).
        const v = d > 0.001 ? speed(c.m) * fast * Math.min(1, d / Math.max(r, 30)) / d : 0
        let px = 0; let py = 0
        // Le trou noir tire vers lui, d'autant plus qu'on est près.
        if (hole && !ghost) {
          const hx = hole.x - c.x; const hy = hole.y - c.y
          const hd = Math.hypot(hx, hy)
          if (hd < HOLE_REACH && hd > 1) {
            const pull = HOLE_PULL * (1 - hd / HOLE_REACH) * (1 - hd / HOLE_REACH) + 40
            px = hx / hd * pull; py = hy / hd * pull
          }
        }
        c.x += (dx * v + c.bx + px) * dt
        c.y += (dy * v + c.by + py) * dt
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
    if (this.bots) this.hazards(dt, deaths)
    this.eatPellets()
    this.eatBonuses()
    this.eatViruses()
    this.eatMines()
    // Avant les repas entre cellules : ce qu'un joueur vient de prendre compte s'il se fait manger.
    this.keepBest()
    this.eatCells(deaths)
    this.keepBest()
    if (this.bots) {
      this.crowd()
      this.events(dt)
      this.hunt(dt)
    }
    return deaths
  }

  // Jusqu'où un bot peut grossir : au-dessus du plus gros joueur en vie, jamais moins que BOT_FULL.
  botFull () {
    let top = 0
    for (const p of this.players.values()) {
      if (!p.bot && p.cells.length) top = Math.max(top, mass(p))
    }
    return Math.min(Math.max(BOT_FULL, top * BOT_ABOVE), BOT_FULL_MAX)
  }

  // Un joueur mangé par ce qui n'est pas un joueur (le trou noir, l'acide) : sa mort, au fil si c'est un
  // joueur.
  die (p, by, deaths) {
    p.cells = []
    deaths.push({ player: p, by, best: Math.round(p.best), kills: p.kills, time: this.time - p.born })
    if (!p.bot || p.special) this.news.push({ t: 'kill', by: [by, 0], victim: [p.name, p.id], special: p.special ?? by })
    if (this.bounty?.player === p.id) this.endBounty()
  }

  // Ce que font la zone (dehors, on fond) et le trou noir (il avale les petits, ronge les gros).
  hazards (dt, deaths) {
    for (const ev of this.live) this.hazard(ev, dt, deaths)
    this.mines = this.mines.filter((m) => m.until > this.time)
  }

  // Ce que fait un des événements en cours.
  hazard (ev, dt, deaths) {
    if (ev.kind === 'zone') {
      const k = Math.min(1, (this.time - ev.since) / ZONE_SHRINK)
      ev.r = ev.from + (ZONE_END - ev.from) * k
      for (const p of this.players.values()) {
        if (p.paused || p.fx.ghost > 0 || p.special) continue
        for (const c of p.cells) {
          if (Math.hypot(c.x - ev.x, c.y - ev.y) > ev.r) c.m = Math.max(START_MASS, c.m - c.m * ZONE_MELT * dt)
        }
      }
    } else if (ev.kind === 'hole') {
      for (const p of [...this.players.values()]) {
        if (p.paused || p.fx.ghost > 0 || p.special === 'boss' || p.special === 'demo' || !p.cells.length) continue
        for (const c of p.cells) {
          if (Math.hypot(c.x - ev.x, c.y - ev.y) > HOLE_RADIUS + radius(c.m) * 0.3) continue
          c.m = c.m < HOLE_SWALLOW ? 0 : c.m - c.m * HOLE_EAT * dt
        }
        p.cells = p.cells.filter((c) => c.m > 0)
        if (!p.cells.length) this.die(p, 'hole', deaths)
      }
    } else if (ev.kind === 'meteors') {
      if (this.time < ev.until - METEOR_WARN && this.time >= ev.next) {
        ev.next = this.time + this.between(...METEOR_EVERY)
        ev.falling.push({ id: this.id(), ...this.meteorSpot(), r: this.between(...METEOR_R), at: this.time + METEOR_WARN, hit: false })
      }
      for (const m of ev.falling) {
        if (m.hit || this.time < m.at) continue
        m.hit = true
        for (const p of this.players.values()) {
          if (p.paused || p.fx.ghost > 0 || p.fx.shield > 0 || p.special === 'boss' || p.special === 'demo') continue
          for (const c of [...p.cells]) {
            if (c.m >= MINE_MIN && Math.hypot(c.x - m.x, c.y - m.y) < m.r + radius(c.m) * 0.5) this.burst(p, c)
          }
        }
      }
      ev.falling = ev.falling.filter((m) => this.time < m.at + METEOR_AFTER)
    } else if (ev.kind === 'acid') {
      if (this.time < ev.flood) return
      for (const p of [...this.players.values()]) {
        if (p.paused || p.special || !p.cells.length) continue
        p.cells = p.cells.filter((c) => this.sheltered(ev, c))
        if (!p.cells.length) this.die(p, 'acid', deaths)
      }
    } else if (ev.kind === 'hill') {
      for (const p of this.players.values()) {
        if (p.paused) continue
        const inside = p.cells.filter((c) => Math.hypot(c.x - ev.x, c.y - ev.y) < HILL_R)
        if (inside.length) inside.reduce((a, b) => (b.m > a.m ? b : a)).m += HILL_GAIN * dt
      }
    } else if (ev.kind === 'viruses') {
      for (const v of this.viruses) {
        if (!v.vx && !v.vy) this.launch(v)
        const rv = radius(v.m)
        v.x += v.vx * dt; v.y += v.vy * dt
        if (v.x < rv || v.x > SIZE - rv) v.vx = -v.vx
        if (v.y < rv || v.y > SIZE - rv) v.vy = -v.vy
        v.x = Math.min(Math.max(v.x, rv), SIZE - rv); v.y = Math.min(Math.max(v.y, rv), SIZE - rv)
      }
      // Un virus de plus, né d'un autre.
      if (this.time >= ev.next && this.viruses.filter((v) => v.extra).length < FRENZY_MAX && this.viruses.length) {
        ev.next = this.time + this.between(...FRENZY_EVERY)
        const from = this.viruses[Math.floor(this.random() * this.viruses.length)]
        this.viruses.push(this.launch({ x: from.x, y: from.y, m: VIRUS_MASS, extra: true }))
      }
    } else if (ev.kind === 'upside') {
      for (const demo of this.players.values()) {
        if (demo.special !== 'demo' || !demo.cells.length) continue
        const d = demo.cells[0]
        d.m = DEMO_MASS
        const rd = radius(d.m)
        for (const p of this.players.values()) {
          if (p.special || p.paused || p.fx.ghost > 0 || p.fx.shield > 0 || p.grabbed > this.time) continue
          const c = p.cells.find((c) => c.m >= DEMO_MIN && Math.hypot(c.x - d.x, c.y - d.y) < rd + radius(c.m) * 0.3)
          if (!c) continue
          this.burst(p, c)
          p.grabbed = this.time + DEMO_AGAIN
          // Il s'écarte, puis reprend la chasse.
          demo.rest = this.time + DEMO_REST
          const a = Math.atan2(d.y - c.y, d.x - c.x)
          demo.target = { x: d.x + Math.cos(a) * 800, y: d.y + Math.sin(a) * 800 }
          demo.think = DEMO_REST
          this.news.push({ t: 'grab', player: p.id })
          break
        }
      }
    } else if (ev.kind === 'portals') {
      for (const p of this.players.values()) {
        if (p.paused) continue
        for (const c of p.cells) {
          if (c.warp > this.time) continue
          const r = radius(c.m)
          const k = ev.gates.findIndex((g) => Math.hypot(c.x - g.x, c.y - g.y) < PORTAL_R + r * 0.25)
          if (k < 0) continue
          // Il ressort du jumeau, du côté où il allait, un peu lancé.
          const to = ev.gates[k ^ 1]
          const dx = p.target.x - c.x; const dy = p.target.y - c.y
          const d = Math.hypot(dx, dy)
          const a = this.random() * Math.PI * 2
          const ux = d > 1 ? dx / d : Math.cos(a); const uy = d > 1 ? dy / d : Math.sin(a)
          const out = PORTAL_R + r * 0.25 + 30
          c.x = Math.min(Math.max(to.x + ux * out, r * 0.5), SIZE - r * 0.5)
          c.y = Math.min(Math.max(to.y + uy * out, r * 0.5), SIZE - r * 0.5)
          c.bx = ux * PORTAL_KICK; c.by = uy * PORTAL_KICK
          c.warp = this.time + PORTAL_AGAIN
          // Un bot repense où aller, de l'autre côté.
          if (p.bot) p.think = 0
        }
      }
    }
  }

  // Une cellule à l'abri de l'acide : son centre dans un des abris.
  sheltered (ev, c) {
    return ev.shelters.some((s) => Math.hypot(c.x - s.x, c.y - s.y) < ACID_R)
  }

  // Les abris de l'acide : un par quart de la carte, vers son milieu, pour qu'il y en ait un à portée de tous.
  shelters () {
    const shelters = []
    for (let k = 0; k < ACID_SHELTERS; k++) {
      const x = ((k % 2) + 0.5) * SIZE / 2 + this.between(-350, 350)
      const y = (Math.floor(k / 2) % 2 + 0.5) * SIZE / 2 + this.between(-350, 350)
      shelters.push({ x, y })
    }
    return shelters
  }

  // Un virus lancé dans une direction au hasard (les virus en folie).
  launch (v) {
    const a = this.random() * Math.PI * 2
    const speed = this.between(...FRENZY_SPEED)
    v.vx = Math.cos(a) * speed; v.vy = Math.sin(a) * speed
    return v
  }

  // Deux paires de portails, chaque portail loin de son jumeau.
  gates () {
    const gates = []
    for (let k = 0; k < PORTAL_PAIRS; k++) {
      const a = this.free(300)
      let b = this.free(300)
      for (let tries = 0; tries < 20 && Math.hypot(a.x - b.x, a.y - b.y) < PORTAL_APART; tries++) b = this.free(300)
      gates.push(a, b)
    }
    return gates
  }

  // Où tombe une météorite : surtout n'importe où ; de temps en temps près d'un joueur en vie, bots compris
  // (avant, 6 sur 10 visaient un humain : seul en ligne, presque toutes tombaient sur soi).
  meteorSpot () {
    const alive = [...this.players.values()].filter((p) => !p.paused && p.cells.length)
    const at = alive.length && this.random() < 0.2 ? center(alive[Math.floor(this.random() * alive.length)]) : null
    const x = at ? at.x + this.between(-500, 500) : this.between(150, SIZE - 150)
    const y = at ? at.y + this.between(-500, 500) : this.between(150, SIZE - 150)
    return { x: Math.min(Math.max(x, 0), SIZE), y: Math.min(Math.max(y, 0), SIZE) }
  }

  // Une mine sous une cellule assez grosse d'un autre : la cellule éclate (comme sur un virus).
  eatMines () {
    for (const mine of this.mines) {
      for (const p of this.players.values()) {
        if (p.id === mine.owner || p.paused || p.fx.ghost > 0) continue
        const c = p.cells.find((c) => c.m >= MINE_MIN && Math.hypot(c.x - mine.x, c.y - mine.y) < radius(c.m))
        if (!c) continue
        this.burst(p, c)
        mine.until = 0
        break
      }
    }
    this.mines = this.mines.filter((m) => m.until > 0)
  }

  // La prime : un joueur premier depuis BOUNTY_AFTER (et assez gros) a sa tête mise à prix, les bots
  // le chassent ; elle tombe quand il meurt, ou au bout de BOUNTY_TIME (il a tenu).
  hunt () {
    if (this.bounty) {
      const p = this.players.get(this.bounty.player)
      if (!p?.cells.length) this.endBounty()
      else if (this.time >= this.bounty.until) this.endBounty(true)
      return
    }
    const first = this.leaders(1)[0]
    if (!first || first.bot || mass(first) < BOUNTY_MIN) {
      this.top = null
      return
    }
    if (this.top?.player !== first.id) this.top = { player: first.id, since: this.time }
    if (this.time - this.top.since < BOUNTY_AFTER) return
    this.bounty = { player: first.id, until: this.time + BOUNTY_TIME }
    first.bounty = true
    this.news.push({ t: 'event', kind: 'bounty', on: true, name: first.name })
  }

  // `held` : le joueur a tenu jusqu'au bout ; la prochaine prime pas avant un moment.
  endBounty (held = false) {
    const p = this.players.get(this.bounty.player)
    if (p) p.bounty = false
    this.news.push({ t: 'event', kind: 'bounty', on: false, name: p?.name ?? '', held })
    this.bounty = null
    this.top = p?.cells.length ? { player: p.id, since: this.time } : null
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
    const feast = this.on('feast') ? FEAST : 1
    for (const p of this.players.values()) {
      if (p.paused || p.special === 'demo') continue
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
          c.m += g.ejected || g.gold ? g.m : g.m * feast
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
        if (kind === 'mine') p.mines = Math.min(MINES_MAX, p.mines + 1)
        else p.fx[kind] = BONUS_TIME[b.kind]
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
        if (p.paused || p.fx.ghost > 0 || p.special === 'demo') continue
        const c = p.cells.find((c) => c.m >= v.m * EAT_RATIO && Math.hypot(c.x - v.x, c.y - v.y) < radius(c.m) - rv * 0.4)
        if (!c) continue
        c.m += v.m
        this.burst(p, c)
        Object.assign(v, this.free(200))
        break
      }
    }
  }

  // Une cellule éclate en morceaux lancés tout autour.
  burst (p, c) {
    const pieces = Math.min(MAX_CELLS - p.cells.length, 8)
    if (pieces <= 0) return
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
        if (big.p.special === 'demo' || small.p.special === 'demo') continue
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
            this.news.push({ t: 'kill', by: [big.p.name, big.p.id], victim: [small.p.name, small.p.id], special: small.p.special ?? (small.p.bounty ? 'bounty' : null) })
          }
          if (small.p.special === 'ronnie' && !big.p.bot) this.news.push({ t: 'ronnie', player: big.p.id, account: big.p.account })
          if (small.p.special === 'boss' && this.on('boss')) this.endEvent(this.on('boss'))
          if (this.bounty?.player === small.p.id) this.endBounty()
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

  // L'événement en cours de ce genre, s'il y en a un.
  on (kind) {
    return this.live.find((ev) => ev.kind === kind) ?? null
  }

  // Les événements : qui commencent, qui finissent, parfois deux à la fois ; Ronnie, de temps en temps.
  events (dt) {
    for (const ev of [...this.live]) {
      if (ev.kind === 'rain') {
        const gold = this.pellets.filter((g) => g.gold).length
        const due = Math.floor(RAIN_RATE * dt + this.random())
        for (let k = 0; k < due && gold + k < RAIN_MAX; k++) this.pellets.push(this.pellet(true))
      }
      if (this.time >= ev.until) {
        if (ev.kind === 'boss') {
          for (const p of this.players.values()) if (p.special === 'boss') this.players.delete(p.id)
        }
        this.endEvent(ev)
      }
    }
    if (this.time >= this.nextEvent && this.live.length < EVENTS_MAX) {
      // Seul, il commence ; pendant un autre, il le rejoint une fois sur deux à peu près.
      if (!this.live.length || this.random() < DOUBLE_CHANCE) {
        // Au hasard, pas un des derniers, ni un qui ne va pas avec celui en cours.
        const next = EVENTS.filter((k) => !this.recent.includes(k) && this.live.every((ev) => !APART.some((pair) => pair.includes(k) && pair.includes(ev.kind))))
        if (next.length) this.start(next[Math.floor(this.random() * next.length)])
      }
      this.nextEvent = this.time + this.between(...EVENT_DOUBLE)
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

  // Un événement commence (voir EVENTS).
  start (kind) {
    this.recent = [kind, ...this.recent].slice(0, 3)
    if (kind === 'rain') {
      this.live.push({ kind, until: this.time + RAIN_TIME })
    } else if (kind === 'zone') {
      // Autour d'un point pas trop près du bord ; au départ, assez grand pour couvrir presque tout.
      const x = this.between(SIZE * 0.3, SIZE * 0.7); const y = this.between(SIZE * 0.3, SIZE * 0.7)
      const from = SIZE * 0.75
      this.live.push({ kind, until: this.time + ZONE_TIME, since: this.time, x, y, from, r: from })
    } else if (kind === 'hole') {
      const at = this.free(400)
      this.live.push({ kind, until: this.time + HOLE_TIME, x: at.x, y: at.y })
    } else if (kind === 'rush') {
      this.live.push({ kind, until: this.time + RUSH_TIME })
    } else if (kind === 'night') {
      this.live.push({ kind, until: this.time + NIGHT_TIME })
    } else if (kind === 'meteors') {
      this.live.push({ kind, until: this.time + METEOR_TIME, next: this.time + 1, falling: [] })
    } else if (kind === 'hill') {
      const x = this.between(SIZE * 0.25, SIZE * 0.75); const y = this.between(SIZE * 0.25, SIZE * 0.75)
      this.live.push({ kind, until: this.time + HILL_TIME, x, y })
    } else if (kind === 'feast') {
      this.live.push({ kind, until: this.time + FEAST_TIME })
    } else if (kind === 'viruses') {
      this.live.push({ kind, until: this.time + FRENZY_TIME, next: this.time + 1 })
      for (const v of this.viruses) this.launch(v)
    } else if (kind === 'portals') {
      this.live.push({ kind, until: this.time + PORTAL_TIME, gates: this.gates() })
    } else if (kind === 'acid') {
      this.live.push({ kind, until: this.time + ACID_WARN + ACID_FLOOD, flood: this.time + ACID_WARN, shelters: this.shelters() })
    } else if (kind === 'upside') {
      this.live.push({ kind, until: this.time + UPSIDE_TIME })
      this.join('Démogorgon', { bot: true, special: 'demo', startMass: DEMO_MASS, skin: 'demo' })
    } else {
      this.live.push({ kind, until: this.time + BOSS_TIME })
      this.join('Boss', { bot: true, special: 'boss', startMass: BOSS_MASS, skin: 'boss' })
    }
    this.news.push({ t: 'event', kind, on: true })
  }

  ronnie () {
    this.join('Ronnie', { bot: true, special: 'ronnie', startMass: RONNIE_MASS, skin: 'ronnie' })
    this.news.push({ t: 'event', kind: 'ronnie', on: true })
  }

  endEvent (ev) {
    this.news.push({ t: 'event', kind: ev.kind, on: false })
    // Le Démogorgon retourne dans l'Envers.
    if (ev.kind === 'upside') {
      for (const p of this.players.values()) if (p.special === 'demo') this.players.delete(p.id)
    }
    // Les virus se calment, ceux en plus s'en vont.
    if (ev.kind === 'viruses') {
      this.viruses = this.viruses.filter((v) => !v.extra)
      for (const v of this.viruses) v.vx = v.vy = 0
    }
    this.live = this.live.filter((e) => e !== ev)
    // Le dernier fini : le suivant ne tarde pas ; s'il en reste un, un autre peut le rejoindre.
    this.nextEvent = this.time + this.between(...(this.live.length ? EVENT_DOUBLE : EVENT_EVERY))
  }

  // Un bot regarde autour de lui : il fuit plus gros (et le trou noir, la zone), chasse plus petit (en
  // se divisant pour l'attraper, selon son caractère), sinon va vers les bonus proches et les
  // granules. Ronnie fuit tout le monde ; le boss chasse sans jamais être rassasié. Une tête mise à
  // prix attire tous les bots qui peuvent la manger.
  thinkBot (p) {
    if (p.special === 'demo') return this.thinkDemo(p)
    const at = center(p)
    const main = p.cells.reduce((a, b) => (b.m > a.m ? b : a))
    const kind = KIND[p.kind] ?? KIND.hunter
    p.think = this.between(...kind.think)
    const reach = 500 + radius(main.m) * 4
    const hungry = p.special === 'boss' || (p.special !== 'ronnie' && mass(p) < this.full)
    const hole = this.on('hole'); const meteors = this.on('meteors'); const zone = this.on('zone'); const hill = this.on('hill')
    const acid = this.on('acid')
    let fleeX = 0; let fleeY = 0
    const flee = (x, y, w) => {
      const d = Math.max(Math.hypot(at.x - x, at.y - y), 1)
      fleeX += (at.x - x) / d * w
      fleeY += (at.y - y) / d * w
    }
    // Le trou noir, et le dehors de la zone : à fuir avant tout.
    if (hole && p.special !== 'boss' && p.fx.ghost <= 0) {
      const d = Math.hypot(hole.x - at.x, hole.y - at.y)
      if (d < HOLE_REACH * 0.9) flee(hole.x, hole.y, 1 / Math.max(d - HOLE_RADIUS, 20) * 3)
    }
    // Les météorites qui vont tomber : à quitter, quand on est assez gros pour éclater.
    if (meteors && main.m >= MINE_MIN && p.special !== 'boss') {
      for (const m of meteors.falling) {
        const d = Math.hypot(m.x - at.x, m.y - at.y)
        if (!m.hit && d < m.r + radius(main.m) + 60) flee(m.x, m.y, 1 / Math.max(d, 20) * 4)
      }
    }
    if (zone && !p.special && p.fx.ghost <= 0) {
      const d = Math.hypot(zone.x - at.x, zone.y - at.y)
      if (d > zone.r - 150 - radius(main.m)) {
        p.target = { x: zone.x, y: zone.y }
        return
      }
    }
    // L'acide : un bot file vers l'abri le plus proche quand il est temps (le trajet, plus un peu de
    // marge), et n'en sort plus ; d'ici là, il vit sa vie.
    if (acid && !p.special) {
      const shelter = acid.shelters.reduce((a, b) => (Math.hypot(b.x - at.x, b.y - at.y) < Math.hypot(a.x - at.x, a.y - at.y) ? b : a))
      const d = Math.hypot(shelter.x - at.x, shelter.y - at.y)
      const left = acid.flood - this.time
      if (left < d / speed(main.m) + 4 || (d < ACID_R && left < 8)) {
        const a = (p.id * 2.4) % (Math.PI * 2)
        p.target = { x: shelter.x + Math.cos(a) * ACID_R * 0.4, y: shelter.y + Math.sin(a) * ACID_R * 0.4 }
        p.think = Math.min(p.think, 0.5)
        return
      }
    }
    let prey = null; let preyScore = 0
    for (const o of this.players.values()) {
      if (o === p || o.paused) continue
      // Les morceaux d'un joueur qui vient de se diviser : ce que guette l'opportuniste.
      const scattered = o.cells.length > 1
      const wanted = o.bounty ? 4 : 1
      for (const c of o.cells) {
        const d = Math.hypot(c.x - at.x, c.y - at.y)
        // Le Démogorgon : on le fuit, de loin.
        if (o.special === 'demo') {
          const gap = d - radius(c.m) - radius(main.m)
          if (gap < 500 && main.m >= DEMO_MIN && p.special !== 'boss') flee(c.x, c.y, 1 / Math.max(gap + 60, 20) * 2)
          continue
        }
        if (d > reach * (o.bounty ? 2 : 1)) continue
        const gap = d - radius(c.m) - radius(main.m)
        const scary = p.special === 'ronnie' ? gap < 450 : c.m > main.m * EAT_RATIO * 0.95 && gap < kind.fear
        if (scary) {
          flee(c.x, c.y, 1 / Math.max(gap + 60, 20))
        } else if (main.m > c.m * EAT_RATIO && (hungry || (o.bounty && p.special !== 'ronnie')) && o.fx.shield <= 0 && (gap < kind.hunt || o.bounty || p.special)) {
          const score = c.m / Math.max(d, 1) * wanted * (p.kind === 'sneak' && scattered ? 2.5 : 1) * (o.bot ? 1 : 1.3)
          if (score > preyScore) {
            prey = { c, d, o }; preyScore = score
          }
        }
      }
    }
    // Gros, les virus font éclater : le chasseur et l'opportuniste les contournent.
    if ((p.kind === 'hunter' || p.kind === 'sneak') && main.m >= VIRUS_MASS * EAT_RATIO) {
      for (const v of this.viruses) {
        const gap = Math.hypot(v.x - at.x, v.y - at.y) - radius(main.m)
        if (gap < 80) flee(v.x, v.y, 1 / Math.max(gap + 60, 20) * 0.6)
      }
    }
    if (fleeX || fleeY) {
      // Le campeur, petit, file se cacher sous le virus le plus proche (les gros ne l'y suivent pas).
      const hide = p.kind === 'camper' && main.m < VIRUS_MASS && this.nearestVirus(at, 700)
      if (hide) {
        p.target = { x: hide.x, y: hide.y }
      } else {
        // Un portail sur le chemin de la fuite : il s'y jette.
        const portals = this.on('portals')
        const n = Math.hypot(fleeX, fleeY)
        const gate = portals?.gates.find((g) => {
          const d = Math.hypot(g.x - at.x, g.y - at.y)
          return d < 400 + radius(main.m) && ((g.x - at.x) * fleeX + (g.y - at.y) * fleeY) / (d * n) > 0.3 && !(main.warp > this.time)
        })
        if (gate) {
          p.target = { x: gate.x, y: gate.y }
          if (p.mines && this.random() < 0.5) this.mine(p.id)
          return
        }
        const away = this.awayFromWalls(at, fleeX, fleeY, radius(main.m))
        const r = radius(main.m) * 0.5
        p.target = { x: Math.min(Math.max(at.x + away.x * 600, r), SIZE - r), y: Math.min(Math.max(at.y + away.y * 600, r), SIZE - r) }
      }
      // Chassé, avec une mine : il la pose derrière lui.
      if (p.mines && this.random() < 0.5) this.mine(p.id)
      return
    }
    if (prey) {
      // Il vise où va sa proie (le chasseur), sinon où elle est.
      const lead = p.kind === 'hunter' || p.special === 'boss' ? Math.min(prey.d / speed(main.m), 0.6) : 0
      const dir = this.direction(prey.c, prey.o.target)
      const v = speed(prey.c.m)
      p.target = { x: prey.c.x + dir.x * v * lead, y: prey.c.y + dir.y * v * lead }
      // Se diviser : si la moitié l'atteint et la mange, et que rien de plus gros ne guette la moitié.
      const half = main.m / 2
      const close = prey.d < SPLIT_REACH + radius(half)
      if (close && half >= SPLIT_MIN / 2 && half > prey.c.m * EAT_RATIO && p.cells.length < kind.cells && this.random() < kind.splits && this.safe(p, at, half)) this.split(p.id)
      return
    }
    // La colline : les bots qui ont faim y montent (rien à chasser, rien à fuir).
    if (hill && hungry && Math.hypot(hill.x - at.x, hill.y - at.y) < 1800) {
      const a = (p.id * 2.4) % (Math.PI * 2)
      p.target = { x: hill.x + Math.cos(a) * HILL_R * 0.5, y: hill.y + Math.sin(a) * HILL_R * 0.5 }
      return
    }
    const bonus = this.bonuses.find((b) => !b.back && Math.hypot(b.x - at.x, b.y - at.y) < 400)
    if (bonus) {
      p.target = { x: bonus.x, y: bonus.y }
      return
    }
    // La granule la plus proche (avec un peu de hasard, pour que les bots ne se suivent pas tous) ; le
    // campeur reste près de son virus.
    const home = p.kind === 'camper' && main.m < VIRUS_MASS * 1.5 ? this.nearestVirus(at, Infinity) : null
    let best = null; let bestD = Infinity
    for (const g of this.pellets) {
      if (home && Math.hypot(g.x - home.x, g.y - home.y) > 450) continue
      const d = Math.hypot(g.x - at.x, g.y - at.y) * (0.8 + this.random() * 0.4) * (g.gold ? 0.5 : 1)
      if (d < bestD) {
        best = g; bestD = d
      }
    }
    if (best) p.target = { x: best.x, y: best.y }
    else if (home) p.target = { x: home.x, y: home.y }
  }

  // Le Démogorgon : après une prise, il s'écarte ; entouré (DEMO_CROWD joueurs assez gros), il fuit ;
  // sinon il traque le plus gros à portée, un joueur plutôt qu'un bot, et vise où il va.
  thinkDemo (p) {
    p.think = this.between(0.15, 0.3)
    if (p.rest > this.time) return
    const at = center(p)
    const near = []; let prey = null; let best = 0
    for (const o of this.players.values()) {
      if (o.special || o.paused || !o.cells.length || o.fx.ghost > 0) continue
      const m = mass(o)
      const c = center(o)
      const d = Math.hypot(c.x - at.x, c.y - at.y)
      if (d < 500 && m >= DEMO_MIN * 1.5) near.push(c)
      if (d > DEMO_REACH || m < DEMO_MIN || o.grabbed > this.time || o.fx.shield > 0) continue
      const score = m * (o.bot ? 1 : 1.5) / (1 + d / 600)
      if (score > best) {
        best = score; prey = o
      }
    }
    if (near.length >= DEMO_CROWD) {
      const fx = near.reduce((s, c) => s + at.x - c.x, 0); const fy = near.reduce((s, c) => s + at.y - c.y, 0)
      const away = this.awayFromWalls(at, fx || 1, fy, radius(DEMO_MASS))
      p.target = { x: at.x + away.x * 700, y: at.y + away.y * 700 }
      return
    }
    if (prey) {
      const c = prey.cells.reduce((a, b) => (b.m > a.m ? b : a))
      const dir = this.direction(c, prey.target)
      p.target = { x: c.x + dir.x * speed(c.m) * 0.4, y: c.y + dir.y * speed(c.m) * 0.4 }
    } else if (Math.hypot(p.target.x - at.x, p.target.y - at.y) < 100) {
      p.target = this.free(200)
    }
  }

  // Où fuir (une direction de longueur 1) quand on fuit vers (fx, fy) : près d'un bord, les murs
  // repoussent vers l'intérieur ; et si ça ramène vers ce qu'on fuit (coincé dans un coin), il longe
  // le mur, du côté du milieu.
  awayFromWalls (at, fx, fy, r) {
    const n = Math.hypot(fx, fy)
    let x = fx / n; let y = fy / n
    const room = WALL_ROOM + r
    const push = (d) => Math.max(0, 1 - d / room) * WALL_PUSH
    x += push(at.x) - push(SIZE - at.x)
    y += push(at.y) - push(SIZE - at.y)
    if (x * fx + y * fy < 0 || Math.hypot(x, y) < 0.2) {
      const s = -fy * (SIZE / 2 - at.x) + fx * (SIZE / 2 - at.y) >= 0 ? 1 : -1
      x = -fy / n * s; y = fx / n * s
    }
    const m = Math.hypot(x, y)
    return { x: x / m, y: y / m }
  }

  nearestVirus (at, within) {
    let best = null; let bestD = within
    for (const v of this.viruses) {
      const d = Math.hypot(v.x - at.x, v.y - at.y)
      if (d < bestD) {
        best = v; bestD = d
      }
    }
    return best
  }

  // Une moitié de `half` lancée d'ici serait-elle en sûreté (rien qui la mange autour) ?
  safe (p, at, half) {
    for (const o of this.players.values()) {
      if (o === p || o.paused) continue
      for (const c of o.cells) {
        if (c.m > half * EAT_RATIO && Math.hypot(c.x - at.x, c.y - at.y) < 500 + radius(c.m)) return false
      }
    }
    return true
  }

  // Ce que voit un joueur (ou un spectateur) : le centre et la hauteur vue, les cellules, granules,
  // virus et bonus autour ; qui est suivi. `aspect` : largeur / hauteur de son écran. Le spectateur
  // suit `watch` (l'id d'un joueur en vie, sinon le premier du classement), ou voit tout le monde
  // (`watch` : 'map').
  view (id, aspect, watch = null) {
    const me = this.players.get(id)
    const alive = me?.cells.length > 0
    const map = !alive && watch === 'map'
    const chosen = !alive && typeof watch === 'number' ? this.players.get(watch) : null
    const followed = alive ? me : map ? null : chosen?.cells.length ? chosen : this.leaders(1)[0]
    const at = (followed && center(followed)) ?? { x: SIZE / 2, y: SIZE / 2 }
    const h = map ? SIZE / 1.15 : followed ? viewHeight(mass(followed)) * (alive ? 1 : 1.3) : 1600
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
      followed: followed?.id ?? null,
      cells,
      pellets: this.pellets.filter((g) => seen(g.x, g.y, 20)),
      viruses: this.viruses.filter((v) => seen(v.x, v.y, radius(v.m))),
      bonuses: this.bonuses.filter((b) => !b.back && seen(b.x, b.y, 20)),
      mines: this.mines.filter((m) => seen(m.x, m.y, 20))
    }
  }

  // Les joueurs en vie, le plus gros en premier.
  leaders (n) {
    return [...this.players.values()].filter((p) => p.cells.length && p.special !== 'demo').sort((a, b) => mass(b) - mass(a)).slice(0, n)
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

module.exports = { World, SIZE, HILL_R, ACID_R, HUES, GOLD, START_MASS, VIRUS_MASS, MAX_CELLS, SKINS, BONUS, FX, KINDS, radius, mass, center, fxBits, skinsOf }
