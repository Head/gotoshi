import angular from 'angular';

const bitcoinjs = require('bitcoinjs-lib');
const debug = require('debug')('gotoshi:gameService')

class Game {
    constructor(bitcoinNode, transaction, $q, wallet, $state) {
        this.bitcoinNode = bitcoinNode;
        this.transaction = transaction;
        this.$q = $q;
        this.$state = $state;
        this.wallet = wallet;

        //todo use vanity address
        this.masterAddress = '2N2G7Ps2W5AepNaK3Sk9pxxCkomc9yEif5T';// 2N2G7Ps2W5AepNaK3Sk9pxxCkomc9yEif5T 2My53r8phch7JbfzyHgJcDbRfV4vBSa1yJr '2N8Dn9MYKmmxrDgb9wanNfCcp6Ar31tRvDZ';

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

        this.bitcoinNode.registerObserverCallback(this.gotTransaction.bind(this));
        this.bitcoinNode.subscribe(this.masterAddress);
    }

    getGames() {
        return this.games;
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
                        this.games[gameAddress].state = 'running';
                        this.games[gameAddress].address.public = gameAddress;
                        this.games[gameAddress].players.one = pubKeyIn;
                    }else if(message === this.commands.pass) {
                        if(this.games[gameAddress].state !== 'pass') {
                            this.games[gameAddress].state = 'pass';
                        }else{
                            this.games[gameAddress].state = 'end';
                        }
                    }else if(message === this.commands.join) {
                        this.games[gameAddress].players.two = pubKeyIn;
                    }else{
                        //todo: verify in address in further moves!
                        const data = JSON.parse(message);
                        const move = {y: data.y, x: data.x, n: data.n, p: data.p};
                        this.games[gameAddress].moves[move.n] = move;
                        if(this.currentGame && this.currentGame.state === 'running' && this.currentGame.address.public === gameAddress) this.notifyMove(move);
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
        this.transaction.sendTxTo([{address: this.currentGame.address.public, value: 1}], JSON.stringify(move));
        this.currentGame.moves[move.n] = move;
        deferred.resolve();
        return deferred.promise;
    }
    sendPass() {
        const deferred = this.$q.defer();
        this.transaction.sendTxTo([{address: this.currentGame.address.public, value: 1}], 'pass');
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
        const sendTos = [
            {address: this.currentGame.address.public, value: 10000},
            {address: this.masterAddress, value: 10000}
        ];

        this.transaction.sendTxTo(sendTos, this.commands.join);
        this.currentGame.players.two = this.wallet.getLatestAddress();
    }
    notifyMove(move) {
        this.notifyObservers({type:'move', move: move});
    }
    resetGame(pubKey) {
        this.currentGame = angular.copy(this.gameInitState);
        this.currentGame.address.public = pubKey;
        this.games[pubKey] = this.currentGame;
    }
    startNewGame() {
        this.currentGame = angular.copy(this.gameInitState);

        const keyPair = bitcoinjs.ECPair.makeRandom({network: bitcoinjs.networks.testnet}); //todo multisig 2of2?
        this.currentGame.address.public = keyPair.getAddress();
        this.currentGame.address.wif = keyPair.toWIF();
        this.currentGame.state = 'running';
        this.currentGame.players.one = this.wallet.getLatestAddress();

        this.bitcoinNode.subscribe(this.currentGame.address.public);

        const sendTos = [
            {address: this.currentGame.address.public, value: 10000},
            {address: this.masterAddress, value: 10000} //todo use vanity address
        ];

        this.transaction.sendTxTo(sendTos, this.commands.new);
        this.games[this.currentGame.address.public] = this.currentGame;
        this.$state.transitionTo('game.play', {'pubKey': this.currentGame.address.public});
        return this.currentGame;
    }
}

Game.$inject = ['bitcoinNode', 'transaction', '$q', 'wallet', '$state'];

export default angular.module('services.game', [])
    .service('game', Game)
    .name;