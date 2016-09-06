import home from './index';

describe('Controller: Home', function() {

    let $controller;

    beforeEach(angular.mock.module(home));

    beforeEach(angular.mock.module(function($provide) {
        $provide.service('wallet', function mockService() {
            return { getLatestAddress: function() {return 'asdf';} }
        });
    }));

    beforeEach(angular.mock.inject(function(_$controller_) {
        $controller = _$controller_;
        $scope = {};
    }));

    it('should return wallet getLatestAddress', function () {
        var homeController = $controller('HomeController', { $scope: $scope });

        expect($scope.name).toEqual('asfd');
    });
});
