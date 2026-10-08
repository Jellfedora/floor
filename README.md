# floor

L'API des jeux de [Ronnie](https://github.com/Jellfedora/ronnie). Elle enregistre le **meilleur score de chaque joueur**, jeu par jeu, et sert le classement affiché dans le jeu.

Node + Express + SQLite (un seul fichier de base, rien d'autre à installer). Chaque jeu est un module de `src/games/` : on peut en ajouter d'autres (plus tard, des parties multijoueur).

## Lancer

```bash
npm install
npm run dev        # http://localhost:5002, base dans data/floor.db
npm test
```

### Docker

```bash
docker compose up -d --build
```

floor écoute sur `127.0.0.1:5002`. Mets un reverse proxy HTTPS devant (nginx, Traefik…) et laisse `TRUST_PROXY` à son nombre de proxys. La base est dans le volume `floor-data` (`/data/floor.db`).

| Variable      | Défaut           | Rôle                                           |
| ------------- | ---------------- | ---------------------------------------------- |
| `PORT`        | `5002`           | Port d'écoute                                  |
| `FLOOR_DB`    | `data/floor.db`  | Fichier SQLite                                 |
| `TRUST_PROXY` | (aucun)          | Proxys de confiance devant floor (`1`…)        |

Sauvegarde : `docker compose exec floor node -e "require('better-sqlite3')('/data/floor.db').backup('/data/backup.db')"`.

## Production (Beemo)

floor tourne sur la Beemo et répond sur **https://fedoheim.hopto.org/floor/**. Le nginx de fedoheim lui passe `/floor/` (voir `nginx/floor.conf`, repris dans `/etc/nginx/sites-available/fedoheim.conf`).

```bash
# Première fois
git clone https://github.com/Jellfedora/floor.git ~/floor
cd ~/floor && docker compose up -d --build

# Mise à jour à la main (d'habitude inutile, voir plus bas)
cd ~/floor && git pull && docker compose up -d --build
```

**Déploiement automatique** : un push sur `main` est en ligne dans les 5 minutes. Sur la Beemo, cron lance
`scripts/auto-deploy.sh`, qui récupère `main` (clé de déploiement GitHub en lecture seule,
`~/.ssh/floor_deploy`), et reconstruit floor s'il a changé. Son journal : `~/floor-deploy.log`.

```bash
# Mise en place (une fois) : la clé, à ajouter au dépôt (gh repo deploy-key add, lecture seule)
ssh-keygen -t ed25519 -N "" -C floor-deploy -f ~/.ssh/floor_deploy
# ~/floor devient un clone qui passe par cette clé, et cron le surveille
cd ~/floor && git init -q && git remote add origin git@github.com:Jellfedora/floor.git
git config core.sshCommand "ssh -i ~/.ssh/floor_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
git fetch -q origin main && git reset -q --hard origin/main && git branch -q -M main && git branch -q -u origin/main
(crontab -l 2>/dev/null; echo '*/5 * * * * $HOME/floor/scripts/auto-deploy.sh >> $HOME/floor-deploy.log 2>&1') | crontab -
```

Vérifier : `curl https://fedoheim.hopto.org/floor/health` doit répondre `{"ok":true}`.

## API

Toutes les réponses sont en JSON. Les erreurs ont la forme `{ "error": "message" }`.

### Joueurs

Un joueur n'a pas de compte, seulement un jeton. Ronnie crée le sien quand le joueur choisit son pseudo, et garde le jeton. La base ne garde que l'empreinte du jeton.

- `POST /v1/players` `{ "name": "Ronnie" }` → `201 { id, name, token }` (20 par heure et par adresse)
- `PATCH /v1/players/me` `{ "name": "Dio" }` (jeton) → `{ id, name }`
- `GET /v1/players/available?name=Dio` (jeton facultatif) → `{ name, free }` : le pseudo nettoyé, et s'il est libre. Avec le jeton, son propre pseudo compte comme libre.

Le pseudo fait 24 caractères au plus. Il est **unique** sans tenir compte des majuscules : un pseudo déjà pris par un autre joueur donne `409 { "error": "Pseudo déjà pris" }`. Un nom vide donne `null` (les anciens joueurs sans pseudo) : le jeu affiche alors « Anonyme ».

Le jeton se passe dans l'en-tête `Authorization: Bearer <token>`.

### Jeux

- `GET /v1/games` → `[{ id, name, order }]`. `order` vaut `desc` quand le plus grand score gagne.
- `POST /v1/games/:game/scores` (jeton) : le score de la partie. Il n'est gardé que s'il bat le meilleur du joueur. Réponse : `201` si c'est un record, `200` sinon, avec le corps `{ record, best }`.
- `GET /v1/games/:game/leaderboard?limit=10` (jeton facultatif) → `{ game, players, entries, me }`
  - `entries` : `[{ rank, name, score, details, at, me }]`. `at` est en millisecondes depuis 1970. `me` indique la ligne du joueur.
  - `me` (en dehors de `entries`) : la place du joueur, même s'il est hors du classement affiché.

À égalité de score, celui qui l'a fait en premier passe devant.

#### `speed-metal`

Le jeu de frappe de la page d'accueil de Ronnie. Le corps de la requête : `{ letters, words, wpm, accuracy, combo }`, tous des entiers. Le score correspond à `letters`.

#### `puissance-4`

Les victoires en ligne : floor les compte lui-même à la fin des parties à deux (`POST …/scores` répond `403`).

#### `ronnie-io`

La plus grosse masse de chaque joueur sur Ronnie.io : floor l'enregistre lui-même (`POST …/scores` répond `403`).

### Parties à deux (`/v1/live`)

Toutes ces routes demandent le jeton d'un joueur **avec un pseudo** (`403` sinon). Tout vit en mémoire : un redémarrage de floor oublie les invitations et les parties en cours (pas les victoires).

Un joueur est **en ligne** tant que Ronnie se signale (toutes les 5 s, chaque seconde pendant une partie) : chaque requête compte, et après 25 s sans nouvelles il ne l'est plus.

- `POST /v1/live/ping` → `{ online: [{ name, busy }], invites: [{ id, from, at }], sent: { id, to, status, match } | null, match }`
  - `online` : les autres joueurs en ligne, `busy` s'ils sont en partie.
  - `invites` : les invitations reçues, pas encore répondues.
  - `sent` : la dernière invitation envoyée. `status` vaut `pending`, `accepted` (avec `match`), `declined`, `expired` (60 s sans réponse) ou `cancelled`.
  - `match` : la partie en cours du joueur.
- `POST /v1/live/invites` `{ "to": "Dio", "game": "puissance-4" }` → `201 { id }`. `game` : `puissance-4` (par défaut) ou `ronnie-io`. `404` si le joueur n'est pas en ligne, `409` si l'un des deux est en partie (Puissance 4). Les invitations reçues et envoyées portent leur `game`.
- `POST /v1/live/invites/:id/accept` → `201`, la partie (celui qui a invité commence) ; pour Ronnie.io, `{ game: 'ronnie-io' }` : chacun rejoint le monde.
- `POST /v1/live/invites/:id/decline`, `DELETE /v1/live/invites/:id` (annuler la sienne).
- `GET /v1/live/matches/:id` → la partie vue par le joueur :
  `{ id, players: [nom1, nom2], you, columns, turn, moves, last, over, winner, reason, line, rematch: { you, them }, next, chat }`
  - `columns` : 7 piles, du bas vers le haut (`1` ou `2`). `you`, `turn` et `winner` valent 1 ou 2 ; `winner` vaut 3 pour un nul.
  - `reason` : `line`, `draw` ou `forfeit`. `line` : les 4 cases alignées `[colonne, ligne]`.
  - `chat` : `[nom, texte, le sien]...`, les 50 derniers messages des deux joueurs (ils suivent dans la revanche).
- `POST /v1/live/matches/:id/moves` `{ "column": 3 }` → la partie. `409` si ce n'est pas son tour ou si la colonne est pleine.
- `POST /v1/live/matches/:id/leave` : abandon, l'autre gagne. Sans nouvelles d'un joueur pendant 45 s, la partie est aussi perdue par forfait.
- `POST /v1/live/matches/:id/rematch` : une revanche, créée quand les deux l'ont demandée (`next`) ; l'autre joueur commence.
- `POST /v1/live/matches/:id/chat` `{ "text": "bien joué" }` → la partie. Une ligne de 200 caractères au plus ; `400` si le message est vide.

### Ronnie.io (WebSocket `/v1/blob/ws`)

Un jeu comme agar.io : floor fait tourner le monde (`src/blob/world.js`, 40 pas par seconde) et l'envoie aux joueurs 20 fois par seconde (`src/blob/index.js`). Des bots le peuplent jusqu'à 14 joueurs, chacun avec son caractère (fermier, chasseur, opportuniste, campeur), et peuvent grossir un peu plus que le plus gros joueur ; un joueur premier depuis une minute a sa tête mise à prix. Des bonus (vitesse, aimant, bouclier, fantôme, mine), des événements tour à tour (pluie de granules dorées, boss, zone qui se resserre, trou noir), et Ronnie, rose et rare : qui le mange gagne son skin (table `badges`). Les autres skins se débloquent avec la plus grosse masse. Le monde ne tourne que si quelqu'un est connecté, et repart de zéro quand le dernier s'en va.

- Le premier message : `{ t: 'hello', token, aspect }` (un joueur avec un pseudo). Ensuite `join { skin }`, `aim { x, y }`, `split`, `eject`, `mine`, `pause`, `resume`, `leave`, `ping { n }`, `say { text }` (le chat).
- floor envoie `welcome { size, skins }`, les images `s` (seulement les granules qui changent), `board` chaque seconde, `records`, `dead`, `kill`, `event`, `bonus`, `badge`, `pong`, `chat { from, text }` (à tous les connectés, un message toutes les 0,7 s au plus par joueur).
- Connexion tombée en pleine vie : les cellules attendent 10 s, le joueur les reprend en se reconnectant.
- Par adresse : 4 connexions ouvertes et 30 ouvertures par minute au plus.
- Derrière nginx, le WebSocket a besoin de son bloc (voir `nginx/floor.conf`).

## Ajouter un jeu

Crée `src/games/mon-jeu.js` :

```js
module.exports = {
  id: 'mon-jeu',
  name: 'Mon jeu',
  order: 'desc',            // 'asc' quand le plus petit gagne (un temps)
  score (body) {            // lance une HttpError(400, …) si le score ne tient pas
    return { score: body.points, details: { points: body.points } }
  }
}
```

Puis ajoute-le à la liste de `src/games/index.js`.
