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
const BN          = require('bn.js');
const reverse     = require('buffer-reverse');

class BitcoinNode extends EventEmitter {
    constructor($q, $timeout) {
        super();
        this.$q = $q;
        this.subscriptions = [];
        params.net.webSeeds = ['ws://localhost:8193'];
        //params.net.webSeeds = ['ws://gotoshi.herokuapp.com:80'];
        //params.net.webSeeds.push('ws://localhost:8193');
        params.net.webSeeds.push('ws://gotoshi.herokuapp.com:80');

        params.blockchain.checkpoints = [ //testnet
            {
                height: 1012032, //heigth/2016
                header: {
                    version: 536870912,
                    prevHash: utils.toHash('00000000000004101d04ebc90ade5d4b911aa13c038ecf25e9887d877203ddb8'),
                    merkleRoot: utils.toHash('68344f9ea6407d77d5c68609272204070f57c9fc7aad68186a0d5608f10bd80a'),
                    timestamp: new Date('2016-10-23T14:00:43Z') / 1000, // | 0 ?
                    bits: 436546764,
                    nonce: 575841817
                }
            }
        ];

        this.lastBlock = params.blockchain.checkpoints[0].height;

        const localBlock = localStorage.getItem('block');
        if(localBlock && localBlock !== 'undefined') {
            const localBlockDecoded = JSON.parse(localBlock);
            params.blockchain.checkpoints = [ //testnet
                {
                    height: localBlockDecoded.height, //heigth/2016
                    header: {
                        version: localBlockDecoded.header.version,
                        prevHash: new Buffer(localBlockDecoded.header.prevHash.data, 'hex'),
                        merkleRoot: new Buffer(localBlockDecoded.header.merkleRoot.data, 'hex'),
                        timestamp: localBlockDecoded.header.timestamp, // | 0 ?
                        bits: localBlockDecoded.header.bits,
                        nonce: localBlockDecoded.header.nonce
                    }
                }
            ];

            this.lastBlock = localBlockDecoded.height;
            debug(params.blockchain.checkpoints);
        }

        let opts = {
            peerGroupOpts: {connectWeb: true, numPeers: 1, peerOpts: { relay: false }},
            filterOpts: {falsePositiveRate: 0.0},
            blockstreamOpts: {filtered: true}
        };

        const db     = levelup('bitcoin-testnet.chain', { db: require('memdown') });
        const dbTX   = levelup('bitcoin-testnet.tx', { db: require('memdown') });
        const chain  = new Blockchain(params.blockchain, db);

        dbTX.createReadStream().on('data', function (data) {
            let tx = JSON.parse(data.value);
            tx.getId = function() { return data.key };
            for (let output of tx.outs) {
                output.script = Buffer.from(output.script.data);
                output.valueBuffer = Buffer.from(output.valueBuffer.data);
                output.value = new BN(reverse(output.valueBuffer).toString('hex'), 'hex');
            }
            for (let input of tx.ins) {
                input.hash = Buffer.from(input.hash.data);
                input.script = Buffer.from(input.script.data);
            }
            $timeout(()=> { //hack to trigger angular scope cycles
                notifyObservers(tx);
            }, 0);
        });

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
            /*if(this.timeout) $timeout.cancel(this.timeout);
            this.timeout = $timeout(()=> {
                if(this.timeout) $timeout.cancel(this.timeout);
                debug("trigger rescan");
                if (!this.rescan) {
                    this.peers.send('mempool');
                    this.rescan = true;
                    chain.getBlockAtHeight(params.blockchain.checkpoints[0].height, function (err, startBlock) {
                        if (err) {
                            debug('error looking up block at height', params.blockchain.checkpoints[0].height);
                            return false;
                        }

                        const readStream = chain.createReadStream({ from: startBlock.header.getHash(), inclusive: false });
                        readStream.pipe(blockStream);
                    });
                }
            }, 10*1000);*/
        });

        this.peers.once('peer', () => {
            let startBlock = chain.tip;
            debug("chain at tip", startBlock.height);
            $timeout(()=> { //hack to trigger angular scope cycles
                this.lastBlock = startBlock.height;
                this.lastBlockTime = startBlock.header.timestamp;
            }, 0);
            //chain.getBlockAtHeight(params.blockchain.checkpoints[0].height, function (err, startBlock) {
            //    if (err) {
            //        debug('error looking up block at height', params.blockchain.checkpoints[0].height, err);
            //        return false;
            //    }

            const readStream = chain.createReadStream({ from: startBlock.header.getHash(), inclusive: false });
            readStream.pipe(blockStream);
           // });

            const headers = new Download.HeaderStream(this.peers);
            pump(
                chain.createLocatorStream(),
                headers,
                chain.createWriteStream(),
                this._error.bind(this)
            );
            this.peers.send('mempool');
        });

        this.peers.once('ready', () => {
            this.peers.send('mempool');
            this.connected = true;
        });

        this.peers.on('peer', (peer) => {
            debug('connected to peer', peer.version.senderAddress.address);
        });

        this.observerCallbacks = [];
        const notifyObservers = (tx) =>{
            angular.forEach(this.observerCallbacks, function(callback){
                callback(this.decodeTransaction(tx));
            }, this);
        };

        this.inv = new Inventory(this.peers);
        this.inv.on('tx', (tx) => {
            dbTX.put(tx.getId(), JSON.stringify(tx), function (err) {
                if (err) debug(err);
            });
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
        else if(days===1) return days + " day";
        else if(hours>1) return hours + " hours";
        else if(hours===1) return hours + " hour";
        else if(hours<1) return minutes + " min";
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
    decodeTransaction(tx) {
        try {
            let index = 0;
            for (let output of tx.outs) {
                output.index = index;
                if(typeof output.value.toNumber === 'function') output.value  = output.value.toNumber();
                const chunks = bitcoinjs.script.decompile(output.script);
                output.type = chunks[0];
                if(output.type === bitcoinjs.opcodes.OP_RETURN) {
                    chunks.shift();
                    output.message = chunks.toString();
                }else if(output.type !== bitcoinjs.opcodes.OP_TRUE){
                    output.pubKey = bitcoinjs.address.fromOutputScript(output.script, bitcoinjs.networks.testnet);
                }
                index++;
            }
            for (let input of tx.ins) {
                const chunksIn = bitcoinjs.script.decompile(input.script);
                if (bitcoinjs.script.isScriptHashInput(chunksIn)) {
                    let hash = bitcoinjs.crypto.hash160(chunksIn[chunksIn.length - 1]);
                    input.pubKey = bitcoinjs.address.toBase58Check(hash, bitcoinjs.networks.bitcoin.scriptHash)
                } else {
                    input.pubKey = bitcoinjs.ECPair.fromPublicKeyBuffer(chunksIn[1], bitcoinjs.networks.testnet).getAddress();
                }
                input.lastTxId = [].reverse.call(new Buffer(input.hash)).toString('hex');
            }
        }catch(e) {
            debug('Error with decoding', tx, tx.getId());
            debug(e);
        }
        return tx;
    }
}

BitcoinNode.$inject = ['$q', '$timeout'];

export default angular.module('services.bitcoin-node', [])
    .service('bitcoinNode', BitcoinNode)
    .name;