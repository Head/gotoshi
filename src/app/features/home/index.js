import './home.css';

import angular from 'angular';
import uirouter from 'angular-ui-router';

import routing from './home.routes';
import HomeController from './home.controller';
import greeting    from '../../directives/greeting.directive';

export default angular.module('app.home', [uirouter, greeting])
  .config(routing)
  .controller('HomeController', HomeController)
  .name;
