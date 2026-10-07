#!/bin/sh
# Sur la Beemo, toutes les 5 minutes (cron) : si main a bougé sur GitHub, floor est mis à jour et
# relancé. Ce qu'il a fait va dans ~/floor-deploy.log (voir le README, « Production »).
#
# Tout est dans une fonction : le script se remplace lui-même au `git reset`, sh l'a déjà lu en entier.
set -eu

deploy () {
  cd "$(dirname "$0")/.."
  # Un déploiement à la fois (un build lent ne se fait pas doubler par le suivant).
  exec 9>/tmp/floor-deploy.lock
  flock -n 9 || return 0
  git fetch -q origin main
  from=$(git rev-parse --short HEAD)
  to=$(git rev-parse --short origin/main)
  [ "$from" = "$to" ] && return 0
  echo "$(date '+%F %T') $from -> $to : $(git log -1 --format=%s origin/main)"
  git reset -q --hard origin/main
  docker compose up -d --build --quiet-pull 2>&1 | tail -3
  # Vérifié : floor répond.
  sleep 5
  if curl -fsS -m 5 http://127.0.0.1:5002/health >/dev/null; then echo "  ok"; else echo "  floor ne répond pas"; fi
}

deploy
