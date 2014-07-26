var streamstation = angular.module("streamstation", ['ngRoute', 'firebase', 'ui.bootstrap', 'dialogs']);

streamstation.config(function($routeProvider) {

	$routeProvider
		.when('/channel/:channelId', {
			controller: 'streamController',
			templateUrl: 'views/main.html'
		})
		.when('/login', {
			controller: 'loginController',
			templateUrl: 'views/login.html'
		})
		.when('/create-channel', {
			controller: 'channelController',
			templateUrl: 'views/create-channel.html'
		})
		.when('/start', {
			controller: 'startController',
			templateUrl: 'views/startpage.html'
		})
		.when('/channels', {
			controller: 'channelController',
			templateUrl: 'views/channels.html'
		})
		.when('/none', {
			templateUrl: 'views/none.html'
		})
		
		.otherwise({ redirectTo: '/channels' });

});

streamstation.factory('PlayerModel', function() {
	var Player = function(player) {
	
		this.currentVideoKey = function() {
			return player.videoId;
		}
		
		this.action = function() {
			return player.action;
		}
		
		this.seekTime = function() {
			return player.currentTime;
		}
		
		this.actionTimestamp = function() {
			return player.timestamp;
		}
		
	
	}
	return Player;
});

streamstation.factory('VideoModel', function() {
	
	var Video = function(service, id, video, cnl) {
		
		var videoService = service.$child('videos/' + id);
		var channel = cnl;
		videoService.$on('value', function(snap) {
			
			var vid = snap.snapshot.value;
			// if removed
			if (vid == undefined || vid == null) {
				return;
			}
			_videoName = vid.name;
			_order = vid.order;
			
			cnl.update();
		});
		
		var _videoName = video.name;
		var _order = video.order;
		
		this.videoKey = function() {
			return id;
		}
	
		this.videoId = function() {
			return video.videoId;
		}
		
		this.order = function() {
			return _order;
		}
		
		this.duration = function() {
			return video.duration;
		}
		
		this.videoName = function() {
			return _videoName;
		}
		
		this.videoProvider = function() {
			return video.provider;
		}
		
		this.increaseOrder = function() {
			videoService.$update({
				'order': _order + 1
			});
		}
		
		this.decreaseOrder = function() {
			if (_order == 0) {
				return;
			}
			videoService.$update({
				'order': _order - 1
			});
		}
	}
	return Video;

});

