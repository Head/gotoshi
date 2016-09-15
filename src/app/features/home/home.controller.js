export default class HomeController {
  constructor(wallet, $sce) {
    this.wallet = wallet;
    this.name = this.wallet.getLatestAddress();

    this.htmlAddress = $sce.trustAsHtml('<div class="input-group input-group-sm">' +
        '<input class="form-control" readonly value="'+this.wallet.getLatestAddress()+'"/>' +
        '</div><img width=\'168\' height=\'168\' src=\'https://blockchain.info/qr?data='+this.wallet.getLatestAddress()+'}&amp;size=168\'>');
  }
}

HomeController.$inject = ['wallet', '$sce'];