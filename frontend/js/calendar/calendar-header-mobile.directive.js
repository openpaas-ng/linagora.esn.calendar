(function() {
  'use strict';

  angular.module('esn.calendar')
         .directive('calendarHeaderMobile', calendarHeaderMobile);

  function calendarHeaderMobile() {
    var directive = {
      restrict: 'E',
      templateUrl: '/calendar/views/calendar/calendar-header-mobile.html',
      replace: true
    };

    return directive;
  }

})();