streamstation.factory('ChannelModel', function($rootScope, authService, VideoModel, PlayerModel, $firebase) {

	var service;
	
	var Channel = function(channelId) {
		var service = $firebase(new Firebase("https://streamstation.firebaseio.com/channels/" + channelId));
		
		var alert = {
			message: '',
			class: 'bg-primary'
		}
		
		var self = this;
		var playerData = undefined;
		var youtubePlayer = undefined;
		var videos = {};
		var name = undefined;
		var owner = undefined;
		var videoThumbnail = undefined;
		var key = channelId;
		var schedule = {};
		var player = {};
		
		var loaded = false;
		var isMuted = false;
		
		var loadLocalStorage = function() {

			if (typeof(localStorage) === "undefined") {
				return;
			}
		
			if (name == undefined) {
				return;
			}
		
		
			var mutedProp = 'channels.' + name + '.muted';
			if (angular.isDefined(localStorage[mutedProp])) {
				isMuted = (localStorage[mutedProp] === 'true');
			} else {
				isMuted = false;
				localStorage.setItem(mutedProp, isMuted);
			}
			
			if (!angular.isDefined(youtubePlayer)) {
				return;
			}
			
			if (isMuted) {
				youtubePlayer.mute();
			} else {
				youtubePlayer.unMute();
			}
			
			
		}
		
		var updateVideoThumbnailUrl = function() {
			var ordered = self.orderedVideos();
			var index = _.indexBy(ordered, function(v) {
				return v.order();
			});
			
			var firstVideo = index[0];
			if (angular.isDefined(firstVideo)) {	
				var thumb = 'http://img.youtube.com/vi/' + firstVideo.videoId() + '/0.jpg'; 
				videoThumbnail = thumb;	
			}
			
		}
		
		/* Events */
		service.$child('videos').$on('child_added', function(snap) {
			var id = snap.snapshot.name;
			var video = snap.snapshot.value;
			if (id != '$id' && id != '$value' && id != undefined && id != null) {
				videos[id] = new VideoModel(service, id, video, self);
			}
		});
		
		service.$child('videos').$on('child_removed', function(snap) {
			var id = snap.snapshot.name;
			var video = snap.snapshot.value;
			if (id != '$id') {
				delete videos[id];
			}
		});
		
		/* Private functions */
		service.$on('value', function(snap) {
			
			updateVideoThumbnailUrl();
			// initialize reference
			var channel = snap.snapshot.value;
			if (channel != null) {
				// update name and owner
				name = channel.name;
				owner = channel.owner;
				//videoThumbnail = ''; //channel.videoThumbnail;
				loadLocalStorage();
				// update player
				playerData = new PlayerModel(channel.player);
			}
		});
		
		var currentVideo = undefined;
		
		var calculateSchedule = function() {
			
			var ordered = self.orderedVideos();
			var index = _.indexBy(ordered, function(v) {
				return v.order();
			});
			
			
			var tmpSchedule = {}
			if(!angular.isDefined(playerData) || !_.contains(['play', 'seekAndPlay'], playerData.action())) {
				for(var i = 0; i < _.size(index); i++) {
					tmpSchedule[i] = {
						videoName: index[i].videoName(),
						duration: ''
					}
				}
				schedule = tmpSchedule;
				return;
			}
			
			
			var currentTime = playerData.seekTime();
			var startingVideo = videos[playerData.currentVideoKey()];
			
			if (!angular.isDefined(startingVideo)) {
				return;
			}
			var currentVideo = startingVideo;
			
			tmpSchedule[currentVideo.order()] = {
				videoName: currentVideo.videoName(),
				duration: 'Now Playing'
			};
			var timeDiff = (new Date() - new Date(playerData.actionTimestamp())) / 1000.0;
			//console.log('timeDifference: ' + timeDiff);
			currentTime += 2 + timeDiff; // two seconds to compensate for delay;
			while(currentTime > currentVideo.duration()) {
				currentTime -= currentVideo.duration() - 2; // two seconds to compensate for delay;
				//console.log('new startTime: ' + startTime);
				if (currentVideo.order() >= ordered.length - 1) {
					currentVideo = index[0];
				} else {
					currentVideo = index[currentVideo.order() + 1];
				}
			}
			
			var totalDuration =  currentVideo.duration();
			var currentIndex = currentVideo.order();
			var prevDuration =  -currentTime;
			var size = _.size(index);
			
			
			for(var i = currentIndex + 1; i % size != currentIndex ; i++) {
				var j = i % size;
				var v = index[j];
				
				// if currently switching
				if (!angular.isDefined(v)) {
					continue;
				}
				var duration = totalDuration + 2 + prevDuration;

				tmpSchedule[i] = {
					videoName: v.videoName(),
					duration: moment().add('seconds', totalDuration + 2 + prevDuration).format('hh:mm - d/MM/YYYY')
				};
				totalDuration = v.duration();
				prevDuration = duration;	
			}
			
			if( JSON.stringify(schedule) !== JSON.stringify(tmpSchedule) ) {
				schedule = tmpSchedule;
			}
		}
		
		
		/* Public functions */
		
		this.update = function() {
			calculateSchedule();
		}
		
		this.channelVideoThumbnail = function() {
			return videoThumbnail;
		}
		
		this.channelImage = function() {
			return videoThumbnail;
		}
		
		this.channelId = function() {
			return channelId;
		};
		
		this.getVideo = function(key) {
			return videos[key];
		}
		
		this.channelKey = function() {
			return key;
		}
		
		this.currentVideoTime = function() {
			if (!angular.isDefined(youtubePlayer)) {
				return undefined;
			} else {
				return youtubePlayer.getCurrentTime();
			}
		}
		
		this.currentVideoDuration = function() {
			if (angular.isDefined(currentVideo)) {
				return currentVideo.duration();
			} else {
				return undefined;
			}
		}
		
		this.currentVideoKey = function() {
			if (angular.isDefined(currentVideo)) {
				return currentVideo.videoKey();
			} else {
				return '';
			}
		}
		
		this.currentVideoName = function() {
			if (angular.isDefined(currentVideo)) {
				return currentVideo.videoName();
			} else {
				return '';
			}
		}
		
		this.channelMuted = function() {
			return isMuted;
		}
		
		this.toggleMute = function() {
			if (!self.isReady()) {
				return;
			}
		
			if (isMuted) {
				youtubePlayer.unMute();
				isMuted = false;
			} else {
				youtubePlayer.mute();
				isMuted = true;
			}
			if (typeof(localStorage) !== "undefined") {
				localStorage.setItem('channels.' + name + '.muted', isMuted);
			}
			//console.log(localStorage);
			//storage.setItem('muted', isMuted);
		}
		
		this.getSchedule = function() {
			return schedule;
		}
		
		this.videos = function() {
			return videos;
		}
		
		this.owner = function() {
			return owner;
		}
		
		this.channelName = function() {
			return name;
		}
		
		this.setAlert = function(msg) {
			alert = msg;
		}
		
		this.getAlert = function() {
			return alert;
		}
		
		this.clearAlert = function() {
			alert = undefined;
		}
		
		this.addVideo = function(videoId, videoName, videoDuration, videoProvider) {
			return service.$child('videos').$add({
				'name': videoName,
				'videoId': videoId,
				'provider': videoProvider,
				'duration': videoDuration,
				'order': Object.keys(videos).length
			});
		}
		
		this.isAdmin = function() {
			var currentUser = authService.getCurrentUser();
			return currentUser != null && currentUser.email == owner;
		}
		
		this.isReady = function() {
			return angular.isDefined(youtubePlayer);
		}
		
		this.setYoutubePlayer = function(ytplayer) {
			youtubePlayer = ytplayer;
			service.$child('player').$off('value');
			service.$child('player').$on('value', function(snap) {
				var res = snap.snapshot.value;
				var oldVideo = '';
				if(angular.isDefined(currentVideo)) {
					oldVideo = currentVideo.videoKey();
				}
				
				playerData = new PlayerModel(res);
				
				var ordered = self.orderedVideos();
				var index = _.indexBy(ordered, function(v) {
					return v.order();
				});
				
				var startTime = playerData.seekTime();
				currentVideo = videos[playerData.currentVideoKey()];
				
				//console.log(currentVideo);
				//console.log('seekTime: ' + startTime);
				
				if(_.contains(['play', 'seekAndPlay'], playerData.action())) {
					var timeDiff = (new Date() - new Date(playerData.actionTimestamp())) / 1000.0;
					//console.log('timeDifference: ' + timeDiff);
					startTime += 2 + timeDiff; // two seconds to compensate for delay;
					//console.log('startTime: ' + startTime);
					
					while(startTime > currentVideo.duration()) {
						startTime -= currentVideo.duration() - 2; // two seconds to compensate for delay;
						//console.log('new startTime: ' + startTime);
						if (currentVideo.order() >= ordered.length - 1) {
							currentVideo = index[0];
						} else {
							currentVideo = index[currentVideo.order() + 1];
						}
						
					}
				}
				
				if(!loaded || oldVideo != playerData.currentVideoKey()) {
					youtubePlayer.loadVideoById({
						'videoId': currentVideo.videoId(), 
						startSeconds: startTime
					});
					loaded = true;
				} 
				console.log(startTime);
				switch(playerData.action()) {
					case 'seekAndPlay':
						youtubePlayer.seekTo(startTime);
						youtubePlayer.playVideo();
						self.setAlert({message: 'is broadcasting', class: 'bg-primary'});
					case 'play':
						youtubePlayer.playVideo();
						console.log('should play');
						self.setAlert({message: 'is broadcasting', class: 'bg-primary'});
						break;
					case 'pause':
						youtubePlayer.pauseVideo();
						//youtubePlayer.seekTo(startTime);
						self.setAlert({message: 'has paused broadcasting', class: 'bg-info'});
						break;
					case 'stop':		
						youtubePlayer.pauseVideo();
						youtubePlayer.seekTo(0.00);
						self.setAlert({message: 'has stopped broadcasting', class: 'bg-danger'});
						break;
				}
				calculateSchedule();
				if (isMuted) {
					youtubePlayer.mute(); 
				} else {
					youtubePlayer.unMute();
				}
			});	
			
			onytplayerStateChange = function (newState) {
				if(newState == 0) {
					self.nextVideo();
				}
			}
			youtubePlayer.addEventListener("onStateChange", "onytplayerStateChange");
		}
		
		this.nextVideo = function() {
			var ordered = self.orderedVideos();
			var index = _.indexBy(ordered, function(item) {
				return item.order();
			});
			
			var key = currentVideo.videoKey();
			var order = videos[key].order();
			
			var nextVideo = index[0];
			if(order < ordered.length - 1) {
				nextVideo = index[order + 1];
			}
			
			if (self.isAdmin()) {
				console.log('changing video');
				self.changeVideo(nextVideo.videoKey());
			} else {
				youtubePlayer.loadVideoById({
					'videoId': nextVideo.videoId(), 
					startSeconds: 0.00
				});
				currentVideo = nextVideo;
				$rootScope.$apply();
			}
		}
		
		this.prevVideo = function() {
			var ordered = self.orderedVideos();
			var index = _.indexBy(ordered, function(item) {
				return item.order();
			});
			
			var key = currentVideo.videoKey();
			var order = videos[key].order();
			
			var nextVideo = index[ordered.length - 1];
			if(order != 0) {
				nextVideo = index[order - 1];
			}
			
			if (self.isAdmin()) {
				console.log('changing video');
				self.changeVideo(nextVideo.videoKey());
			} else {
				youtubePlayer.loadVideoById({
					'videoId': nextVideo.videoId(), 
					startSeconds: 0.00
				});
				currentVideo = nextVideo;
				$rootScope.$apply();
			}
		}
		
		this.removeVideo = function(key) {
			if (!self.isAdmin()) {
				return;
			}
			
			var ordered = self.orderedVideos();
			
			var video = videos[key];
			var order = video.order();
			
			if (_.size(videos) == 1) {
				self.stop();
			} else if (currentVideo.videoKey() == key) {
				self.nextVideo();
			}
			
			for(var i = order + 1; i < _.size(videos); i++) {
				var tmp = ordered[i];
				tmp.decreaseOrder();
			}
			
			service.$child('videos/' + key).$remove();
			
			
		}
		
		this.changeVideoName = function(key, name) {
			service.$child('videos/' + key).$update({
				'name': name
			});
		}
		
		this.promoteVideo = function(key) {
			if (!self.isAdmin()) {
				return;
			}
			var ordered = self.orderedVideos();
			var index = _.indexBy(ordered, function(item) {
				return item.order();
			});
			var order = videos[key].order();
			var swapIndex = order - 1;
			if (!(swapIndex in index)) {
				console.log(swapIndex + ' not in index');
				return;
			}
			
			var swapKey = index[swapIndex].videoKey();
			var swapOrder = videos[swapKey].order();
			
			service.$child('videos').$transaction(function(videos) {
				videos[key].order = swapOrder;
				videos[swapKey].order = order;
				return videos;
			}).then(function(snapshot) {
				if (!snapshot) {
					console.log('aborted');
				} else {
				}
			}, function(err) {
				console.log(error);
			});
			
		}
		
		this.demoteVideo = function(key) {
		
			if (!self.isAdmin()) {
				return;
			}
			var ordered = self.orderedVideos();
			var index = _.indexBy(ordered, function(item) {
				return item.order();
			});
			
			var order = videos[key].order();
			var swapKey = index[order + 1].videoKey();
			var swapOrder = videos[swapKey].order();

			service.$child('videos').$transaction(function(videos) {
				videos[key].order = swapOrder;
				videos[swapKey].order = order;
				return videos;
			}).then(function(snapshot) {
				if (!snapshot) {
					console.log('aborted');
				} else {
				}
			}, function(err) {
				console.log(error);
			});
			
			
		}
		
		this.orderedVideos = function() {
			return _.sortBy(videos, function(vid) {
				return vid.order();
			});
			
		}
		
		this.seekToPortion = function(portion) {
			if(youtubePlayer == undefined || !self.isAdmin()) {
				return;
			}
			// console.log(self.currentVideoDuration() * portion);
			service.$child('player').$update({
				action: 'play',
				currentTime: self.currentVideoDuration() * portion,
				action: 'seekAndPlay',
				timestamp: new Date()
			});
			
		}
		
		this.play = function() {
			if(youtubePlayer == undefined || !self.isAdmin()) {
				return;
			}
			service.$child('player').$update({
				action: 'play',
				currentTime: youtubePlayer.getCurrentTime(),
				videoId: self.currentVideoKey(),
				timestamp: new Date()
			});
			
		}
		
		this.pause = function() {
			if(youtubePlayer == undefined || !self.isAdmin()) {
				return;
			}
			service.$child('player').$update({
				action: 'pause',
				currentTime: youtubePlayer.getCurrentTime(),
				videoId: self.currentVideoKey(),
				timestamp: new Date()
			});
		}
		
		this.stop = function() {
			if(youtubePlayer == undefined || !self.isAdmin()) {
				return;
			}
			service.$child('player').$update({
				action: 'stop',
				currentTime: 0.00,
				videoId: self.currentVideoKey(),
				timestamp: new Date()
			});
		}
		
		this.changeVideo = function(vId) {
			if(youtubePlayer == undefined || !self.isAdmin()) {
				return;
			}
			service.$child('player').$update({
				action: 'seekAndPlay',
				currentTime: 0.00,
				timestamp: new Date(),
				videoId: vId
			});
		}
		
		this.unload = function() {
			loaded = false;
		}
	}
	
	return Channel;

});

