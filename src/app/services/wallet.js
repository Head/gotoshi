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
        this.wallet = {balance:0, lastTX: '', address: {}, unspend: [], unspendTmp: {}, openGames: {}};

        debug('in init()');
        if(this.load()) {
            this.wallet.unspendTmp = {};
            this.wallet.openGames = {};
            this.set(this.wallet);
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
        let tx1 = {
            outs: [
                {
                    type:'foo',
                    pubKey: 'mmTNfo1k92h958xTBP18YrSTMUnjrCAVS4',
                    value: 1000,
                    index: 0
                }
            ],
            ins: [
                {
                    type:'foo',
                    pubKey: 'asdf',
                    value: 1000,
                    lastTxId: "IDtx0"
                }
            ],
            getId: function() {return "IDtx1"}
        };
        let tx2 = {
            outs: [
                {
                    type:'foo',
                    pubKey: 'mmTNfo1k92h958xTBP18YrSTMUnjrCAVS4',
                    value: 1000,
                    index: 0
                }
            ],
            ins: [
                {
                    type:'foo',
                    pubKey: 'mmTNfo1k92h958xTBP18YrSTMUnjrCAVS4',
                    value: 1000,
                    lastTxId: "IDtx1"
                }
            ],
            getId: function() {return "IDtx2"}
        };
        let tx3 = {
            outs: [
                {
                    type:'foo',
                    pubKey: 'mmTNfo1k92h958xTBP18YrSTMUnjrCAVS4',
                    value: 1000,
                    index: 0
                }
            ],
            ins: [
                {
                    type:'foo',
                    pubKey: 'mmTNfo1k92h958xTBP18YrSTMUnjrCAVS4',
                    value: 1000,
                    lastTxId: "IDtx2"
                }
            ],
            getId: function() {return "IDtx3"}
        };
    }

    gotTransaction(tx) {
        tx.outs.forEach((output) => {
            if(output.type !== bitcoinjs.opcodes.OP_RETURN) {
                if (this.isOwnAddress(output.pubKey)) {
                    debug("received incoming payment", output.pubKey, tx.getId(), output.value, tx);
                    if (tx.ins[0].pubKey === output.pubKey) { //send to self
                        let index = this.wallet.unspend.findIndex(x => x.tx === tx.ins[0].lastTxId);
                        if (index !== -1) {
                            this.wallet.balance -= this.wallet.unspend[index].value;
                            this.wallet.unspend.splice(index, 1);
                        }else{
                            debug("didn't find", tx.ins[0].lastTxId);
                            this.wallet.unspendTmp[tx.ins[0].lastTxId] = true;
                        }
                    }
                    this.addUnspend(tx.getId(), output.value, output.index);
                }
            }
        });
        this.removeUnspendTmp();
    }

    removeUnspendTmp() {
        Object.keys(this.wallet.unspendTmp).forEach((txTmpId) => {
            let index = this.wallet.unspend.findIndex(x => x.tx === txTmpId);
            if (index !== -1) {
                this.wallet.balance -= this.wallet.unspend[index].value;
                this.wallet.unspend.splice(index, 1);
                delete this.wallet.unspendTmp[txTmpId];
            }
        });
    }
    isOwnAddress(address) {
        if(address === this.wallet.address.address) return true;
        else return false;
    }
    connect() {
        this.bitcoinNode.connect();
    }
    isConnected() {
        return true;
        return this.bitcoinNode.isConnected();
    }
    getHeight() {
        return this.bitcoinNode.getHeight();
    }
    getSynctimeDiff() {
        return this.bitcoinNode.getSynctimeDiff();
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
    getUnspend(amountSum) {
        let index = this.wallet.unspend.findIndex(x => x.value >= amountSum);
        if(index == -1) return false;
        let unspend = this.wallet.unspend[index];
        this.wallet.balance -= unspend.value;
        this.wallet.unspend.splice(index, 1);
        this.set(this.wallet);
        return unspend;
    }
    addUnspend(tx, balance, index) {
        if(this.wallet.unspend.findIndex(x => x.tx === tx) > -1) return;
        this.wallet.unspend.push({tx: tx, value: balance, index: index});
        this.wallet.lastTX = tx;
        this.wallet.balance += balance;
        this.set(this.wallet);
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
            this.wallet.unspend = [];
            this.wallet.balance = 0;
            return true;
        }else return false;
    }
    listenToAddress(address) {
        this.bitcoinNode.subscribe(address.address).then(function() {});
    }

    saveOpenGame(txID, keyPair, value) {
        this.wallet.openGames[keyPair.getAddress()] = {txId: txID, wif: keyPair.toWIF(), value: value};
        debug(this.wallet);
        this.set(this.wallet);
    }

    spendOpenGame(from, to) {
        debug("in spendOpenGame", from, to, this.wallet.openGames);
        if(typeof this.wallet.openGames[from] === 'undefined') return;
        let lastTx = this.wallet.openGames[from];
        const tx = new bitcoinjs.TransactionBuilder(bitcoinjs.networks.testnet);
        tx.addInput(lastTx.txId, 1); //index 1
        tx.addOutput(to, lastTx.value-8000);
        const keyPair = bitcoinjs.ECPair.fromWIF(lastTx.wif, bitcoinjs.networks.testnet);
        tx.sign(0, keyPair);

        const buildTX = tx.build();
        debug("pay to game", buildTX.toHex());

        this.bitcoinNode.sendTx(buildTX);

        delete this.wallet.openGames[from];
        this.set(this.wallet);
    }

    sendTxTo(sendTos, message) {
        debug("send tx", sendTos);

        const tx = new bitcoinjs.TransactionBuilder(bitcoinjs.networks.testnet);

        const fee_amount = 8000;
        let op_amount = 0;
        let amount = 0;

        //Amounts top here, because the out address must be index 0, see top
        if(message!=='') {
            op_amount = 1;
        }
        sendTos.forEach(function(sendTo) {
            amount += sendTo.value;
        });

        const amountSum = amount+fee_amount+op_amount;
        let lastTx = this.getUnspend(amountSum);
        if(typeof lastTx !== 'object') {
            debug("no last TX found");
            return;
        }

        tx.addInput(lastTx.tx, lastTx.index); //index 0

        const balance = lastTx.value-amountSum;
        tx.addOutput(this.getLatestAddress(), balance);

        sendTos.forEach(function(sendTo) {
            tx.addOutput(sendTo.address, sendTo.value);
        });

        if(message!=='') {
            //adding OP_RETURN Data
            const data = new Buffer(message);
            const dataScript = bitcoinjs.script.nullDataOutput(data);
            tx.addOutput(dataScript, op_amount);
        }

        const keyPair = bitcoinjs.ECPair.fromWIF(this.getWif(), bitcoinjs.networks.testnet);
        tx.sign(0, keyPair);

        const buildTX = tx.build();
        debug(buildTX.toHex());

        this.bitcoinNode.sendTx(buildTX);
        this.addUnspend(buildTX.getId(), balance, 0);
        this.set(this.wallet);

        return buildTX.getId();
    }
}

Wallet.$inject = ['bitcoinNode'];

export default angular.module('services.wallet', [])
    .service('wallet', Wallet)
    .name;
