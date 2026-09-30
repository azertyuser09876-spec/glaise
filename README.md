# Glaise

*Extraction shooter* en voxels, dans un monde ouvert post-apocalyptique, procédural et multijoueur, qui tourne dans le navigateur. On part d'une planque, on s'infiltre dans la zone, on fouille maisons, camps et bunkers en affrontant des pillards armés, et on rejoint une zone d'extraction avant la fin du chrono — ou on perd tout ce qu'on portait. Un seul programme serveur (Node.js, **aucune dépendance à installer**) sert à la fois le jeu et la partie en ligne, en IPv6.

Tout est fait maison : moteur 3D WebGL2, génération du monde, textures, modèles, animations, sons et musique sont produits par le code au démarrage. Aucun fichier d'image ou de son externe.

## Lancer le serveur

**Le plus simple (Windows)** : double-cliquez sur `Glaise.exe` (téléchargeable dans les *Releases* du dépôt GitHub, voir « Compilation » plus bas). Il contient tout, Node.js compris, et le jeu s'ouvre **dans sa propre fenêtre** : Microsoft Edge (présent sur tout Windows 10 et 11, sinon Chrome ou Brave) en mode application, sans onglets ni barre d'adresse, avec un profil séparé qui garde vos réglages. Il n'y a pas de console : les adresses à donner aux amis s'affichent dans le menu du jeu, avec un bouton pour les copier. **Fermer la fenêtre sauvegarde le monde et arrête le serveur** (les amis connectés sont déconnectés). Relancer `Glaise.exe` pendant une partie ouvre simplement une fenêtre de plus. Le monde est sauvegardé dans `monde.json` à côté de l'exécutable. Autre port : `Glaise.exe 25565` (depuis un raccourci ou un terminal).

Le menu permet aussi de **rejoindre un autre serveur** (« Rejoindre un autre serveur » : entrez l'adresse d'un ami) sans quitter la fenêtre.

**Depuis les sources** : il suffit de Node.js 18 ou plus récent. La version portable convient : décompressez-la dans un dossier `node` à la racine du projet (`node\node.exe` sous Windows, `node/bin/node` ou `node/node` sous Linux/macOS). Ce dossier n'est pas envoyé sur GitHub. Python n'est pas nécessaire.

**Windows** : double-cliquez sur `start.bat`. Le script utilise le Node du dossier `node\` (ou un `node.exe` posé à côté), sinon celui du PATH. Le jeu s'ouvre dans sa propre fenêtre ; ici la console reste ouverte et c'est elle qui fait tourner le serveur : fermer la fenêtre du jeu ne l'arrête pas (pratique pour laisser un serveur allumé), fermer la console arrête la partie.

Pour choisir un autre port : `start.bat 25565`.

**Ligne de commande** (tous systèmes) :

```
node server.js            (port 8080)
node server.js 25565      (autre port)
```

Sous Linux / macOS : `./start.sh [port]`.

Au démarrage, la console affiche les adresses à utiliser. Laissez cette fenêtre ouverte pendant la partie ; `Ctrl+C` arrête le serveur proprement (le monde est sauvegardé).

## Jouer à plusieurs en IPv6

1. **Trouver l'adresse** : la console liste les adresses IPv6 publiques de la machine (celles qui commencent par `2` ou `3`). Vous pouvez aussi taper `ipconfig` (Windows) et chercher « Adresse IPv6 » (pas l'« Adresse IPv6 temporaire », qui change souvent).
2. **Donner l'adresse aux amis** avec des crochets autour de l'IPv6 et le port à la fin :
   `http://[2a01:e0a:1234:5678::abcd]:8080`
3. **Pare-feu Windows** : au premier lancement, Windows demande s'il faut autoriser Node.js ; cochez « Réseaux privés » **et** « Réseaux publics ». Si vous avez refusé : Pare-feu Windows Defender › Paramètres avancés › Règles de trafic entrant › Nouvelle règle › Port › TCP 8080 › Autoriser.
4. **Box Internet** : en IPv6 il n'y a pas de redirection de port (NAT), mais la plupart des box bloquent les connexions entrantes par défaut.
   - Livebox : Configuration avancée › Réseau › Pare-feu › IPv6, ajouter une règle autorisant le port TCP 8080 vers l'adresse du PC (ou passer le pare-feu IPv6 en « Faible »).
   - Freebox : Paramètres de la Freebox › Mode avancé › Pare-feu IPv6, désactiver le blocage ou ajouter une exception.
   - Bbox / SFR : menu Pare-feu IPv6 de l'interface, même principe.