streamstation.factory('youtubeDataApi', function($http) {

	var service = {};
	service.getVideoData = function(videoId) {
		return $http.get('http://gdata.youtube.com/feeds/api/videos/' + videoId + '?v=2&alt=jsonc');
	}
	return service;

});
	

streamstation.controller('headerController', function($scope, authService, $dialogs) {
	
	$scope.model = {
		loggedIn: false
	}
	
	authService.init().then(function(user) {
		$scope.baseModel.ready = true;
	});
	
	$scope.isLoggedIn = function() {
		return authService.isLoggedIn();
	}
	
	$scope.isAnonymous = function() {
		return authService.isAnonymous();
	}
	
	$scope.showLoginBox = function() {
		dlg = $dialogs.create('views/login.html', 'loginController', {}, {key: false, back: 'static'});
	}
	
	$scope.showRegisterBox = function() {
		dlg = $dialogs.create('views/register.html', 'loginController', {}, {key: false, back: 'static'});
	}


	$scope.createChannel = function() {
		dlg = $dialogs.create('views/create-channel.html', 'createChannelController', {}, {key: false, back: 'static'});
	}
	
	$scope.logout = function() {
		authService.logout();
	}

	
});

streamstation.factory('authService', function($rootScope, $q, $firebase, $firebaseSimpleLogin) {

	var currentUser = null;
	var auth = new $firebaseSimpleLogin(new Firebase('https://streamstation.firebaseio.com'));
	
	var service = {};
	service.init = function() {
		var deferred = $q.defer();
		auth.$getCurrentUser().then(function(user) {
			currentUser = user;
			deferred.resolve(user);
		});
		return deferred.promise;
	}
	
	service.login = function(email, password) {
		
		if (service.isLoggedIn()) {
			service.logout();
		}
		
		var deferred = $q.defer();
		auth.$login('password', {
			email: email, 
			password: password, 
			rememberMe: false
		}).then(function(user) {
			if (user != null && user != undefined) {
				currentUser = user;
				deferred.resolve(user);
			} else {
				deferred.reject({code: 'Incorrect username / password'});
			}
		}, function(error) {
			currentUser = null;
			deferred.reject(error);
		});
	
		return deferred.promise;
	}
	
	service.anonymLogin = function() {
		var deferred = $q.defer();
		auth.$login('anonymous', {
			rememberMe: false
		}).then(function(user) {
			if (user != null && user != undefined) {
				currentUser = user;
				
				deferred.resolve(user);
			} else {
				deferred.reject({code: 'Incorrect username / password'});
			}
		}, function(error) {
			currentUser = null;
			deferred.reject(error);
		});
		return deferred.promise;
	}
	
	service.getCurrentUser = function() {
		return currentUser;
	}
	
	service.isLoggedIn = function() {
		return currentUser != null;
	}
	
	service.isAnonymous = function() {
		return currentUser != null && currentUser.provider == 'anonymous';
	}
	
	service.isEmailAuthorized = function() {
		return currentUser != null && currentUser.provider == 'password';
	}
		
	service.logout = function() {
		auth.$logout();
		currentUser = null;
	}
	
	return service;
});

