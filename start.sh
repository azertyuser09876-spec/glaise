#!/bin/sh
# Lance le serveur Glaise. Usage : ./start.sh [port]
cd "$(dirname "$0")" || exit 1
PORT="${1:-8080}"
NODE=node
# Node portable : fichier ./node, ou dossier ./node (node/node ou node/bin/node)
[ -f ./node ] && [ -x ./node ] && NODE=./node
[ -f ./node/node ] && [ -x ./node/node ] && NODE=./node/node
[ -f ./node/bin/node ] && [ -x ./node/bin/node ] && NODE=./node/bin/node
# le jeu s'ouvre dans sa propre fenêtre (Chrome, Chromium, Edge ou Brave en mode application)
FENETRE=1 exec "$NODE" server.js "$PORT"