5. Les amis ouvrent l'adresse dans un navigateur récent. Leur propre connexion doit aussi être en IPv6 (c'est le cas de la plupart des box et des réseaux mobiles en France). Pour tester, ils peuvent ouvrir https://test-ipv6.com.

En réseau local, l'adresse `http://192.168.x.x:8080` fonctionne aussi. Si la machine n'a pas du tout d'IPv6, le serveur bascule automatiquement en IPv4.

## Options du serveur

Variables d'environnement facultatives (à définir avant `node server.js`, par exemple `set PVP=0` sous Windows) :

| Variable | Effet |
| --- | --- |
| `PORT` | port d'écoute (le premier argument est prioritaire) |
| `HOST` | adresse d'écoute, `::` par défaut (IPv6 + IPv4) |
| `PVP=0` | désactive les dégâts entre joueurs |
| `SEED=12345` | graine d'un nouveau monde |
| `OPEN=0` | n'ouvre pas la fenêtre du jeu (serveur seul) |
| `GARDER=1` | `Glaise.exe` reste allumé après la fermeture de la fenêtre (arrêt par le gestionnaire des tâches) |
| `NAVIGATEUR=...` | chemin d'un navigateur à base de Chromium pour la fenêtre du jeu (sinon Edge, Chrome ou Brave, puis le navigateur par défaut) |

Le monde, les planques, l'argent, les inventaires, les caisses et les corps sont enregistrés dans `monde.json` (toutes les 30 secondes et à l'arrêt). Supprimez ce fichier pour recommencer avec un nouveau monde.

## Déroulement d'une partie

1. **La planque** (écran hors du monde, en sécurité) : 81 cases de stockage, le **sac de raid** (36 cases + casque + gilet) et trois onglets : **Marchand**, **Armurerie**, **Fabrication**. Un nouveau joueur commence avec un pistolet, des munitions, des bandages et 2 500 écus. Un **kit de survie** gratuit est disponible toutes les 10 minutes pour ne jamais rester sans arme.
2. **Partir en raid** : vous êtes déposé en un point aléatoire du monde, hors des villes et à au moins 150 blocs d'une zone d'extraction. Le chrono de **30 minutes** démarre.
3. **Dans la zone** : fouillez les caisses (touche **F**), abattez les pillards, ramassez leur équipement sur leur corps. Les tirs s'entendent de loin et attirent pillards et zombies ; un silencieux réduit fortement ce rayon.
4. **Extraction** : la boussole en haut de l'écran indique les zones d'extraction proches et leur distance (carte : **M**). Ce sont des aires balisées de jaune, avec des fusées et un fumigène rouge visible de loin. Restez **8 secondes** sur l'aire pour revenir à la planque avec tout votre sac.
5. **Mort** : votre corps reste sur place sous forme de sac à fouiller, avec tout ce que vous portiez — un autre joueur peut s'en emparer. **Chrono écoulé** : vous êtes porté disparu et l'équipement emporté est perdu. Dans les deux cas, la planque reste intacte.

## Commandes