streamstation.controller('baseController', function($scope) {
	$scope.baseModel = {
		class: 'homepage',
		ready: false
	}
	
	$scope.cancel = function() {
		alert('asd');
		//$modalInstance.dismiss('canceled'); 
	}
});

streamstation.controller('startController', function($scope) {
	$scope.baseModel.class = 'homepage';
});


streamstation.factory('channelService', function($firebase, $q, $rootScope, authService, ChannelModel) {
	/* Init variables */
	var userData = $firebase(new Firebase("https://streamstation.firebaseio.com/channels"));
	var model = {
		channels: {}
	}
	
	/* Set up events */
	userData.$on('child_added', function(snap) {
		var name = snap.snapshot.name;
		if (!angular.isDefined(model.channels[snap.snapshot.name])) {
			model.channels[snap.snapshot.name] = new ChannelModel(snap.snapshot.name);
		}
	});
	
	userData.$on('child_removed', function(snap) {
		var name = snap.snapshot.name;
		if (angular.isDefined(model.channels[name])) {
			var channel = model.channels[name];
			channel.stop();
			delete model.channels[name];
			
		}
	});
	
	var service = {};
	service.getChannel = function(channelId) {
		var deferred = $q.defer();
		if (angular.isDefined(model.channels[channelId])) {
			deferred.resolve(model.channels[channelId]);
		} else {
			userData.$child(channelId).$on('value', function(snap) {
				if ( ! angular.isDefined(model.channels[snap.snapshot.name] ) ) {
					model.channels[snap.snapshot.name] = new ChannelModel(snap.snapshot.name);
				}
				deferred.resolve(model.channels[channelId]);
			}, 
			function() {
				console.log('Channel does not exist');
				deferred.reject('Channel does not exist');
			});
		}
		
		return deferred.promise;
		
	}
	
	service.getChannels = function() {
		return model.channels;
	}
	
	service.createChannel = function(channelName) {
		if (!authService.isLoggedIn() || authService.isAnonymous()) {
			return null;
		}
		var user = authService.getCurrentUser();
		return userData.$add({
			name: channelName, 
			owner: user.email,
			player: {},
			videos: []
		});
	}
	
	service.remove = function(channelKey) {
		if(model.channels[channelKey].isAdmin()) {
			userData.$remove(channelKey);
			return true;
		} 
		return false
	}
	
	service.renameChannel = function(key, name) {
		userData.$child(key).$update({
			name: name
		});
	}
	
	return service;
});


