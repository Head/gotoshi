import 'bootstrap/dist/css/bootstrap.css';
import '../style/style.css';

import angular from 'angular';
import uirouter from 'angular-ui-router';

import routing from './app.config';
import home from './features/home';
import game from './features/game';

require( 'angular-bootstrap-show-errors' );

import popover from 'angular-ui-bootstrap/src/popover';

//https://angular-ui.github.io/bootstrap/
angular.module('app', [uirouter, 'ui.bootstrap.showErrors', home, game, popover])
  .config(routing);
