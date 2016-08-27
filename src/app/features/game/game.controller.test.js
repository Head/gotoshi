import home from './index';

describe('Controller: Game', function() {
  let $controller;

  beforeEach(angular.mock.module(game));

  beforeEach(angular.mock.inject(function(_$controller_) {
    $controller = _$controller_;
  }));

  it('name is initialized to World', function() {
    let ctrl = $controller('GameController');
    expect(ctrl.name).toBe('World');
  });
});
