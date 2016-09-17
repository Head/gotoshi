import angular from 'angular';

const EventEmitter = require('events');
const bitcoinjs   = require('bitcoinjs-lib');
const Filter      = require('bitcoin-filter');
const Inventory   = require('bitcoin-inventory');
const Download    = require('blockchain-download');
// import network parameters for Bitcoin
const params      = require('webcoin-bitcoin-testnet');
const PeerGroup   = require('bitcoin-net').PeerGroup;
const Blockchain  = require('blockchain-spv');
const utils       = require('bitcoin-util');
const levelup     = require('levelup');
const debug       = require('debug')('gotoshi:bitcoinNode');
const pump        = require('pump');

class BitcoinNode extends EventEmitter {
    constructor($q, $timeout) {
        super();
        this.$q = $q;
        this.subscriptions = [];
        params.net.webSeeds = ['ws://localhost:8193'];
        //params.net.webSeeds = ['ws://gotoshi.herokuapp.com:80'];
        //params.net.webSeeds.push('ws://localhost:8193');
        params.net.webSeeds.push('ws://gotoshi.herokuapp.com:80');
        //


        params.blockchain.checkpoints = [ //testnet
            {
                height: 927360, //heigth/2016
                header: {
                    version: 805306368,
                    prevHash: utils.toHash('000000000000009dcb3ae6d68828e2f5ccfd58780abb260354e74484106f81ce'),
                    merkleRoot: utils.toHash('75ad5b2aec33cda5755f9cfb9c74e11cb2954c0104dc8fc00fb145ebe0dd8249'),
                    timestamp: new Date('2016-09-08T10:06:07Z') / 1000, // | 0 ?
                    bits: 436339440,
                    nonce: 2576579554
                }
            }
        ];

        this.lastBlock = params.blockchain.checkpoints[0].height;

        let opts = {
            peerGroupOpts: {connectWeb: true, numPeers: 1, peerOpts: { relay: false }, getTip: () => chain.getTip},
            filterOpts: {falsePositiveRate: 0.0},
            blockstreamOpts: {filtered: true}
        };

        const db     = levelup('bitcoin-testnet.chain', { db: require('memdown') });
        const chain  = new Blockchain(params.blockchain, db);

        // create peer group
        this.peers = new PeerGroup(params.net, opts.peerGroupOpts);
        this.filter = new Filter(this.peers, opts.filterOpts);
        const blockStream = new Download.BlockStream(this.peers, opts.blockstreamOpts);

        blockStream.on('data', (block) => {
            $timeout(()=> { //hack to trigger angular scope cycles
                this.lastBlock = block.height;
                this.lastBlockTime = block.header.timestamp;
            }, 0);
            if (block.height % 2016 === 0) {
                debug('got 2016 block:', block.height);
                localStorage.setItem('block', JSON.stringify(block));
            }
            if(this.timeout) $timeout.cancel(this.timeout);
            this.timeout = $timeout(()=> {
                if(this.timeout) $timeout.cancel(this.timeout);
                debug("trigger rescan");
                if (!this.rescan) {
                    this.peers.send('mempool');
                    this.rescan = true;
                    chain.getBlockAtHeight(params.blockchain.checkpoints[0].height, function (err, startBlock) {
                        if (err) {
                            debug('error looking up block at height', params.blockchain.checkpoints[0].height);
                            return this.emit('error', err)
                        }

                        const readStream = chain.createReadStream({ from: startBlock.header.getHash(), inclusive: false });
                        readStream.pipe(blockStream);
                    });
                }
            }, 10*1000);
        });

        this.peers.once('peer', () => {
            chain.getBlockAtHeight(params.blockchain.checkpoints[0].height, function (err, startBlock) {
                if (err) {
                    debug('error looking up block at height', params.blockchain.checkpoints[0].height);
                    return this.emit('error', err)
                }

                const readStream = chain.createReadStream({ from: startBlock.header.getHash(), inclusive: false });
                readStream.pipe(blockStream);
            });

            const headers = new Download.HeaderStream(this.peers);
            pump(
                chain.createLocatorStream(),
                headers,
                chain.createWriteStream(),
                this._error.bind(this)
            )
        });

        this.peers.once('ready', () => {
            this.peers.send('mempool');
            this.connected = true;
        });

        this.peers.on('peer', (peer) => {
            debug('connected to peer', peer);
        });

        this.observerCallbacks = [];
        const notifyObservers = (tx) =>{
            angular.forEach(this.observerCallbacks, function(callback){
                callback(tx);
            }, this);
        };

        this.inv = new Inventory(this.peers);
        this.inv.on('tx', (tx) => {
            $timeout(()=> { //hack to trigger angular scope cycles
                notifyObservers(tx);
            }, 0);
        });

        this.connect();
    }

    _error (err) {
        if (!err) return;
        this.emit('error', err)
    }

    isConnected() { return (this.connected && !this.peers.closed) }
    registerObserverCallback(callback){
        this.observerCallbacks.push(callback);
        //this.observerCallbacks[0] = callback;
    }
    connect() {
        this.connected = true;
        this.peers.connect();
        /*this.peers.accept((err) => {
            if (err) return console.error(err);
            debug('accepting incoming connections');
        })*/
    }
    getHeight() {
        return this.lastBlock;
    }
    getSynctimeDiff() {
        let delta = (parseInt(Date.now()/1000) - this.lastBlockTime);
        let days = Math.floor(delta / 86400);
        delta -= days * 86400;

        // calculate (and subtract) whole hours
        let hours = Math.floor(delta / 3600) % 24;
        delta -= hours * 3600;

        // calculate (and subtract) whole minutes
        let minutes = Math.floor(delta / 60) % 60;

        if(days>1) return days + " days";
        else if(hours>1) return hours + " hours";
        else if(hours<=1) return minutes + " min";
        else return "?";
    }
    sendTx(tx) {
        this.inv.broadcast(tx);
    }
    subscribe(address) {
        const deferred = this.$q.defer();
        if(this.subscriptions.indexOf(address) !== -1) {
            deferred.reject('already subscribed');
            return deferred.promise;
        }
        debug('subscribe to', address);
        this.subscriptions.push(address);

        const hash = bitcoinjs.address.fromBase58Check(address);
        this.filter.add(new Buffer(hash.hash, 'hex'));
        if(this.peers.length>0) this.peers.send('mempool');
        deferred.resolve();
        return deferred.promise;
    }
}

BitcoinNode.$inject = ['$q', '$timeout'];

export default angular.module('services.bitcoin-node', [])
    .service('bitcoinNode', BitcoinNode)
    .name;