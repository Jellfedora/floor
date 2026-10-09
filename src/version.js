// La version de floor, que /health donne : celle de package.json, le commit déployé et sa date
// (passés à l'image par scripts/auto-deploy.sh ; sans Docker, demandés à git), et depuis quand il tourne.
const { execFileSync } = require('node:child_process')
const { version } = require('../package.json')

function git (args) {
  try {
    return execFileSync('git', args, { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null
  } catch {
    return null
  }
}

const commit = process.env.FLOOR_COMMIT || git(['rev-parse', '--short', 'HEAD'])
const date = process.env.FLOOR_COMMIT_DATE || git(['log', '-1', '--format=%cI'])
const started = new Date().toISOString()

module.exports = { version, commit, date, started }
