import angular from 'angular';

const bitcoinjs = require('bitcoinjs-lib');
const debug = require('debug')('gotoshi:gameService')

class Game {
    constructor(bitcoinNode, $q, wallet, $state) {
        this.bitcoinNode = bitcoinNode;
        this.$q = $q;
        this.$state = $state;
        this.wallet = wallet;

        //todo use vanity address
        //Address: mgogame3DCWbQGXCP5bQZqFeK1YP5qN7in
        //Privkey: 91eMFqWUDgdctBoKi3715sgDMcX9iqqkEsA8kmw9uUiBLbMNgdD
        this.masterAddress = 'mgogame3DCWbQGXCP5bQZqFeK1YP5qN7in';// 2N2G7Ps2W5AepNaK3Sk9pxxCkomc9yEif5T 2My53r8phch7JbfzyHgJcDbRfV4vBSa1yJr '2N8Dn9MYKmmxrDgb9wanNfCcp6Ar31tRvDZ';

        this.gameInitState = {
            state: 'init',
            address: {public: null},
            players: {one: null, two: null},
            moves: []
        };

        this.observerCallbacks = [];
        this.commands = {'new': 'GO: New', 'pass': 'GO: pass', 'join': 'GO: join'};
        this.tx = {count: 0};
        this.games = {};
        this.currentGame = angular.copy(this.gameInitState);

        this.filters = {
            owner: 'all',
            state: 'all',
            value: 'all'
        };

        this.bitcoinNode.registerObserverCallback(this.gotTransaction.bind(this));
        this.bitcoinNode.subscribe(this.masterAddress);
    }

    getUnfilteredGamesCount() {
        return Object.keys(this.games).length;;
    }

    getGamesCount() {
        return Object.keys(this.getGames()).length;
    }

    getGames() {
        return Object.filter(this.games, this.filterGames.bind(this));
    }

    filterGames(game) {
        let isValid = true;
        if (this.filters.owner === 'own') {
            if (!this.wallet.isOwnAddress(game.players.one) && !this.wallet.isOwnAddress(game.players.two)) isValid = false;
        }else if (this.filters.owner === 'notown') {
            if (this.wallet.isOwnAddress(game.players.one) || this.wallet.isOwnAddress(game.players.two)) isValid = false;
        }

        if (this.filters.value === 'tiny') { //< 0.005
            if (game.address.value > (0.005 * 100000000)) isValid = false;
        } else if (this.filters.value === 'medium') { //0.005 - 0.05
            if (game.address.value > (0.05 * 100000000) || game.value < (0.005 * 100000000)) isValid = false;
        } else if (this.filters.value === 'big') { //> 0.5
            if (game.address.value < (0.5 * 100000000)) isValid = false;
        }

        if (this.filters.state === 'all') {
            //no filter
        }else{
            if (game.state !== this.filters.state) isValid = false;
        }

        return isValid;
    }

    setFilter(optionsOwner, optionsState, optionsValue) {
        this.filters = {
            owner: optionsOwner,
            state: optionsState,
            value: optionsValue
        }
    }

    isGameAddress(address) {
        if(address.pubKey === this.masterAddress) return true;
        else return Object.keys(this.games).find(x => x === address.pubKey);
    }

    notifyObservers(message){
        angular.forEach(this.observerCallbacks, function(callback){
            callback(message);
        });
    }

