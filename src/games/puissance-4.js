const { HttpError } = require('../players')

// Puissance 4, à deux sur floor (voir src/live) : le classement compte les victoires, que floor
// enregistre lui-même à la fin des parties.
module.exports = {
  id: 'puissance-4',
  name: 'Puissance 4',
  order: 'desc',
  score () {
    throw new HttpError(403, 'Les victoires sont comptées par floor')
  }
}
