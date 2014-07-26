var videoplayer = angular.module('videoplayer', ['ngRoute']);

videoplayer.directive('videoplayer', function() {
	
	return {
		restrict: 'E',
		templateUrl: './js/app/video-player/video-player.html'
		
	}	
});