streamstation.controller('streamController', function($scope, $document, $routeParams, $interval, channelService, authService, youtubeDataApi) {

	$scope.baseModel.ready = false;
	$scope.nameInputEnabled = false;
	
	authService.init().then(function(user) {
		$scope.baseModel.ready = true;
	});

	$scope.baseModel.class = 'player-class';
	$scope.model = {
		addVideoId: undefined,
		addVideoUrl: undefined,
		addVideoName: undefined,
		addVideoDuration: 0.00,
		channel: undefined,
		videoOnRepeat: undefined,
		timetrackStyle: {
			width: 0
		},
		videoEdits: []
	}
	
	var timetrackPromise = $interval(function() {
		if(angular.isDefined($scope.model.channel)) {
			var elapsed = $scope.model.channel.currentVideoTime();
			var duration = $scope.model.channel.currentVideoDuration();
			$scope.model.timetrackStyle['width'] = 100 * (elapsed / duration) + '%';
			//$scope.$apply();
		}
	}, 1000);
	
	var channelId = $routeParams['channelId'];
	var player = undefined;
		
	onYouTubePlayerReady = function(id) {
		if (player != undefined) {
			return;
		}
		player = $document[0].getElementById(id);
		channelService.getChannel(channelId).then(function(channel) {
			channel.setYoutubePlayer(player);
		});
		
	}
	
	function getVideoIdFromUrl(url) {
		name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
		var regex = new RegExp("[\\?&]v=([^&#]*)");
		var results = regex.exec(url);
		return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
	}

	$scope.isOnRepeat = function(key) {
		return $scope.model.videoOnRepeat == key;
	}
	
	$scope.toggleRepeatVideo = function(key) {
		if ($scope.model.videoOnRepeat != key) {
			$scope.model.videoOnRepeat = key;
		} else {
			$scope.model.videoOnRepeat = undefined;
		}
	}
	
	$scope.isMuted = function() {
		if(angular.isDefined($scope.model.channel)) {
			return $scope.model.channel.channelMuted();
		} else {
			return false;
		}
	}
	
	$scope.seekToPortion = function(portion) {
		if(angular.isDefined($scope.model.channel)) {
			return $scope.model.channel.seekToPortion(portion);
		} else {
			return;
		}
	}
	
	$scope.getSchedule = function() {
		if(angular.isDefined($scope.model.channel)) {
			return $scope.model.channel.getSchedule();
		} else {
			return {none: 'none'};
		}
	}
	
	$scope.parseVideoUrl = function(url) {
		videoId = getVideoIdFromUrl($scope.model.addVideoUrl); //'BfOdWSiyWoc';
		youtubeDataApi.getVideoData(videoId).success(function(data) {
			var object = data.data;
			if (angular.isDefined(object.id)) {
				$scope.model.addVideoId = object.id;
				$scope.model.addVideoName = object.title;
				$scope.model.addVideoDuration = object.duration;
				$scope.nameInputEnabled = true;
			} else {
				$scope.nameInputEnabled = false;
			}
		}).error(function(data) {
			$scope.nameInputEnabled = false;
		});
	}
	
	$scope.currentVideoKey = function() {
		if(angular.isDefined($scope.model.channel)) {
			return $scope.model.channel.currentVideoKey();
		} else {
			return '';
		}
	}
	
	$scope.addVideo = function() {
	
		if($scope.model.addVideoUrl == undefined || $scope.model.addVideoName == undefined || $scope.model.addVideoId == undefined) {
			return;
		}
	
		channelService.getChannel(channelId).then(function(channel) {
			channel.addVideo($scope.model.addVideoId, $scope.model.addVideoName, $scope.model.addVideoDuration, 'youtube');
			$scope.model.addVideoUrl = undefined;
			$scope.model.addVideoId = undefined;
			$scope.model.addVideoName = undefined;	
			$scope.model.addVideoDuration = 0.00;
			$scope.nameInputEnabled = false;
		}, function(error) {
			$scope.nameInputEnabled = false;
			console.log(error);
		});
	}
	
	
	
	$scope.changeVideo = function(videoId) {
		if(angular.isDefined($scope.model.channel)) {
			return $scope.model.channel.changeVideo(videoId);
		} 
	}
	
	channelService.getChannel(channelId).then(function(channel) {
		$scope.model.channel = channel;
	});
	
	$scope.videos = function() {
		if(angular.isDefined($scope.model.channel)) {
			return $scope.model.channel.orderedVideos();			
		} else {
			return {};
		}
	}
	
	$scope.changeName = function(key) {
		if (key in $scope.model.videoEdits) {
			var name = $scope.model.videoEdits[key];
			$scope.model.channel.changeVideoName(key, name);
			delete $scope.model.videoEdits[key];
		}
	}
	
	$scope.inEdit = function(key) {
		return key in $scope.model.videoEdits;
	}
	
	$scope.toggleRenameVideo = function(key) {
		if (key in $scope.model.videoEdits) {
			delete $scope.model.videoEdits[key];
		} else {
			var video = $scope.model.channel.getVideo(key);
			$scope.model.videoEdits[key] = video.videoName();
		}
	}
	
	$scope.removeVideo = function(key) {
		$scope.model.channel.removeVideo(key);
	}
	
	$scope.promoteVideo = function(key) {
		$scope.model.channel.promoteVideo(key);
	}
	
	$scope.demoteVideo = function(key) {
		$scope.model.channel.demoteVideo(key);
	}
	
	$scope.channelReady = function() {
		return angular.isDefined($scope.model.channel) && $scope.model.channel.isReady();
	}
	
	$scope.isAdmin = function() {
		return angular.isDefined($scope.model.channel) && $scope.model.channel.isAdmin();
	}
	
	$scope.owner = function() {
		if (angular.isDefined($scope.model.channel)) {
			return $scope.model.channel.owner();
		} else {
			return '';
		}		
	}
	
	$scope.channelName = function() {
		if (angular.isDefined($scope.model.channel)) {
			return $scope.model.channel.channelName();
		} else {
			return '';
		}		
	}
	
	$scope.videoName = function() {
		if (angular.isDefined($scope.model.channel)) {
			return $scope.model.channel.currentVideoName();
		} else {
			return '';
		}		
	}
	
	$scope.toggleMute = function() {
		if (angular.isDefined($scope.model.channel)) {
			$scope.model.channel.toggleMute();
		}
	}
	
	$scope.play = function() {
		if (angular.isDefined($scope.model.channel) && $scope.model.channel.isReady()) {
			$scope.model.channel.play();
		} else {
			alert('channel is not ready');
		}		
	}
	
	$scope.pause = function() {
		if (angular.isDefined($scope.model.channel) && $scope.model.channel.isReady()) {
			$scope.model.channel.pause();
		} else {
			alert('channel is not ready');
		}		
	}
	
	$scope.stop = function() {
		if (angular.isDefined($scope.model.channel) && $scope.model.channel.isReady()) {
			$scope.model.channel.stop();
		} else {
			alert('channel is not ready');
		}		
	}
	
	$scope.next = function() {
		if (angular.isDefined($scope.model.channel) && $scope.model.channel.isReady()) {
			$scope.model.channel.nextVideo();
		} else {
			alert('channel is not ready');
		}		
	}
	
	$scope.prev = function() {
		if (angular.isDefined($scope.model.channel) && $scope.model.channel.isReady()) {
			$scope.model.channel.prevVideo();
		} else {
			alert('channel is not ready');
		}		
	}

	$scope.$on('$destroy',function(){
		if(angular.isDefined($scope.model.channel)) {
			$scope.model.channel.unload();
			$interval.cancel(timetrackPromise);
		}
	});
	
	$scope.channelAlert = function() {
		if (angular.isDefined($scope.model.channel)) {
			return $scope.model.channel.getAlert();
		} else {
			return '';
		}
	
	}
	
	
});

