(function() {
  'use strict';

  angular.module('esn.calendar')
    .directive('eventRecurrenceEdition', eventRecurrenceEdition);

  function eventRecurrenceEdition() {
    var directive = {
      restrict: 'E',
      templateUrl: '/calendar/app/components/event-recurrence-edition/event-recurrence-edition.html',
      scope: {
        _event: '=event',
        canModifyEventRecurrence: '=?'
      },
      link: link,
      replace: true,
      controller: EventRecurrenceEditionController,
      controllerAs: 'vm',
      bindToController: true
    };

    return directive;

    ////////////

    function link(scope, element, attrs, vm) { // eslint-disable-line no-unused-vars
      scope.selectEndRadioButton = selectEndRadioButton;

      function selectEndRadioButton(index) {
        var radioButtons = element.find('input[name="inlineRadioEndOptions"]');

        radioButtons[index].checked = true;
        // reset event.rrule.until if we are clicking on After ... occurrences input.
        if (index === 1) {
          vm.resetUntil();
        }
        // reset event.rrule.until if we are clicking on At ... input.
        if (index === 2) {
          vm.resetCount();
        }
      }
    }
  }

  function EventRecurrenceEditionController(moment, esnI18nService, CAL_RECUR_FREQ, CAL_WEEK_DAYS, CAL_MAX_RRULE_COUNT) {
    var self = this;

    self.CAL_RECUR_FREQ = CAL_RECUR_FREQ;
    self.days = generateDays();
    self.toggleWeekdays = toggleWeekdays;
    self.resetUntil = resetUntil;
    self.resetCount = resetCount;
    self.setRRULE = setRRULE;
    self.CAL_MAX_RRULE_COUNT = CAL_MAX_RRULE_COUNT;

    activate();

    ////////////

    function activate() {
      self._event.getModifiedMaster().then(function(master) {
        self.event = master;
        self.freq = self.event.rrule ? self.event.rrule.freq : undefined;
      });
    }

    function generateDays() {
      var localeMoment = moment().locale(esnI18nService.getLocale());

      return angular.copy(CAL_WEEK_DAYS).map(function(day) {
        day.selected = false; // TODO #1074
        day.shortName = localeMoment.day(esnI18nService.translate(day.label).toString()).format('dd');

        return day;
      });
    }

    function toggleWeekdays(value) {
      var index = self.event.rrule.byday.indexOf(value);
      var newDays = self.event.rrule.byday.slice();

      if (index > -1) {
        newDays.splice(index, 1);
      } else {
        newDays.push(value);
      }

      self.event.rrule.byday = sortDays(newDays);
    }

    function sortDays(days) {
      var weekDaysValues = CAL_WEEK_DAYS.map(function(day) {
        return day.value;
      });

      return days.sort(function(dayA, dayB) {
        if (weekDaysValues.indexOf(dayA) > weekDaysValues.indexOf(dayB)) {
          return 1;
        } else if (weekDaysValues.indexOf(dayA) < weekDaysValues.indexOf(dayB)) {
          return -1;
        }

        return 0;
      });
    }

    function resetUntil() {
      self.event.rrule.until = undefined;
    }

    function resetCount() {
      self.event.rrule.count = undefined;
    }

    function setRRULE() {
      if (!self.freq) {
        self.event.rrule = undefined;
      } else {
        self.event.rrule = {
          freq: self.freq,
          interval: self.event.rrule && self.event.rrule.interval || 1
        };
      }
    }
  }
})();
