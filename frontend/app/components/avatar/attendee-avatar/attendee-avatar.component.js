(function() {
  'use strict';

  angular.module('esn.calendar')
    .component('calAttendeeAvatar', {
      templateUrl: '/calendar/app/components/avatar/attendee-avatar/attendee-avatar.html',
      bindings: {
        attendee: '<'
      },
      controllerAs: 'ctrl',
      controller: 'CalAttendeeAvatarController'
    });
})();