streamstation.directive('ngEnter', function () {
    return function (scope, element, attrs) {
        element.bind("keydown keypress", function (event) {
            if(event.which === 13) {
                scope.$apply(function (){
                    scope.$eval(attrs.ngEnter);
                });

                event.preventDefault();
            }
        });
    };
});

streamstation.directive('ngEsc', function () {
    return function (scope, element, attrs) {
        element.bind("keydown keypress", function (event) {
            if(event.which === 27) {
                scope.$apply(function (){
                    scope.$eval(attrs.ngEnter);
                });

                event.preventDefault();
            }
        });
    };
});

//
streamstation.controller('createChannelController', function($scope, $location, $modalInstance, authService, channelService) {

	$scope.model = {
		newChannelName: '',
		isLoggedIn: false,
		categories: [
			{'id': 1, 'name': 'Music', 'assignable': true},
			{'id': 2, 'name': 'Bitches', 'assignable': true},
			{'id': 3, 'name': 'Funny guyz', 'assignable': true},
			{'id': 4, 'name': 'Self improvement n shit', 'assignable': true}
		],
		preselected: {
			categories: []
		},
		selectedItems : []
	}
	
	authService.init().then(function(user) {
		$scope.model.isLoggedIn = authService.isLoggedIn;
	});
	
	$scope.dismissDialog = function() {
		$modalInstance.dismiss('cancel');
	}
	
	$scope.createChannel = function() {
		channelService.createChannel($scope.model.newChannelName)
		.then(function(channel) {
			$modalInstance.dismiss('cancel');
			$location.path('/channel/' + channel.name());
		}, function(error) {
			alert('Could not create channel');
		});
		
		
		
	}

	
});