| Touche | Action |
| --- | --- |
| Z Q S D (ou W A S D) | se déplacer (reconnu selon la position physique des touches) |
| Espace | sauter, remonter dans l'eau |
| Maj gauche, ou double appui sur avancer | sprinter |
| Clic gauche | tirer (arme en main), miner (maintenir), frapper |
| Clic droit | viser (arme en main), poser un bloc, manger ou se soigner (maintenir), ouvrir un établi ou une caisse |
| R | recharger (prend les munitions du bon calibre dans le sac) |
| B | changer de mode de tir (automatique / coup par coup) |
| L | allumer / éteindre la lampe tactique |
| C (maintenir) | s'accroupir (tir plus précis, plus discret) |
| F | fouiller une caisse, un coffre ou un corps |
| M | carte du secteur (zones d'extraction, bâtiments) |
| E | sac, fabrication, armurerie, et contenu de la caisse ouverte |
| 1 à 9, molette | choisir l'objet en main |
| A (Q en QWERTY) | jeter un objet, Ctrl+A pour toute la pile |
| T ou Entrée | discuter, `/` ouvre directement une commande |
| V | vue à la troisième personne (dos, puis face) |
| Tab (maintenir) | liste des joueurs |
| F3 | informations techniques |
| Échap | pause et réglages |

Commandes de discussion : `/aide`, `/joueurs`, `/temps jour` ou `/temps nuit`, `/tp <joueur>` (entre joueurs en raid), `/graine`.

Dans le sac : clic pour prendre ou poser une pile, clic droit pour en prendre la moitié ou en poser un seul, Maj+clic pour transférer (sac ↔ planque, sac ↔ caisse, ou équiper une armure), cliquer hors de la fenêtre pour jeter la pile tenue. À la planque, Ctrl+clic vend un objet au marchand.

## Contenu

**Armes** (6), chacune avec son calibre, sa cadence, son recul et sa précision :

| Arme | Calibre | Tir |
| --- | --- | --- |
| Pistolet PM-9 | 9 mm | coup par coup |
| Pistolet-mitrailleur Vespa | 9 mm | automatique / coup par coup |
| Fusil d'assaut AKG | 7,62 mm | automatique / coup par coup |
| Carabine M-G4 | 5,56 mm | automatique / coup par coup |
| Fusil à pompe Tonnerre | calibre 12 | à pompe (8 plombs) |
| Fusil de précision Faucon | 7,62 mm | à verrou |

La balistique est instantanée : dispersion plus forte à la hanche, en mouvement ou en saut, recul vertical et horizontal partiellement compensé, dégâts qui baissent au-delà de la portée de l'arme. Les tirs à la tête font plus du double, les jambes moins. Les balles traversent le feuillage et brisent le verre. Balles traçantes, éclair de bouche, impacts, marqueur de touche et indicateur de la direction des tirs reçus.

**Armurerie** (à la planque, ou en raid dans le sac, touche E) : 17 accessoires répartis sur six emplacements, visibles sur le modèle 3D de l'arme. Les statistiques sont comparées à celles de l'arme d'origine :

- Viseur : point rouge, holographique, lunettes ×4 et ×8 (zoom et vue en lunette).
- Bouche : silencieux 9 mm et de fusil (tir presque inaudible), compensateur, frein de bouche.
- Chargeur : 9 mm étendu, fusil 45 coups, tambour 75 coups.
- Crosse : tactique, de précision. Poignée : verticale, d'angle.
- Rail : lampe tactique, module laser (meilleure précision à la hanche).

**Munitions** : 9 mm, 5,56, 7,62, calibre 12, et des variantes perforantes pour les fusils.

**Protection et soins** : casques et gilets de classe 2 à 5 qui absorbent une part des dégâts selon la pénétration de la munition et s'usent. Les blessures peuvent provoquer une **hémorragie**, qui fait perdre de la vie jusqu'à ce qu'on applique un bandage. Trousse de secours ; stimulant (régénération et course plus rapide).

**Villes en ruine** : environ une ville par zone de 500 × 500 blocs, chacune avec son nom (« Port-Rouille », « Val-Cendres »…) affiché à l'entrée et sur la carte. Le terrain y est aplani et quadrillé de rues (asphalte fissuré, marquages, trottoirs) encombrées d'épaves, de gravats et de braseros. Les parcelles sont plus hautes vers le centre : immeubles de 4 à 7 étages (escaliers jusqu'au toit, fenêtres brisées, effondrements partiels), résidences, commerces avec vitrines, pavillons, stations-service, parkings, squares aux arbres morts et ruines. Les intérieurs sont sombres (la lampe tactique y est précieuse) et cachent caisses, armoires médicales et coffres-forts. Des pillards tiennent les étages, les commerces et les stations.

**Points d'intérêt** générés avec le monde, hors des villes : maisons abandonnées (caisses, armoires médicales, parfois un coffre-fort), camps militaires (sacs de sable, tentes, conteneur, caisses militaires), bunkers souterrains (escalier, salle éclairée, meilleur butin) et zones d'extraction. Les caisses se remplissent à nouveau 15 minutes après avoir été vidées. Le coffre de rangement (fabricable) sert de cache personnelle dans le monde.

**Pillards** : ennemis humains armés, postés dans les bâtiments et en patrouille. Ils ont un champ de vision, ne voient pas à travers les murs ni le feuillage, et ont un temps de réaction. Ils tirent en rafales, se placent selon leur arme, se déplacent latéralement, rechargent, cherchent votre dernière position connue et accourent au bruit des tirs. Leur corps contient leur arme, avec ses accessoires, et du butin.

**Économie** : objets de valeur (montres, cartes graphiques, clés chiffrées, dossiers…) à revendre au marchand. Il vend armes, munitions par lots de 30, accessoires, protections, soins et outils.

**Monde et survie** : terrain infini (océans, plaines, forêts, déserts, toundra, montagnes, grottes, minerais), cycle jour/nuit, créatures du jeu d'origine (zombies la nuit, araignées, slimes, animaux), faim, chutes, noyade. On peut toujours miner, construire et fabriquer ; certaines recettes de fortune (bandages, munitions, conserves) aident en raid. À la planque, l'onglet Fabrication utilise le contenu du sac et fait office d'établi et de four.

**Joueurs contre joueurs** : activé par défaut (`PVP=0` pour le désactiver). Les autres joueurs en raid peuvent vous abattre et récupérer votre corps.

## Jouer sur téléphone ou tablette

Ouvrez simplement l'adresse du serveur dans le navigateur du téléphone (même réseau Wi-Fi que le PC, ou adresse IPv6 par Internet), puis tenez-le **à l'horizontale**. Les commandes tactiles s'activent automatiquement sur les écrans tactiles et le jeu passe en plein écran quand c'est possible.

| Geste | Action |
| --- | --- |
| Pouce gauche (moitié gauche de l'écran) | joystick de déplacement ; poussé à fond vers l'avant : sprint |
| Pouce droit (glisser) | regarder autour de soi |
| Bouton rouge (grand) | tirer, miner, frapper ; glisser dessus permet aussi de viser en tirant |
| Bouton cible | viser (bascule) avec une arme ; sinon utiliser, poser, manger, se soigner (maintenir) |
| Flèche haut / bas | sauter / s'accroupir (bascule) |
| Boutons contextuels | recharger, fouiller (quand une caisse ou un corps est visé), mode de tir, lampe |
| Boutons du haut | pause (réglages), carte, sac, discussion, vue |
| Inventaire | toucher : prendre ou poser ; appui long : transfert rapide ; zone « Vendre » pour le marchand |

Sur téléphone, la distance de vue et la résolution sont réduites par défaut ; on peut les ajuster dans le menu pause. Pour forcer ou désactiver les commandes tactiles, ajoutez `?tactile=1` ou `?tactile=0` à l'adresse.

## Navigateurs

Firefox, Chrome, Edge ou Opera récents sur ordinateur ; Chrome ou Firefox sur Android, Safari sur iPhone et iPad (iOS 15 ou plus). WebGL2 est obligatoire. Si l'image est saccadée, réduisez la distance de vue ou activez le « mode performance » dans le menu pause. Sur iPhone, Safari ne permet pas le vrai plein écran : ajoutez la page à l'écran d'accueil pour gagner de la place.

## Compilation : Glaise.exe et Glaise.apk

Le dépôt GitHub compile tout seul les deux fichiers (onglet **Actions**, fichier `.github/workflows/compilation.yml`) à chaque envoi sur la branche `main` :

- **Glaise.exe** : le serveur en exécutable Windows autonome (Node.js, serveur et fichiers du jeu embarqués, script `build/sea.mjs`) ;
- **Glaise.apk** : l'application Android (dossier `android/`), qui demande l'adresse du serveur puis affiche le jeu en plein écran avec les commandes tactiles. Elle retient l'adresse ; le bouton retour permet de quitter ou de changer de serveur.

Après un envoi, les fichiers sont téléchargeables en bas de la page du « run » dans l'onglet Actions (compte GitHub nécessaire). Pour les partager simplement avec des amis, créez une version :

```
git tag v1.0
git push origin v1.0
```

Une *Release* « Glaise v1.0 » apparaît alors sur la page du dépôt avec `Glaise.exe` et `Glaise.apk` en téléchargement direct (dépôt public, ou amis invités comme collaborateurs si le dépôt est privé).

- Windows affiche parfois « Windows a protégé votre ordinateur » : l'exécutable n'est pas signé. *Informations complémentaires* → *Exécuter quand même*.
- Android : autorisez l'installation d'applications depuis cette source. L'APK est signé avec une clé fixe fournie dans le dépôt (`android/app/glaise-amis.p12`, volontairement publique, usage entre amis) : chaque nouvelle version s'installe par-dessus la précédente.
- Compiler l'exécutable soi-même (avec Node 22) : `npm run build:exe` crée `dist/Glaise.exe` sous Windows (`dist/glaise` sous Linux).

## Structure des fichiers

```
server.js                 serveur HTTP + WebSocket, raids, planques, caisses, pillards, sauvegarde
build/                    compilation de l'exécutable autonome (sea.mjs) et son icône
android/                  application Android (WebView plein écran)
.github/workflows/        compilation automatique sur GitHub
start.bat / start.sh      lanceurs
public/index.html         page du jeu
public/style.css
public/js/shared/         code commun client/serveur : bruit, blocs, armes (guns.js), génération
                          (terrain, villes, points d'intérêt), physique, créatures
public/js/client/         moteur de rendu, textures, modèles, modèles d'armes, tir (weapons.js),
                          commandes tactiles (touch.js), sons, interface, joueur, boucle de jeu
```
