import angular from 'angular';

function greeting() {
  return {
    restrict: 'E',
    scope: {
      name: '='
    },
    template: '<h1>Hello, {{name}}</h1><h2>welcome to</h2>'
  }
}

export default angular.module('directives.greeting', [])
  .directive('greeting', greeting)
  .name;
