(function() {
  'use strict';

  angular.module('esn.calendar')
    .controller('CalEventFormController', CalEventFormController);

  function CalEventFormController(
    $timeout,
    $alert,
    $scope,
    $state,
    $log,
    $q,
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
    calConfigurationService,
    session,
    calPathBuilder,
    esnI18nService,
    calMoment,
    CAL_ATTENDEE_OBJECT_TYPE,
    CAL_RELATED_EVENT_TYPES,
    CAL_EVENTS,
    CAL_EVENT_FORM,
    CAL_ICAL,
    calFreebusyService
  ) {
      var initialUserAttendeesRemoved = [];
      var initialResourceAttendeesRemoved = [];

      $scope.selectedTab = 'attendees';
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
      $scope.onUserAttendeesAdded = onUserAttendeesAdded;
      $scope.onResourceAttendeesAdded = onResourceAttendeesAdded;
      $scope.onUserAttendeesRemoved = onUserAttendeesRemoved;
      $scope.onResourceAttendeesRemoved = onResourceAttendeesRemoved;
      $scope.canPerformCall = canPerformCall;
      $scope.goToCalendar = goToCalendar;
      $scope.cancel = cancel;
      $scope.toggleSuggestedEvent = toggleSuggestedEvent;
      $scope.submitSuggestion = submitSuggestion;

      // Initialize the scope of the form. It creates a scope.editedEvent which allows us to
      // rollback to scope.event in case of a Cancel.
      $scope.initFormData();

      function cancel() {
        calEventUtils.resetStoredEvents();
        _hideModal();
      }

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

      function _hideModal() {
        if ($scope.$hide) {
          $scope.$hide();
        }
      }

      function _displayNotification(notificationFactoryFunction, title, content, z_index) {
        notificationFactoryFunction(title, content, z_index);
      }

      function initFormData() {
        $scope.use24hourFormat = calConfigurationService.use24hourFormat();
        $scope.editedEvent = $scope.event.clone();
        $scope.initialAttendees = angular.copy($scope.editedEvent.attendees) || [];
        $scope.newAttendees = calEventUtils.getNewAttendees();
        $scope.newResources = calEventUtils.getNewResources();
        $scope.isOrganizer = calEventUtils.isOrganizer($scope.editedEvent);
        $scope.canSuggestTime = calEventUtils.canSuggestChanges($scope.editedEvent, session.user);
        $scope.inputSuggestions = _.filter($scope.relatedEvents, {type: CAL_RELATED_EVENT_TYPES.COUNTER});

        calendarService.listPersonalAndAcceptedDelegationCalendars($scope.calendarHomeId)
          .then(function(calendars) {
            $scope.calendars = calendars;
            $scope.calendar = calEventUtils.isNew($scope.editedEvent) ? _.find(calendars, 'selected') : _.find(calendars, function(calendar) {

              return $scope.editedEvent.calendarUniqueId === calendar.getUniqueId();
            });
          })
          .then(function() {
            return $scope.calendar.getOwner();
          })
          .then(function(owner) {
            $scope.attendees = calAttendeeService.splitAttendeesFromType($scope.editedEvent.attendees);
            $scope.calendarOwnerAsAttendee = calAttendeeService.getAttendeeForUser($scope.editedEvent.attendees, owner);

            if (!$scope.editedEvent.class) {
              $scope.editedEvent.class = CAL_EVENT_FORM.class.default;
            }

            $scope.canModifyEvent = _canModifyEvent();
            $scope.displayParticipationButton = displayParticipationButton();
            $scope.displayCalMailToAttendeesButton = displayCalMailToAttendeesButton;
            $scope.canModifyEventAttendees = calUIAuthorizationService.canModifyEventAttendees($scope.calendar, $scope.editedEvent, session.user._id);
            $scope.canModifyEventRecurrence = calUIAuthorizationService.canModifyEventRecurrence($scope.calendar, $scope.editedEvent, session.user._id);

            return calAttendeeService.splitAttendeesFromTypeWithResourceDetails($scope.editedEvent.attendees);
          }).then(function(attendeesWithResourceDetails) {
            $scope.attendees = _.assign({}, $scope.attendees, attendeesWithResourceDetails);
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

      function denormalizeAttendees() {
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
        return !!$scope.calendarOwnerAsAttendee && !$scope.calendar.readOnly;
      }

      function canPerformCall() {
        return !$scope.restActive;
      }

      function cacheAttendees() {
        calEventUtils.setNewAttendees($scope.newAttendees);
        calEventUtils.setNewResources($scope.newResources);
      }

      function createEvent() {
        if (!$scope.editedEvent.title || $scope.editedEvent.title.trim().length === 0) {
          $scope.editedEvent.title = CAL_EVENT_FORM.title.empty;
        }

        if (!$scope.editedEvent.class) {
          $scope.editedEvent.class = CAL_EVENT_FORM.class.default;
        }

        if ($scope.calendar) {
          $scope.restActive = true;
          _hideModal();
          $scope.editedEvent.attendees = getAttendees();
          setOrganizer()
            .then(cacheAttendees)
            .then(denormalizeAttendees)
            .then(function() {
              return calEventService.createEvent($scope.calendar, $scope.editedEvent, {
                graceperiod: true,
                notifyFullcalendar: $state.is('calendar.main')
              });
            })
            .then(onEventCreateUpdateResponse)
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
        var status = $scope.calendarOwnerAsAttendee.partstat;

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
          $scope.editedEvent.title = CAL_EVENT_FORM.title.empty;
        }

        $scope.editedEvent.attendees = getUpdatedAttendees();

        if (!calEventUtils.hasAnyChange($scope.editedEvent, $scope.event)) {
          _hideModal();

          return;
        }

        $scope.restActive = true;
        _hideModal();

        if ($scope.event.rrule && !$scope.event.rrule.equals($scope.editedEvent.rrule)) {
          $scope.editedEvent.deleteAllException();
        }

        return $q.when()
          .then(cacheAttendees)
          .then(denormalizeAttendees)
          .then(function() {
            return calEventService.modifyEvent(
              $scope.event.path || calPathBuilder.forCalendarPath($scope.calendarHomeId, $scope.calendar.id),
              $scope.editedEvent,
              $scope.event,
              $scope.event.etag,
              angular.noop,
              { graceperiod: true, notifyFullcalendar: $state.is('calendar.main') }
            );
          })
          .then(onEventCreateUpdateResponse)
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
        $scope.calendarOwnerAsAttendee.partstat = status;
        if ($scope.editedEvent.organizer && $scope.calendarOwnerAsAttendee.email === $scope.editedEvent.organizer.email) {
          if (status !== $scope.editedEvent.getOrganizerPartStat()) {
            $scope.editedEvent.setOrganizerPartStat(status);
            $scope.$broadcast(CAL_EVENTS.EVENT_ATTENDEES_UPDATE);
          }
        } else {
          $scope.editedEvent.changeParticipation(status, [$scope.calendarOwnerAsAttendee.email]);
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

      function onEventCreateUpdateResponse(success) {
        if (success) {
          return calEventUtils.resetStoredEvents();
        }

        $scope.editedEvent.attendees = $scope.initialAttendees;
        calOpenEventForm($scope.calendarHomeId, $scope.editedEvent);
      }

      function onAttendeesAdded(attendeeAdded) {
        return calFreebusyService
          .isAttendeeAvailable(attendeeAdded.id, $scope.editedEvent.start, $scope.editedEvent.end)
          .then(function(isAvailable) {
            return !isAvailable;
          })
          .catch(function(error) {
            $log.debug('Cannot retrieve attendee availability', error);

            _displayNotification(
              notificationFactory.weakError,
              'Cannot retrieve attendee availability',
              'An error occurred, please try again'
            );
            return true;
          });
      }

      function onUserAttendeesAdded(userAttendeeAdded) {
        userAttendeeAdded.isLoading = true;

        onAttendeesAdded(userAttendeeAdded)
          .then(function(isBusy) {
            userAttendeeAdded.isBusy = isBusy;
          })
          .finally(function() {
            userAttendeeAdded.isLoading = false;
          });
      }

      function onResourceAttendeesAdded(resourceAttendeeAdded) {
        resourceAttendeeAdded.isLoading = true;

        onAttendeesAdded(resourceAttendeeAdded)
          .then(function(isBusy) {
            resourceAttendeeAdded.isBusy = isBusy;
          })
          .finally(function() {
            resourceAttendeeAdded.isLoading = false;
          });
      }

      function onUserAttendeesRemoved(removed) {
        initialUserAttendeesRemoved = initialUserAttendeesRemoved.concat(removed);
      }

      function onResourceAttendeesRemoved(removed) {
        initialResourceAttendeesRemoved = initialResourceAttendeesRemoved.concat(removed);
      }

      function getAttendees() {
        return [].concat($scope.attendees.users, $scope.newAttendees, $scope.attendees.resources, $scope.newResources);
      }

      function getUpdatedAttendees() {
        var attendees = $scope.newAttendees.map(function(attendee) {
          return _.find(initialUserAttendeesRemoved, { email: attendee.email }) || attendee;
        });

        var resources = $scope.newResources.map(function(resource) {
          return _.find(initialResourceAttendeesRemoved, { email: resource.email }) || resource;
        });

        return $scope.attendees.users.concat(attendees, $scope.attendees.resources, resources);
      }

      function toggleSuggestedEvent() {
        // cloning the event to avoid to update the current edited event while suggesting date
        $scope.suggestedEvent = $scope.suggestedEvent ? null : $scope.editedEvent.clone();
      }

      function submitSuggestion() {
        return calEventService.sendCounter($scope.suggestedEvent).then(function(response) {
          if (!response) {
            return;
          }

          toggleSuggestedEvent();
          _displayNotification(notificationFactory.weakInfo, 'Calendar -', 'Your proposal has been sent');
        })
        .catch(function() {
          _displayNotification(notificationFactory.weakError, 'Calendar -', 'An error occurred, please try again');
        });
      }
  }
})();
