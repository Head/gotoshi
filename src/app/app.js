import 'bootstrap/dist/css/bootstrap.css';
import '../style/style.css';

import angular from 'angular';
import uirouter from 'angular-ui-router';

import routing from './app.config';
import home from './features/home';
import game from './features/game';

angular.module('app', [uirouter, home, game])
  .config(routing);
