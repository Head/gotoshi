import './about.css';

import angular from 'angular';
import uirouter from 'angular-ui-router';

import routing from './about.routes';
import AboutController from './about.controller';
import game from '../../services/game';
import bitcoinNode from '../../services/bitcoinNode';
import wallet from '../../services/wallet';

export default angular.module('app.about', [uirouter])
  .config(routing)
  .controller('AboutController', AboutController)
  .name;
