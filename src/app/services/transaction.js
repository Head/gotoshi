import angular from 'angular';

const bitcoinjs   = require('bitcoinjs-lib');
const debug = require('debug')('gotoshi:transaction')

class Transaction {
    constructor(bitcoinNode, wallet) {
        this.bitcoinNode = bitcoinNode;
        this.wallet = wallet;
    }

    sendTxTo(sendTos, message) {
        let lastTx = this.wallet.getUnspend();
        if(typeof lastTx !== 'object') return;

        const tx = new bitcoinjs.TransactionBuilder(bitcoinjs.networks.testnet);
        tx.addInput(lastTx.tx, 0); //index 0

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

        const balance = lastTx.value-amount-fee_amount-op_amount;
        tx.addOutput(this.wallet.getLatestAddress(), balance);

        sendTos.forEach(function(sendTo) {
            tx.addOutput(sendTo.address, sendTo.value);
        });

        if(message!=='') {
            //adding OP_RETURN Data
            const data = new Buffer(message);
            const dataScript = bitcoinjs.script.nullDataOutput(data);
            tx.addOutput(dataScript, op_amount);
        }

        const keyPair = bitcoinjs.ECPair.fromWIF(this.wallet.getWif(), bitcoinjs.networks.testnet);
        tx.sign(0, keyPair);

        const buildTX = tx.build();
        debug(buildTX.toHex());

        this.bitcoinNode.sendTx(buildTX);
        this.wallet.addUnspend(buildTX.getId(), balance);
    }
}

Transaction.$inject = ['bitcoinNode', 'wallet'];

export default angular.module('services.transaction', [])
    .service('transaction', Transaction)
    .name;