    gotTransaction(tx) {
        //const txb = bitcoinjs.TransactionBuilder.fromTransaction(tx);

        let isTxToMaster = undefined;
        try {
            for (let output of tx.outs) {
                output.value  = output.value.toNumber();
                const chunks = bitcoinjs.script.decompile(output.script);
                if(chunks[0] !== bitcoinjs.opcodes.OP_RETURN) {
                    output.pubKey = bitcoinjs.address.fromOutputScript(output.script, bitcoinjs.networks.testnet);
                }
            }
            for (let input of tx.ins) {
                const chunksIn = bitcoinjs.script.decompile(input.script);
                input.pubKey = bitcoinjs.ECPair.fromPublicKeyBuffer(chunksIn[1], bitcoinjs.networks.testnet).getAddress();
            }
            // debug(tx.outs[0], tx.ins[0]);
        }catch(e) {
            debug('Error with key decoding: ', tx, tx.getId());
            debug(e);
        }

        debug('in Game Service: ', tx, tx.getId());

        isTxToMaster = tx.outs.find(this.isGameAddress.bind(this));
        if(typeof isTxToMaster==='undefined') return;

        debug('found game');
        let pubKeyIn    = tx.ins[0].pubKey;
        let gameAddress = tx.outs[1].pubKey;
        this.bitcoinNode.subscribe(gameAddress);

        tx.outs.forEach((out) => {
            try {
                this.games[gameAddress] = this.games[gameAddress] || angular.copy(this.gameInitState);

                const chunks = bitcoinjs.script.decompile(out.script);
                if(chunks.shift() === bitcoinjs.opcodes.OP_RETURN) {
                    const message =  chunks.toString();
                    debug('OP_RETURN Message: '+message);

                    if(message === this.commands.new) {
                        this.games[gameAddress].state = 'open';
                        this.games[gameAddress].address.value = tx.outs[1].value;
                        this.games[gameAddress].address.public = gameAddress;
                        this.games[gameAddress].players.one = pubKeyIn;
                    }else if(message === this.commands.pass) {
                        if(pubKeyIn === this.games[gameAddress].players.one || pubKeyIn === this.games[gameAddress].players.two) {
                            if (this.games[gameAddress].state !== 'pass') {
                                this.games[gameAddress].state = 'pass';
                            } else {
                                this.games[gameAddress].state = 'end';
                            }
                        }
                    }else if(message === this.commands.join) {
                        this.games[gameAddress].state = 'running';
                        this.games[gameAddress].players.two = pubKeyIn;
                        this.games[gameAddress].address.paymentFromTwo = tx.outs[2].pubKey;

                        if(this.wallet.isOwnAddress(this.currentGame.players.one)) {
                            const pubKeys = [];
                            pubKeys[0] = new Buffer(this.masterAddress);
                            pubKeys[1] = new Buffer(this.games[gameAddress].players.one);
                            pubKeys[2] = new Buffer(this.games[gameAddress].players.two);
                            pubKeys[3] = new Buffer(this.games[gameAddress].address.public);

                            const redeemScript = bitcoinjs.script.multisigOutput(3, pubKeys); // 3 of 4
                            const scriptPubKey = bitcoinjs.script.scriptHashOutput(bitcoinjs.crypto.hash160(redeemScript));
                            const payAddress = bitcoinjs.address.fromOutputScript(scriptPubKey, bitcoinjs.networks.testnet);

                            if(this.games[gameAddress].address.paymentFromTwo === payAddress) {
                                this.games[gameAddress].address.payment = payAddress;
                                this.wallet.spendOpenGame(gameAddress, payAddress);
                            }
                        }
                    }else{
                        const data = JSON.parse(message);
                        const move = {y: data.y, x: data.x, n: data.n, p: data.p, pk: pubKeyIn};
                        this.games[gameAddress].moves[move.n] = move;
                        if (this.currentGame && this.currentGame.state === 'running' && this.currentGame.address.public === gameAddress) this.notifyMove(move);
                    }
                    this.tx.count++;
                    this.tx[this.tx.count] = message;
                }
            }catch(e){
                debug('Error with transaction: ', tx, tx.getId());
                debug('gameAddress: ', gameAddress);
                debug('pubKeyIn: ', pubKeyIn);
                debug(e)
            }
        });
    }

