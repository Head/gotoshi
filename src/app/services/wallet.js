import angular from 'angular';
const debug       = require('debug')('gotoshi:wallet');
/*
 const params          = require('webcoin-bitcoin-testnet').wallet;
 const bitcoinWallet   = require('bitcoin-wallet');
 const levelup     = require('levelup');

 const walletDB = levelup('bitcoin-testnet.wallet', { db: require('level-js') });
 const walletStream = new bitcoinWallet(params.wallet, walletDB);
 walletStream.on('filteradd', function(filterable){
 debug("filteradd");
 this.peersFilter.add(filterable);
 });*/

const bitcoinjs = require('bitcoinjs-lib');

class Wallet {
    constructor(bitcoinNode) {
        this.bitcoinNode = bitcoinNode;
        this.wallet = {balance:0, lastTX: '', address: '', unspend: []};

        debug('in init()');
        if(this.load()) {
            this.listenToAddress(this.wallet.address);
        }else{
            // generate random keyPair
            const keyPair = bitcoinjs.ECPair.makeRandom({network: bitcoinjs.networks.testnet});
            this.wallet.address = {address: keyPair.getAddress(), wif: keyPair.toWIF()};
            debug('address: ' + this.wallet.address.address);
            debug('private wif: ' + this.wallet.address.wif);

            this.set(this.wallet);
            this.listenToAddress(this.wallet.address);
        }

        this.bitcoinNode.registerObserverCallback(this.gotTransaction.bind(this));
    }

    gotTransaction(tx) {
        try {
            tx.outs.forEach((output) => {
                const pubKey = bitcoinjs.address.fromOutputScript(output.script, bitcoinjs.networks.testnet);

                if (this.isOwnAddress(pubKey)) {
                    debug("received incoming payment", pubKey, tx.getId(), output.value.toNumber(), tx);

                    let chunksIn = bitcoinjs.script.decompile(tx.ins[0].script);
                    let pubKeyIn = bitcoinjs.ECPair.fromPublicKeyBuffer(chunksIn[1], bitcoinjs.networks.testnet);

                    let prevOutTxId = [].reverse.call(new Buffer(tx.ins[0].hash)).toString('hex');
                    if(pubKeyIn.getAddress() === pubKey) { //send to self
                        this.wallet.unspend.splice(this.wallet.unspend.findIndex(x => x.tx === prevOutTxId), 1);
                    }

                    this.addUnspend(tx.getId(), output.value.toNumber());
                }
            });
        }catch(e){
            //debug("a wild error occurred ", e);
        }
    }

    isOwnAddress(address) {
        if(address === this.wallet.address.address) return true;
        else return false;
    }
    connect() {
        this.bitcoinNode.connect();
    }
    isConnected() { return this.bitcoinNode.isConnected() }
    getHeight() {
        return this.bitcoinNode.getHeight();
    }
    getLatestAddress() {
        return this.wallet.address.address;
    }
    getLastTX() {
        return this.wallet.lastTX;
    }
    getBalance() {
        return this.wallet.balance;
    }
    getUnspend() {
        let unspend = this.wallet.unspend.shift();
        if(typeof unspend === 'undefined') return false;
        this.wallet.balance -= unspend.value;
        return unspend;
    }
    addUnspend(tx, balance) {
        this.wallet.unspend.push({tx: tx, value: balance});
        this.wallet.lastTX = tx;
        this.wallet.balance += balance;
    }
    getWif() {
        return this.wallet.address.wif;
    }
    set(wallet) {
        debug('set wallet to localStorage');
        const walletToken = JSON.stringify(wallet);
        this.save(walletToken);
        this.wallet = this.decode(walletToken);
    }
    save(walletToken) {
        localStorage.setItem('wallet', walletToken);
    }
    decode(walletToken) {
        return JSON.parse(walletToken);
    }
    load() {
        debug('load wallet from localStorage');
        const walletToken = localStorage.getItem('wallet');
        if(walletToken && walletToken !== 'undefined') {
            Object.assign(this.wallet, this.decode(walletToken));
            return true;
        }else return false;
    }
    listenToAddress(address) {
        this.bitcoinNode.subscribe(address.address).then(function() {});
    }
}

Wallet.$inject = ['bitcoinNode'];

export default angular.module('services.wallet', [])
    .service('wallet', Wallet)
    .name;
