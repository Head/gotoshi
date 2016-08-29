export default class HomeController {
  constructor(wallet, $sce) {
    this.wallet = wallet;
    this.name = this.wallet.getLatestAddress();

    this.htmlAddress = $sce.trustAsHtml('<h5>'+this.wallet.getLatestAddress()+'</h5><img width=\'150\' height=\'150\' src=\'https://blockchain.info/qr?data='+this.wallet.getLatestAddress()+'}&amp;size=150\'>');
  }
}

HomeController.$inject = ['wallet', '$sce'];
