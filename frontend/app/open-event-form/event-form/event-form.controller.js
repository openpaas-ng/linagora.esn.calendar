(function() {
  'use strict';

  angular.module('esn.calendar')
    .controller('CalEventFormController', CalEventFormController);

  function CalEventFormController(
    $alert,
    $scope,
    $state,
    $log,
    _,
    calendarService,
    userUtils,
    calEventService,
    calAttendeeService,
    calEventUtils,
    notificationFactory,
    calOpenEventForm,
    calUIAuthorizationService,
    calAttendeesDenormalizerService,
    session,
    calPathBuilder,
    esnI18nService,
    calMoment,
    CAL_ATTENDEE_OBJECT_TYPE,
    CAL_EVENTS,
    CAL_EVENT_FORM,
    CAL_ICAL) {

      $scope.restActive = false;
      $scope.CAL_EVENT_FORM = CAL_EVENT_FORM;
      $scope.CAL_ATTENDEE_OBJECT_TYPE = CAL_ATTENDEE_OBJECT_TYPE;
      $scope.initFormData = initFormData;
      $scope.changeParticipation = changeParticipation;
      $scope.modifyEvent = modifyEvent;
      $scope.deleteEvent = deleteEvent;
      $scope.createEvent = createEvent;
      $scope.isNew = calEventUtils.isNew;
      $scope.isInvolvedInATask = calEventUtils.isInvolvedInATask;
      $scope.updateAlarm = updateAlarm;
      $scope.submit = submit;
      $scope.canPerformCall = canPerformCall;
      $scope.goToCalendar = goToCalendar;

      // Initialize the scope of the form. It creates a scope.editedEvent which allows us to
      // rollback to scope.event in case of a Cancel.
      $scope.initFormData();

      ////////////

      function displayCalMailToAttendeesButton() {
        function organizerIsNotTheOnlyAttendeeInEvent() {
          return _.some($scope.editedEvent.attendees, function(attendee) {
            return attendee.cutype === CAL_ICAL.cutype.individual && $scope.editedEvent.organizer && $scope.editedEvent.organizer.email !== attendee.email;
          });
        }

        if ($scope.calendar && $scope.calendar.readOnly) {
          return calEventUtils.hasAttendees($scope.editedEvent) &&
          !calEventUtils.isInvolvedInATask($scope.editedEvent) &&
          !calEventUtils.isNew($scope.editedEvent) &&
          !$scope.calendar.readOnly &&
          organizerIsNotTheOnlyAttendeeInEvent();
        }

        return calEventUtils.hasAttendees($scope.editedEvent) &&
        !calEventUtils.isInvolvedInATask($scope.editedEvent) &&
        !calEventUtils.isNew($scope.editedEvent) &&
        organizerIsNotTheOnlyAttendeeInEvent();
      }

      function _displayError(err) {
        $alert({
          content: err.message || err.statusText,
          type: 'danger',
          show: true,
          position: 'bottom',
          container: '.event-create-error-message',
          duration: '2',
          animation: 'am-flip-x'
        });
      }

      function _hideModal() {
        if ($scope.$hide) {
          $scope.$hide();
        }
      }

      function _displayNotification(notificationFactoryFunction, title, content) {
        notificationFactoryFunction(title, content);
      }

      function initFormData() {
        $scope.editedEvent = $scope.event.clone();
        $scope.newAttendees = calEventUtils.getNewAttendees();
        $scope.newResources = [];
        $scope.isOrganizer = calEventUtils.isOrganizer($scope.editedEvent);

        calendarService.listPersonalAndAcceptedDelegationCalendars($scope.calendarHomeId)
          .then(function(calendars) {
            $scope.calendars = calendars;
            $scope.calendar = calEventUtils.isNew($scope.editedEvent) ? _.find(calendars, 'selected') : _.find(calendars, function(calendar) {
              if (calendar.isSubscription()) {
                return calendar.source.id === $scope.editedEvent.calendarId;
              }

              return calendar.id === $scope.editedEvent.calendarId;
            });
          })
          .then(function() {
            $scope.attendees = calAttendeeService.splitAttendeesFromType($scope.editedEvent.attendees);
            $scope.userAsAttendee = calAttendeeService.getAttendeeForUser($scope.editedEvent.attendees, session.user);

            if (!$scope.editedEvent.class) {
              $scope.editedEvent.class = CAL_EVENT_FORM.class.default;
            }

            $scope.canModifyEvent = _canModifyEvent();
            $scope.displayParticipationButton = displayParticipationButton();
            $scope.displayCalMailToAttendeesButton = displayCalMailToAttendeesButton;
            $scope.canModifyEventAttendees = calUIAuthorizationService.canModifyEventAttendees($scope.editedEvent);
            $scope.canModifyEventRecurrence = calUIAuthorizationService.canModifyEventRecurrence($scope.calendar, $scope.editedEvent, session.user._id);
          });
      }

      function setOrganizer() {
        return $scope.calendar.getOwner()
          .then(function(owner) {
            $scope.editedEvent.organizer = { displayName: userUtils.displayNameOf(owner), emails: owner.emails };
            $scope.editedEvent.attendees.push($scope.editedEvent.organizer);
            $scope.editedEvent.setOrganizerPartStat();

            return owner;
          }).catch(function() {
            // Here getOwner() work only with user. Need to defined a behaviors for resources
            // By this catch we allow event creation
            return;
          });
      }

      function processAttendees() {
        var attendees = angular.copy($scope.editedEvent.attendees);

        return calAttendeesDenormalizerService($scope.editedEvent.attendees)
          .then(function(denormalized) {
            $scope.editedEvent.attendees = calAttendeeService.filterDuplicates(denormalized);
          })
          .catch(function(err) {
            $log.error('Can not denormalize attendees, defaulting to original ones', err);
            $scope.editedEvent.attendees = attendees;
          });
      }

      function _canModifyEvent() {
        return calUIAuthorizationService.canModifyEvent($scope.calendar, $scope.editedEvent, session.user._id);
      }

      function displayParticipationButton() {
        return !!$scope.userAsAttendee;
      }

      function canPerformCall() {
        return !$scope.restActive;
      }

      function createEvent() {
        if (!$scope.editedEvent.title || $scope.editedEvent.title.trim().length === 0) {
          $scope.editedEvent.title = CAL_EVENT_FORM.title.default;
        }

        if (!$scope.editedEvent.class) {
          $scope.editedEvent.class = CAL_EVENT_FORM.class.default;
        }

        $scope.editedEvent.attendees = $scope.attendees.users.concat($scope.newAttendees, $scope.attendees.resources, $scope.newResources);

        if ($scope.calendar) {
          $scope.restActive = true;
          _hideModal();
          setOrganizer()
            .then(processAttendees)
            .then(function() {
              return calEventService.createEvent($scope.calendar, $scope.editedEvent, {
                graceperiod: true,
                notifyFullcalendar: $state.is('calendar.main')
              });
            })
            .then(function(completed) {
              if (!completed) {
                calOpenEventForm($scope.calendarHomeId, $scope.editedEvent);
              }
            })
            .finally(function() {
              $scope.restActive = false;
            });
        } else {
          _displayNotification(notificationFactory.weakError, 'Event creation failed', 'Cannot join the server, please try later');
        }
      }

      function deleteEvent() {
        $scope.restActive = true;
        _hideModal();
        calEventService.removeEvent($scope.event.path, $scope.event, $scope.event.etag).finally(function() {
          $scope.restActive = false;
        });
      }

      function _changeParticipationAsAttendee() {
        var status = $scope.userAsAttendee.partstat;

        $scope.restActive = true;
        calEventService.changeParticipation($scope.editedEvent.path, $scope.event, session.user.emails, status).then(function(response) {
          if (!response) {
            return;
          }

          if (!$scope.canModifyEvent) {
            var icalPartStatToReadableStatus = Object.create(null);

            icalPartStatToReadableStatus.ACCEPTED = 'You will attend this meeting';
            icalPartStatToReadableStatus.DECLINED = 'You will not attend this meeting';
            icalPartStatToReadableStatus.TENTATIVE = 'You may attend this meeting';
            _displayNotification(notificationFactory.weakInfo, 'Calendar -', icalPartStatToReadableStatus[status]);
          }
        }, function() {
          _displayNotification(notificationFactory.weakError, 'Event participation modification failed', '; Please refresh your calendar');
        }).finally(function() {
          $scope.restActive = false;
        });
      }

      function _modifyEvent() {
        if (!$scope.editedEvent.title || $scope.editedEvent.title.trim().length === 0) {
          _displayError(new Error('You must define an event title'));

          return;
        }

        $scope.editedEvent.attendees = $scope.attendees.users.concat($scope.newAttendees, $scope.attendees.resources, $scope.newResources);

        if (!calEventUtils.hasAnyChange($scope.editedEvent, $scope.event)) {
          _hideModal();

          return;
        }

        $scope.restActive = true;
        _hideModal();

        if ($scope.event.rrule && !$scope.event.rrule.equals($scope.editedEvent.rrule)) {
          $scope.editedEvent.deleteAllException();
        }

        processAttendees()
          .then(function() {
            calEventService.modifyEvent(
              $scope.event.path || calPathBuilder.forCalendarPath($scope.calendarHomeId, $scope.calendar.id),
              $scope.editedEvent,
              $scope.event,
              $scope.event.etag,
              angular.noop,
              { graceperiod: true, notifyFullcalendar: $state.is('calendar.main') }
            );
          })
          .finally(function() {
            $scope.restActive = false;
          });
      }

      function updateAlarm() {
        if ($scope.event.alarm && $scope.event.alarm.trigger) {
          if (!$scope.editedEvent.alarm || $scope.editedEvent.alarm.trigger.toICALString() === $scope.event.alarm.trigger.toICALString()) {
            return;
          }
        }

        $scope.restActive = true;
        var gracePeriodMessage = {
          performedAction: esnI18nService.translate('You are about to modify alarm of %s', $scope.event.title),
          cancelSuccess: esnI18nService.translate('Modification of %s has been cancelled.', $scope.event.title),
          gracePeriodFail: esnI18nService.translate('Modification of %s failed. Please refresh your calendar', $scope.event.title),
          successText: esnI18nService.translate('Alarm of %s has been modified.', $scope.event.title)
        };

        calEventService.modifyEvent(
          $scope.editedEvent.path || calPathBuilder.forCalendarPath($scope.calendarHomeId, $scope.calendar.id),
          $scope.editedEvent,
          $scope.event,
          $scope.event.etag,
          angular.noop,
          gracePeriodMessage
        ).finally(function() {
          $scope.restActive = false;
        });
      }

      function modifyEvent() {
        if ($scope.canModifyEvent) {
          _modifyEvent();
        } else {
          _changeParticipationAsAttendee();
        }
      }

      function changeParticipation(status) {
        $scope.userAsAttendee.partstat = status;
        if ($scope.isOrganizer) {
          if (status !== $scope.editedEvent.getOrganizerPartStat()) {
            $scope.editedEvent.setOrganizerPartStat(status);
            $scope.$broadcast(CAL_EVENTS.EVENT_ATTENDEES_UPDATE);
          }
        } else {
          $scope.editedEvent.changeParticipation(status, [$scope.userAsAttendee.email]);
          $scope.$broadcast(CAL_EVENTS.EVENT_ATTENDEES_UPDATE);

          _changeParticipationAsAttendee();
        }
      }

      function submit() {
        (calEventUtils.isNew($scope.editedEvent) && !calEventUtils.isInvolvedInATask($scope.editedEvent) ? createEvent : modifyEvent)();
      }

      function goToCalendar(callback) {
        (callback || angular.noop)();
        $state.go('calendar.main');
      }
  }
})();
