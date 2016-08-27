export default class HomeController {
  constructor(randomNames, wallet) {
    this.wallet = wallet;
    this.random = randomNames;
    this.name = 'World';
  }

  changeName() {
    this.name = 'angular-tips';
  }

  randomName() {
    this.name = this.random.getName();
  }
}

HomeController.$inject = ['randomNames', 'wallet'];
