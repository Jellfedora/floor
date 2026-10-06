const { HttpError } = require('../players')

// Ronnie.io, que floor fait tourner (voir src/blob) : le classement garde la plus grosse masse de
// chaque joueur, que floor enregistre lui-même quand il se fait manger.
module.exports = {
  id: 'ronnie-io',
  name: 'Ronnie.io',
  order: 'desc',
  score () {
    throw new HttpError(403, 'Les masses sont comptées par floor')
  }
}
