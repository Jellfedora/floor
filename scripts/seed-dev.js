const base = 'http://localhost:5002'
const players = [['Dio', 512, 98, 41], ['Halford', 468, 96, 33], ['Dickinson', 431, 95, 28], ['Ozzy', 387, 91, 22], ['Lemmy', 352, 89, 19], ['Doro', 318, 93, 17], ['Hetfield', 274, 87, 12]]
;(async () => {
  for (const [name, letters, accuracy, combo] of players) {
    const p = await (await fetch(`${base}/v1/players`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })).json()
    const r = await fetch(`${base}/v1/games/speed-metal/scores`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${p.token}` }, body: JSON.stringify({ letters, words: Math.round(letters / 6), wpm: Math.round(letters / 5), accuracy, combo }) })
    console.log(name, r.status)
  }
  const b = await (await fetch(`${base}/v1/games/speed-metal/leaderboard`)).json()
  console.log(b.entries.map((e) => `${e.rank}. ${e.name} ${e.score}`).join('\n'))
})()
