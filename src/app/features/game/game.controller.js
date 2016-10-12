import ExampleGameControls from './example-controls';

const debug = require('debug')('gotoshi:gameController');

export default class GameController {
    constructor(game, wallet, $stateParams, $scope) {
        this.Game = game;
        this.wallet = wallet;
        this.client = {};
        this.tenuki = require('tenuki');
        this.$scope = $scope;

        /*if (data['moveNumber'] === client.moveNumber() + 1) {
         if (data['pass']) {
         client.receivePass();
         } else {
         client.receivePlay(data['y'], data['x']);
         }
         }
         if (data['phase'] === 'scoring') {
         client.setDeadStones(data['deadStones']);
         }*/

        this.optionsState = 'all';
        this.optionsValue = 'all';
        this.optionsOwner = 'all';

        this.Game.registerObserverCallback(this.gotMessage.bind(this));

        if(typeof $stateParams.pubKey !== 'undefined') {
            if(typeof this.Game.games[$stateParams.pubKey] === 'undefined') {
                this.Game.resetGame($stateParams.pubKey);
            }
            this.Game.setGame(this.Game.games[$stateParams.pubKey]);
        }
    }

    gotMessage(message) {
        debug('gotMessage', message);
        if (message.type === 'start') {
            let player = 'black';
            if (this.wallet.isOwnAddress(message.game.players.one)) player = 'white';
            this.resumeGame(player);
        } else if (message.type === 'pass') {
            this.client.receivePass();
        } else if (message.type === 'phase') {
            this.client.setDeadStones(message.deadStones);
        } else if (message.type === 'move') {
            let moves = this.Game.currentGame.moves;
            debug('got move ' + message.move.n + ' and try to do move no ' + this.client.moveNumber() + '/' + moves.length);
            for(let moveNo = this.client.moveNumber(); (typeof moves[moveNo] !== 'undefined')
                && (moveNo <= (moves.length-1))
                && (   moves[moveNo].pk === this.Game.currentGame.players.one
                    || moves[moveNo].pk === this.Game.currentGame.players.two)
                ;moveNo++) {
                debug('do move no ' + moveNo, moves[moveNo]);
                this.client._game.playAt(moves[moveNo].y, moves[moveNo].x);
            }
        }
    }

    resetGame() {
        const boardElement = document.querySelector('.tenuki-board');
        boardElement.innerHTML = '';
        this.Game.resetGame();
    }

    resumeGame(player) {
        this.setupNewBoard(player);
    }

    startNewGame(betInputAmount, player) {
        this.$scope.$broadcast('show-errors-check-validity');
        if (this.$scope.newgameForm.$valid) {
            this.Game.startNewGame(betInputAmount);
        }
    }

    filter(optionsOwner, optionsState, optionsValue) {
        this.Game.setFilter(optionsOwner, optionsState, optionsValue);
    }

    setupNewBoard(player) {
        const boardElement = document.querySelector('.tenuki-board');
        boardElement.innerHTML = '';
        this.client = new this.tenuki.Client(boardElement);
        this.client.setup({
            player: player,
            gameOptions: {
                boardSize: 9
            },
            fuzzyStonePlacement: true,
            hooks: {
                submitPlay: (playedY, playedX, result) => {
                    this.Game.sendMove({ n: this.client.moveNumber(), p: this.client.currentPlayer(), y: playedY, x: playedX }).then(function() {
                        result(true); //data[result] ???
                    }, function() {
                        result(false);
                    });
                },
                submitMarkDeadAt: (y, x, stones, result) => {
                    this.Game.sendMarkDeadAt().then(function() {
                        result(true); //data[result] ???
                    }, function() {
                        result(false);
                    });
                },
                submitPass: (result) => {
                    this.Game.sendPass().then(function() {
                        result(true); //data[result] ???
                    }, function() {
                        result(false);
                    });
                }
            }
        });

        const controlElement = document.querySelector('.controls');
        const controls = new ExampleGameControls(controlElement, this.client._game);

        this.client._game.callbacks.postRender = function() {
            controls.updateStats();
        };
    }
}

GameController.$inject = ['game', 'wallet', '$stateParams', '$scope'];
