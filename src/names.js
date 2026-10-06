// Les pseudos : 24 caractères au plus, uniques sans tenir compte des majuscules ni des accents
// composés autrement (la clé les compare).
const NAME_MAX = 24

const nameKey = (name) => name.normalize('NFKC').toLocaleLowerCase('fr')

module.exports = { NAME_MAX, nameKey }
