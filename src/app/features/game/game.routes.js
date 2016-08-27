routes.$inject = ['$stateProvider'];

export default function routes($stateProvider) {
    $stateProvider
        .state('game', {
            url: '/game',
            abstract: true,
            template: require('./game.html'),
            controller: 'GameController',
            controllerAs: 'g'
        })
        .state('game.list', {
            url: '/list',
            template: require('./list.html'),
            controller: 'GameController',
            controllerAs: 'g'
        })
        .state('game.play', {
            url: '/play/:pubKey',
            template: require('./play.html'),
            controller: 'GameController',
            controllerAs: 'g'
        })
}