streamstation.controller('channelController', function($scope, channelService, authService) {
	
	$scope.model = {
		channelEdits: [],
		nameFilter: ''
	}
	
	if (angular.isDefined($scope.baseModel)) {
		$scope.baseModel.class = '';
	}
	authService.init().then(function(user) {
		if (angular.isDefined($scope.baseModel)) {
			$scope.baseModel.ready = true;
		}
		$scope.isLoggedIn = authService.isLoggedIn;
	});
	
	$scope.isAnonymous = function() {
		authService.isAnonymous;
	}
	
	$scope.channels = function() {
		return channelService.getChannels();
	}
	
	$scope.dismissDialog = function() {
		//$modalInstance.dismiss('close');
	}
	
	$scope.removeChannel = function(channelKey) {
		channelService.remove(channelKey);
		
	}

	$scope.renameChannel = function(key) {
		channelService.renameChannel(key, $scope.model.channelEdits[key]);
		delete $scope.model.channelEdits[key];
	}
	
	$scope.inEdit = function(key) {
		return key in $scope.model.channelEdits;
	}
	
	$scope.toggleRenameChannel = function(key) {
		if (key in $scope.model.channelEdits) {
			delete $scope.model.channelEdits[key];
		} else {
			channelService.getChannel(key).then(function(channel) {
				$scope.model.channelEdits[key] = channel.channelName();
			});
		}
	}
	
	$scope.channelFilter = function(channel) {
		console.log('asd');
		return (channel.channelName().indexOf($scope.model.nameFilter) > -1);
	}
	
});


