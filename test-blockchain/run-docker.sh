#!/usr/bin/env sh

<<<<<<< HEAD
docker run --name bor-test -it -d -p 8545:8545 -v $(pwd):/bordata maticnetwork/bor:v0.2.8 /bin/sh -c "cd /bordata; sh start.sh"
=======
docker run --name bor-test -it -d -p 8545:8545 -v $(pwd):/bordata maticnetwork/bor:develop /bin/sh -c "cd /bordata; sh start.sh"
>>>>>>> eab530cb (Added changes for node v18.17.0)
