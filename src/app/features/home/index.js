import './home.css';

import angular from 'angular';
import uirouter from 'angular-ui-router';

import routing from './home.routes';
import HomeController from './home.controller';
import greeting    from '../../directives/greeting.directive';
import game from '../../services/game';
import bitcoinNode from '../../services/bitcoinNode';
import wallet from '../../services/wallet';

export default angular.module('app.home', [uirouter, greeting])
  .config(routing)
  .controller('HomeController', HomeController)
  .name;
