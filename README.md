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

floor tourne sur la Beemo, à côté de Clara, et répond sur **https://fedoclara.hopto.org/floor/**. Le nginx de Clara lui passe `/floor/` (voir `nginx/floor.conf`, repris dans `nginx/clara.conf` du dépôt Clara).

```bash
# Première fois
git clone https://github.com/Jellfedora/floor.git ~/floor
cd ~/floor && docker compose up -d --build

# Mise à jour
cd ~/floor && git pull && docker compose up -d --build
```

Vérifier : `curl https://fedoclara.hopto.org/floor/health` doit répondre `{"ok":true}`.

## API

Toutes les réponses sont en JSON. Les erreurs ont la forme `{ "error": "message" }`.

### Joueurs

Un joueur n'a pas de compte. Ronnie crée le sien au premier score envoyé et garde son jeton. La base ne garde que l'empreinte du jeton.

- `POST /v1/players` `{ "name": "Ronnie" }` → `201 { id, name, token }` (20 par heure et par adresse)
- `PATCH /v1/players/me` `{ "name": "Dio" }` (jeton) → `{ id, name }`

Le nom fait 24 caractères au plus. Un nom vide donne `null` : le jeu affiche alors « Anonyme ».

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