streamstation.controller('loginController', function($scope, authService, $location, $modalInstance) {
	
	//$scope.baseModel.ready = false;
	$scope.showLoginBox = false;
	$scope.showRegisterBox = false;
	
	authService.init().then(function(user) {
		if (user != null) {
//			$location.url('/');
		} else {
			//$scope.baseModel.ready = true;
		}
	});
		
	//$scope.baseModel.class = 'login-class';
	
	$scope.model = {
		email: '',
		password: '',
		error: undefined,
		loggingIn: false
	};
	
	$scope.isLoggedIn = function() {
		return authService.isLoggedIn();
	}
	
	$scope.isAnonymous = function() {
		return authService.isAnonymous();
	}
	
	$scope.hasErrors = function() {
		return $scope.model.error != undefined;
	}
	
	$scope.cancel = function() {
		$modalInstance.dismiss('canceled'); 
	}
	
	$scope.anonymLogin = function() {
		$scope.model.loggingIn = true;
		authService.anonymLogin()
		.then(function(user) {
			console.log(user);
			$scope.model.error = undefined;
			$modalInstance.dismiss('canceled');
			$scope.model.loggingIn = false;
		}, function(error) {
			$scope.model.error = error;
			$scope.model.loggingIn = false;
		});
		
	}
	
	$scope.login = function() {
		$scope.model.loggingIn = true;
		authService.login($scope.model.email, $scope.model.password)
		.then(function(user) {
			$scope.model.error = undefined;
			$modalInstance.dismiss('canceled'); 		
			$scope.model.loggingIn = false;
		}, function(error) {
			$scope.model.error = error;
			$scope.model.loggingIn = false;
		});
		
	}
	
});

streamstation.directive('videoTimetrack', function() {
	return {
		restrict: 'E',
		template: '<div class="js-video-timetrack"><div class="js-video-timetrack-current" ng-style="model.timetrackStyle"></div></div>',
		link: function(scope, elem, attrs, parentController) {
			elem.bind('click', function(e) {
				var width = $('.js-video-timetrack').width();
				scope.seekToPortion(e.offsetX  / width);
			});
		}
		
	}

});

streamstation.directive('multiselect', function(){
   return {
       restrict: 'E',
       scope:{           
            model: '=',
            options: '=',
            pre_selected: '=preSelected'
       },
       template: "<div class='col-md-12 btn-group' ng-class='isOpen' style='padding: 0'>"+
                "<button style='text-align: left' class='col-md-12 btn btn-default dropdown-toggle' >" + 
				"	Categories " + 
				" 	<span class='caret'></span>" + 
				"</button>" +
                "<ul class='dropdown-menu' aria-labelledby='dropdownMenu'>" + 
                    "<li data-ng-repeat='option in options'> <a data-ng-click='setSelectedItem()'>" + 
						"{{option.name}}<span data-ng-class='isChecked(option.id)'></span></a>" +
					"</li>" +                                        
                "</ul>" +
            "</div>" ,
       controller: function($scope){
           
           $scope.openDropdown = function(){  
				
				$scope.selected_items = [];
				for(var i=0; i<$scope.pre_selected.length; i++){                        
					$scope.selected_items.push($scope.pre_selected[i].id);
				}                                        
            };
           
            $scope.selectAll = function () {
                $scope.model = _.pluck($scope.options, 'id');
            };            
            $scope.deselectAll = function() {
                $scope.model=[];
            };
            $scope.setSelectedItem = function(){
                var id = this.option.id;
                if (_.contains($scope.model, id)) {
                    $scope.model = _.without($scope.model, id);
                } else {
                    $scope.model.push(id);
                }
                
                return false;
            };
            $scope.isChecked = function (id) {                 
                if (_.contains($scope.model, id)) {
                    return 'glyphicon glyphicon-ok pull-right';
                }
                return false;
            };                                 
       }
   } 
});