    registerObserverCallback(callback){
        //observerCallbacks.push(callback);
        this.observerCallbacks[0] = callback;
    }
    sendMove(move) {
        const deferred = this.$q.defer();
        this.wallet.sendTxTo([{address: this.currentGame.address.public, value: 1}], JSON.stringify(move));
        this.currentGame.moves[move.n] = move;
        deferred.resolve();
        return deferred.promise;
    }
    sendPass() {
        const deferred = this.$q.defer();
        this.wallet.sendTxTo([{address: this.currentGame.address.public, value: 1}], 'pass');
        this.currentGame.moves.push('pass');
        deferred.resolve();
        return deferred.promise;
    }
    setGame(game) {
        debug("set Game called", JSON.stringify(game));
        if(game === 'undefined') return;
        this.currentGame = game;
        this.notifyObservers({type:'start', game: game});
        this.currentGame.moves.forEach((move) => {this.notifyMove(move)});
        this.bitcoinNode.subscribe(this.currentGame.address.public);
    }
    joinGame() {
        if(this.currentGame.players.two !== null) debug('player two not null');
        if(this.currentGame.players.one === this.wallet.getLatestAddress()) debug('player one wallets match');
        if(this.currentGame.players.two !== null || this.currentGame.players.one === this.wallet.getLatestAddress()) return;

        this.currentGame.players.two = this.wallet.getLatestAddress();

        debug("player two pay for game");
        const pubKeys = [];
        pubKeys[0] = new Buffer(this.masterAddress);
        pubKeys[1] = new Buffer(this.currentGame.players.one);
        pubKeys[2] = new Buffer(this.currentGame.players.two);
        pubKeys[3] = new Buffer(this.currentGame.address.public);

        const redeemScript = bitcoinjs.script.multisigOutput(3, pubKeys); // 3 of 4
        const scriptPubKey = bitcoinjs.script.scriptHashOutput(bitcoinjs.crypto.hash160(redeemScript));
        const payAddress = bitcoinjs.address.fromOutputScript(scriptPubKey, bitcoinjs.networks.testnet);

        this.games[this.currentGame.address.public].address.payment = payAddress;

        const sendTos = [
            {address: this.currentGame.address.public, value: 1},
            {address: this.currentGame.address.payment, value: this.currentGame.address.value},
            {address: this.masterAddress, value: 10000}
        ];

        this.wallet.sendTxTo(sendTos, this.commands.join);
    }
    notifyMove(move) {
        this.notifyObservers({type:'move', move: move});
    }
    resetGame(pubKey) {
        this.currentGame = angular.copy(this.gameInitState);
        this.currentGame.address.public = pubKey;
        this.games[pubKey] = this.currentGame;
    }
    startNewGame(betAmount) {
        this.currentGame = angular.copy(this.gameInitState);

        const keyPair = bitcoinjs.ECPair.makeRandom({network: bitcoinjs.networks.testnet});
        this.currentGame.address.public = keyPair.getAddress();
        this.currentGame.address.value = betAmount*100000000;
        this.currentGame.state = 'running';
        this.currentGame.players.one = this.wallet.getLatestAddress();

        this.bitcoinNode.subscribe(this.currentGame.address.public);

        const sendTos = [
            {address: this.currentGame.address.public, value: this.currentGame.address.value},
            {address: this.masterAddress, value: 10000}
        ];

        let txID = this.wallet.sendTxTo(sendTos, this.commands.new);
        this.wallet.saveOpenGame(txID, keyPair, this.currentGame.address.value);
        this.games[this.currentGame.address.public] = this.currentGame;
        this.$state.transitionTo('game.play', {'pubKey': this.currentGame.address.public});
        return this.currentGame;
    }
}

Game.$inject = ['bitcoinNode', '$q', 'wallet', '$state'];

export default angular.module('services.game', [])
    .service('game', Game)
    .name;


Object.filter = (obj, predicate) =>
    Object.keys(obj)
        .filter( key => predicate(obj[key]) )
        .reduce( (res, key) => (res[key] = obj[key], res), {} );
