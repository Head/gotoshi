import angular from 'angular';

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

class BitcoinNode {
    constructor($q, $timeout) {
        this.$q = $q;
        this.subscriptions = [];
        //params.net.webSeeds.push('ws://localhost:8193');
        params.net.webSeeds = ['ws://localhost:8193'];

        params.blockchain.checkpoints = [ //testnet
            {
                height: 921312, //heigth/2016
                header: {
                    version: 536870912,
                    prevHash: utils.toHash('00000000000001902376ff640d3088899af0819dbd15f602156a13ac2fc8e94e'),
                    merkleRoot: utils.toHash('31715ef5413777fcfcd99a547929eee1566215853b090e3cabfdd00322eba330'),
                    timestamp: new Date('2016-08-08T03:27:31Z') / 1000, // | 0 ?
                    bits: 436673963,
                    nonce: 1260146748
                }
            }
        ];

        this.lastBlock = params.blockchain.checkpoints[0].height;

        // create peer group
        this.peers = new PeerGroup(params.net, {connectWeb: true, numPeers: 1, peerOpts: { relay: false }} );
        this.peersFilter = new Filter(this.peers, {falsePositiveRate: 0.0});

        const db     = levelup('bitcoin-testnet.chain', { db: require('memdown') });
        const chain  = new Blockchain(params.blockchain, db);
        const blockStream = new Download.BlockStream(this.peers, {filtered: true});

        blockStream.on('data', (block) => {
            $timeout(()=> { //hack to trigger angular scope cycles
                this.lastBlock = block.height;
            }, 0);
            if (block.height % 2016 === 0) {
                debug('got 2016 block:', block.height);
                localStorage.setItem('block', JSON.stringify(block));
            }
            if (!this.rescan && block.height == 925819) {
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

            const hs = new Download.HeaderStream(this.peers);
            chain.createLocatorStream() // locators tell us which headers to fetch
                .pipe(hs) // pipe locators into new HeaderStream
                .pipe(chain.createWriteStream()); // pipe headers into Blockchain
        });

        this.peers.once('ready', () => {
            this.peers.send('mempool');
            this.connected = true;
        });

        this.peers.on('peer', (peer) => {
            debug('connected to peer', peer);

            // send/receive messages
            //peer.once('pong', () => debug('received ping response'))
            //peer.ping( () => {
            //    debug('sent ping')
            //})
            //peer.on('message', (message) => debug('received message', message))
        });

        // create connections to peers
        //this.peers.connect()

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
        this.peersFilter.add(new Buffer(hash.hash, 'hex'));
        if(this.peers.length>0) this.peers.send('mempool');
        deferred.resolve();
        return deferred.promise;
    }
}

BitcoinNode.$inject = ['$q', '$timeout'];

export default angular.module('services.bitcoin-node', [])
    .service('bitcoinNode', BitcoinNode)
    .name;