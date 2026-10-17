// Le catalogue des modules de Ronnie : des applis à part, installées à la
// demande depuis sa page Téléchargements. Chacune publie ses versions dans les
// releases GitHub de son dépôt (public : Ronnie les télécharge sans compte),
// avec une archive par système nommée <id>-<cible>.tar.gz ou .zip, qui contient
// <app> sur macOS et <exe> (ou <exe>.exe) ailleurs.
//
// Ajouter un module ici le rend visible dans Ronnie sans nouvelle version de
// Ronnie.
module.exports = [
  {
    id: 'serj',
    name: 'Serj',
    description: 'Lecteur de BD en PDF, case par case : chaque case remplit l’écran.',
    repo: 'Jellfedora/serj',
    icon: 'https://raw.githubusercontent.com/Jellfedora/serj/main/assets/icon/icon.png',
    app: 'Serj.app',
    exe: 'serj'
  }
]
