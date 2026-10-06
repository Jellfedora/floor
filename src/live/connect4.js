// Les règles du Puissance 4 : 7 colonnes de 6 cases, les jetons tombent en bas ; 4 alignés gagnent.
const COLUMNS = 7
const ROWS = 6

// Une grille vide : une pile par colonne, du bas vers le haut (1 ou 2, le joueur).
const empty = () => Array.from({ length: COLUMNS }, () => [])

// Les 4 cases alignées passant par (c, r), s'il y en a, ou null.
function line (columns, c, r) {
  const who = columns[c][r]
  const at = (c, r) => (c >= 0 && c < COLUMNS && r >= 0 && r < ROWS ? columns[c][r] : undefined)
  for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const cells = [[c, r]]
    for (const s of [1, -1]) {
      for (let k = 1; at(c + s * dc * k, r + s * dr * k) === who; k++) cells.push([c + s * dc * k, r + s * dr * k])
    }
    if (cells.length >= 4) return cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, 4)
  }
  return null
}

// Joue dans la colonne `c` : la ligne gagnante, ou null. Lance une erreur si la colonne est pleine.
function drop (columns, c, who) {
  if (!Number.isInteger(c) || c < 0 || c >= COLUMNS) throw new RangeError('colonne : un entier entre 0 et 6')
  if (columns[c].length >= ROWS) throw new RangeError('Colonne pleine')
  columns[c].push(who)
  return line(columns, c, columns[c].length - 1)
}

const full = (columns) => columns.every((col) => col.length >= ROWS)

module.exports = { COLUMNS, ROWS, empty, drop, full, line }
