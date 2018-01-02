(function() {
  'use strict';

  angular.module('esn.calendar')
    .controller('miniCalendarController', miniCalendarController);

  function miniCalendarController(
    $rootScope,
    $q,
    $scope,
    $log,
    calMoment,
    CAL_UI_CONFIG,
    CAL_EVENTS,
    calendarEventSource,
    calendarService,
    miniCalendarService,
    notificationFactory,
    calendarHomeService,
    calendarCurrentView,
    calCachedEventSource,
    userAndExternalCalendars,
    calFullUiConfiguration) {

      var miniCalendarDisplay = false;
      var calendarWrapperPromise;
      var calendarDeffered = $q.defer();
      var calendarPromise = calendarDeffered.promise;
      var currentView = calendarCurrentView.get();

      $scope.miniCalendarConfig = buildCalendarConfiguration();
      $scope.events = [];
      $scope.homeCalendarViewMode = currentView.name || CAL_UI_CONFIG.calendar.defaultView;
      $scope.calendarReady = calendarDeffered.resolve.bind(calendarDeffered);
      $scope.swipeLeft = next;
      $scope.swipeRight = previous;

      calendarPromise.then(selectPeriod.bind(null, currentView.start || calMoment()));
      calendarWrapperPromise = buildCalendarWrapper();

      var unregisterFunctions = [
        $rootScope.$on(CAL_EVENTS.CALENDARS.ADD, addCalendar),
        $rootScope.$on(CAL_EVENTS.CALENDARS.REMOVE, removeCalendar),
        $rootScope.$on(CAL_EVENTS.ITEM_ADD, rerender),
        $rootScope.$on(CAL_EVENTS.ITEM_REMOVE, rerender),
        $rootScope.$on(CAL_EVENTS.ITEM_MODIFICATION, rerender),
        $rootScope.$on(CAL_EVENTS.REVERT_MODIFICATION, rerender),
        $rootScope.$on(CAL_EVENTS.CALENDAR_REFRESH, rerender),
        $rootScope.$on(CAL_EVENTS.HOME_CALENDAR_VIEW_CHANGE, function(event, view) {
          $scope.homeCalendarViewMode = view.name;
          var start = view.name === 'month' ? calMoment(view.start).add(15, 'days') : view.start;

          calendarPromise.then(selectPeriod.bind(null, start));
        }),
        $rootScope.$on(CAL_EVENTS.MINI_CALENDAR.TOGGLE, function() {
          miniCalendarDisplay = !miniCalendarDisplay;
        }),
        $rootScope.$on(CAL_EVENTS.VIEW_TRANSLATION, function(event, action) {
          if (miniCalendarDisplay) {
            (action === 'prev' ? previous : next)();
          }
        })
      ];

      $scope.$on('$destroy', function() {
        unregisterFunctions.forEach(function(unregisterFunction) {
          unregisterFunction();
        });
      });

      function buildCalendarConfiguration() {
        var calendarUiConfig = calFullUiConfiguration.configureLocaleForCalendar(CAL_UI_CONFIG);
        var configuration = angular.extend({}, calendarUiConfig.calendar, CAL_UI_CONFIG.miniCalendar);

        //this is because of a fullCalendar bug about dayClick on touch that block swipe
        //https://github.com/fullcalendar/fullcalendar/issues/3332
        configuration.longPressDelay = 0;

        configuration.dayClick = function(day) {
          calendarPromise.then(selectPeriod.bind(null, day));
          $rootScope.$broadcast(CAL_EVENTS.MINI_CALENDAR.DATE_CHANGE, day);
          $rootScope.$broadcast(CAL_EVENTS.MINI_CALENDAR.TOGGLE);
        };

        configuration.viewRender = function(view) {
          calendarCurrentView.setMiniCalendarView(view);
          $rootScope.$broadcast(CAL_EVENTS.MINI_CALENDAR.VIEW_CHANGE, view);
        };

        configuration.eventClick = function(event) {
          $rootScope.$broadcast(CAL_EVENTS.MINI_CALENDAR.DATE_CHANGE, event.start);
          $rootScope.$broadcast(CAL_EVENTS.MINI_CALENDAR.TOGGLE);
        };

        configuration.eventRender = function(event, element) {
          if (event.start.isSame(calMoment(), 'day')) {
            element.addClass('fc-event-color');
          }
        };

        return configuration;
      }

      function selectPeriod(_day, calendar) {
        var day = calMoment(_day).stripTime();

        calendar.fullCalendar('gotoDate', day);
        switch ($scope.homeCalendarViewMode) {
          case 'agendaWeek':
            var week = miniCalendarService.getWeekAroundDay($scope.miniCalendarConfig, day);

            calendar.fullCalendar('select', week.firstWeekDay, week.nextFirstWeekDay);
            break;
          case 'agendaDay':
            var nextDay = calMoment(day).add(1, 'days');

            calendar.fullCalendar('select', day, nextDay);
            break;
          case 'month':
            calendar.fullCalendar('unselect');
            break;
          case 'agendaThreeDays':
            var nextThreeDays = calMoment(day).add(3, 'days');

            calendar.fullCalendar('select', day, nextThreeDays);
            break;
          case 'basicDay':
            var nextPlanningDay = calMoment(day).add(1, 'days');

            calendar.fullCalendar('select', day, nextPlanningDay);
            break;
          default:
            throw new Error('unknown view mode : ' + $scope.homeCalendarViewMode);
        }
      }

      function rerender() {
        calendarWrapperPromise.then(function(calendarWrapper) {
          calendarWrapper.rerender();
        });
      }

      function buildCalendarWrapper() {
        return $q.all({
          calendar: calendarPromise,
          calendars: getOwnCalendars()
        }).then(function(resolved) {
          return miniCalendarService.miniCalendarWrapper(resolved.calendar, resolved.calendars);
        }, function(error) {
          notificationFactory.weakError('Could not retrive user calendars', error.message);
          $log.error('Could not retrieve user calendars', error);
        });
      }

      function getOwnCalendars() {
        return calendarHomeService.getUserCalendarHomeId()
          .then(calendarService.listPersonalAndAcceptedDelegationCalendars)
          .then(function(calendars) {
            return userAndExternalCalendars(calendars).userCalendars || [];
          });
      }

      function addCalendar(event, calendar) {
        calendarWrapperPromise.then(function(calendarWrapper) {
          calendarWrapper.addCalendar(calendar);
        });
      }

      function removeCalendar(event, calendar) {
        calendarWrapperPromise.then(function(calendarWrapper) {
          calendarWrapper.removeCalendar(calendar);
        });
      }

      function next() {
        return calendarPromise.then.bind(calendarPromise, function(cal) {
          cal.fullCalendar('next');
        });
      }

      function previous() {
        return calendarPromise.then.bind(calendarPromise, function(cal) {
          cal.fullCalendar('prev');
        });
      }
    }
})();
