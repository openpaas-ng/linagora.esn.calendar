'use strict';

/* global chai, sinon: false */

var expect = chai.expect;

describe('The calEventDateEditionController', function() {

  var $controller, calMoment, esnI18nDateFormatService;
  var startTestMoment, endTestMoment;

  beforeEach(function() {
    esnI18nDateFormatService = {
      getLongDateFormat: sinon.spy()
    };

    angular.mock.module('esn.calendar', function($provide) {
      $provide.value('esnI18nDateFormatService', esnI18nDateFormatService);
    });

    angular.mock.inject(function(_$controller_, _calMoment_) {
      $controller = _$controller_;
      calMoment = _calMoment_;
    });

    startTestMoment = calMoment('2013-02-08 09:30:00Z').utc();
    endTestMoment = calMoment('2013-02-08 10:00:00Z').utc();
  });

  function initController(bindings) {
    var controller = $controller('calEventDateEditionController', null, bindings);

    controller.$onInit();

    return controller;
  }

  describe('The dateOnBlurFn function', function() {
    it('should compute diff of start date and end date onload', function() {
      var bindings = {
        event: {
          start: startTestMoment,
          end: endTestMoment
        }
      };
      var ctrl = initController(bindings);

      expect(ctrl.diff).to.deep.equal(1800000);
    });

    it('should clone event start and end on input blur', function() {
      var bindings = {
        event: {
          start: calMoment('2016-02-16 17:30'),
          end: calMoment('2016-02-16 18:30')
        }
      };
      var ctrl = initController(bindings);
      var startBeforeBlur = ctrl.event.start;
      var endBeforeBlur = ctrl.event.end;

      ctrl.dateOnBlurFn();
      expect(ctrl.event.start).to.not.equal(startBeforeBlur);
      expect(ctrl.event.end).to.not.equal(endBeforeBlur);
      expect(ctrl.event.start.isSame(startBeforeBlur)).to.be.true;
      expect(ctrl.event.end.isSame(endBeforeBlur)).to.be.true;
    });

    describe('The allDayOnChange function', function() {
      it('should stripTime scope.event.allDay is true and add a day', function() {
        var bindings = {
          event: {
            start: startTestMoment,
            end: endTestMoment,
            full24HoursDay: true
          }
        };
        var ctrl = initController(bindings);

        ctrl.allDayOnChange();

        expect(ctrl.event.start.format('YYYY-MM-DD')).to.equal('2013-02-08');
        expect(ctrl.event.start.hasTime()).to.be.false;

        expect(ctrl.event.end.format('YYYY-MM-DD')).to.equal('2013-02-09');
        expect(ctrl.event.end.hasTime()).to.be.false;
      });

      it('should set the time of start and end to next hour', function() {
        var bindings = {
          event: {
            start: startTestMoment.stripTime(),
            end: calMoment('2013-02-09 10:30').stripTime(),
            allDay: false
          }
        };
        var ctrl = initController(bindings);

        ctrl.allDayOnChange();

        expect(ctrl.event.start.hasTime()).to.be.true;
        expect(ctrl.event.end.hasTime()).to.be.true;
        expect(ctrl.event.start._isUTC).to.be.true;
        expect(ctrl.event.end._isUTC).to.be.true;

        var nextHour = calMoment().utc().startOf('hour').add(1, 'hour');
        var nextHourEnd = nextHour.clone().add(30, 'minute');
        var fmt = 'HH:mm:ss.SSS';

        expect(ctrl.event.start.format(fmt)).to.equal(nextHour.format(fmt));
        expect(ctrl.event.end.format(fmt)).to.equal(nextHourEnd.format(fmt));
      });

      it('should set the time of start to next hour and end to next hour+30min if same day', function() {
        var bindings = {
          event: {
            start: startTestMoment,
            end: endTestMoment,
            full24HoursDay: false
          }
        };

        var ctrl = initController(bindings);
        var nextHour = calMoment().endOf('hour').add(1, 'seconds');

        ctrl.allDayOnChange();

        expect(ctrl.event.start.time().seconds())
          .to.deep.equal(nextHour.time().seconds());
        expect(ctrl.event.end.time().seconds())
          .to.deep.equal(nextHour.add(30, 'minute').time().seconds());
      });

      it('should remember the time when switching to and from allday', function() {
        var MINUTE = 60 * 1000;
        var HOUR = 60 * MINUTE;
        var origStart = startTestMoment;
        var origEnd = endTestMoment;
        var bindings = {
          event: {
            start: origStart.clone(),
            end: origEnd.clone(),
            full24HoursDay: false
          }
        };
        var ctrl = initController(bindings);

        expect(ctrl.event.start.format('YYYY-MM-DD HH:mm:ss')).to.equal('2013-02-08 09:30:00');
        expect(ctrl.event.start.hasTime()).to.be.true;
        expect(ctrl.event.end.format('YYYY-MM-DD HH:mm:ss')).to.equal('2013-02-08 10:00:00');
        expect(ctrl.event.end.hasTime()).to.be.true;
        expect(ctrl.diff).to.equal(30 * MINUTE);

        ctrl.full24HoursDay = true;
        ctrl.allDayOnChange();

        expect(ctrl.event.start.format('YYYY-MM-DD')).to.equal('2013-02-08');
        expect(ctrl.event.start.hasTime()).to.be.false;
        expect(ctrl.event.end.format('YYYY-MM-DD')).to.equal('2013-02-09');
        expect(ctrl.event.end.hasTime()).to.be.false;
        expect(ctrl.diff).to.equal(24 * HOUR);

        ctrl.full24HoursDay = false;
        ctrl.allDayOnChange();

        expect(ctrl.event.start.format('YYYY-MM-DD HH:mm:ss')).to.equal('2013-02-08 09:30:00');
        expect(ctrl.event.start.hasTime()).to.be.true;
        expect(ctrl.event.end.format('YYYY-MM-DD HH:mm:ss')).to.equal('2013-02-08 10:00:00');
        expect(ctrl.event.end.hasTime()).to.be.true;
        expect(ctrl.diff).to.equal(30 * MINUTE);
      });
    });

    describe('The getMinDate function', function() {
      it('should return start minus 1 day', function() {
        var bindings = {
          event: {
            start: startTestMoment,
            end: endTestMoment,
            full24HoursDay: true
          }
        };
        var ctrl = initController(bindings);

        expect(ctrl.getMinDate()).to.equal('2013-02-07');
      });
    });

    describe('The onStartDateChange function', function() {
      it('should set end to start plus the previous stored diff', function() {
        var bindings = {
          event: {
            start: startTestMoment,
            end: endTestMoment
          }
        };
        var ctrl = initController(bindings);

        ctrl.diff = 3600 * 1000 * 2; // 2 hours
        ctrl.onStartDateChange();

        var isSame = calMoment('2013-02-08 11:30:00Z').isSame(ctrl.event.end);

        expect(isSame).to.be.true;
      });

      it('should call onDateChange', function() {
        var bindings = {
          event: {
            start: startTestMoment,
            end: endTestMoment
          },
          onDateChange: sinon.spy()
        };
        var ctrl = initController(bindings);

        ctrl.diff = 3600 * 1000 * 2; // 2 hours
        ctrl.onStartDateChange();

        expect(bindings.onDateChange).to.have.been.calledOnce;
      });

      describe('comportment for null date and invalid date', function() {
        /* global moment: false */

        beforeEach(function() {
          moment.suppressDeprecationWarnings = true;
        });

        it('should ignore null date and invalid date', function() {
          var end = calMoment('2013-02-08 13:30');
          var bindings = {
            event: {
              start: startTestMoment,
              end: end.clone()
            }
          };
          var ctrl = initController(bindings);

          [null, calMoment('invalid date')].forEach(function(date) {
            ctrl.event.start = date;
            ctrl.onStartDateChange();
            var isSame = end.isSame(ctrl.event.end);

            expect(isSame).to.be.true;
          }, this);
        });

        afterEach(function() {
          moment.suppressDeprecationWarnings = false;
        });
      });
    });

    describe('The onEndDateChange function', function() {
      it('should compute diff between start and end', function() {
        var bindings = {
          event: {
            start: startTestMoment,
            end: calMoment('2013-02-08 13:30:00Z')
          }
        };
        var ctrl = initController(bindings);

        ctrl.onEndDateChange();
        expect(ctrl.diff).to.equal(3600 * 1000 * 4);
      });

      it('should set end to start plus 30 min if end is before start', function() {
        var bindings = {
          event: {
            start: startTestMoment,
            end: calMoment('2013-02-07 13:30')
          }
        };
        var ctrl = initController(bindings);
        ctrl.onEndDateChange();
        var isSame = endTestMoment.isSame(ctrl.event.end);

        expect(isSame).to.be.true;
      });

      it('should ignore null date and invalid date', function() {
        var start = calMoment('2013-02-07 13:30');

        var bindings = {
          event: {
            end: startTestMoment,
            start: start.clone()
          }
        };
        var ctrl = initController(bindings);

        [null, calMoment('invalid date')].forEach(function(date) {
          ctrl.event.end = date;
          ctrl.onEndDateChange();
          var isSame = start.isSame(ctrl.event.start);

          expect(isSame).to.be.true;
        }, this);
      });

      it('should call onDateChange when called with falsy parameter', function() {
        var bindings = {
          event: {
            start: startTestMoment,
            end: calMoment('2013-02-07 13:30')
          },
          onDateChange: sinon.spy()
        };
        var ctrl = initController(bindings);

        ctrl.onEndDateChange();

        expect(bindings.onDateChange).to.have.been.calledOne;
      });

      it('should not call onDateChange when called with truthy parameter', function() {
        var bindings = {
          event: {
            start: startTestMoment,
            end: calMoment('2013-02-07 13:30')
          },
          onDateChange: sinon.spy()
        };
        var ctrl = initController(bindings);

        ctrl.onEndDateChange(true);

        expect(bindings.onDateChange).to.not.have.been.called;
      });
    });
  });
});
