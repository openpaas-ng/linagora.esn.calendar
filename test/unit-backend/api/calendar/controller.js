'use strict';

var expect = require('chai').expect;
var mockery = require('mockery');
var fs = require('fs');
var ICAL = require('@linagora/ical.js');
var q = require('q');
var sinon = require('sinon');

describe('The calendar controller', function() {
  var userModuleMock, invitationMock, helpers, self, sendMailSpy;

  beforeEach(function() {
    self = this;

    helpers = {
      config: {
        getBaseUrl: function(user, callback) { callback(null, 'baseUrl'); }
      }
    };
    mockery.registerMock('./core', () => {});
    sendMailSpy = sinon.stub().returns(Promise.resolve());
    invitationMock = {
      email: {
        send: sendMailSpy
      },
      link: {
        generateActionLinks: function() {
          return q.when({});
        }
      }
    };
    mockery.registerMock('../../../lib/invitation', () => invitationMock);
    this.moduleHelpers.addDep('helpers', helpers);
    userModuleMock = {
      findByEmail: function(mail, callback) {
        return callback(null, null);
      }
    };
    this.moduleHelpers.addDep('user', userModuleMock);
    this.calendarModulePath = this.moduleHelpers.modulePath;
  });

  describe('the changeParticipation function', function() {
    var req, vcalendar, ics, etag, callbackAfterGetDone, requestMock, setGetRequest, url, locale;

    function setMock() {
      ics = fs.readFileSync(self.calendarModulePath + url).toString('utf8');
      vcalendar = ICAL.Component.fromString(ics);
      locale = 'en';
      req = {
        eventPayload: {
          event: ics,
          calendarURI: 'events',
          attendeeEmail: 'janedoe@open-paas.org',
          uid: vcalendar.getFirstSubcomponent('vevent').getFirstPropertyValue('uid'),
          action: 'ACCEPTED'
        },
        user: {
          _id: 'c3po'
        },
        getLocale: () => locale,
        davserver: 'http://davserver',
        headers: ['header1', 'header2']
      };

      etag = 2;
      callbackAfterGetDone = function() { };
      setGetRequest = function() {
        requestMock = function(options, callback) {
          callbackAfterGetDone();

          return callback(null, {
            headers: {etag: etag},
            body: ics,
            getLocale: sinon.spy()
          });
        };

        mockery.registerMock('request', function(options, callback) {
          requestMock(options, callback);
        });
      };

      setGetRequest();
    }

    beforeEach(function() {
      url = '/test/unit-backend/fixtures/meeting.ics';
      setMock();
    });

    it('should redirect to error page with error 400 if the attendee does not exist in the vevent', function(done) {
      var req = {
        eventPayload: {
          calendarURI: 'uri',
          uid: 'uid'
        },
        user: {
          _id: 'c3po'
        },
        davserver: 'davserver',
        getLocale: sinon.spy()
      };

      var res = {
        status: function(status) {
          expect(status).to.equal(200);

          return {
            render: function(page, context) {
              expect(page).to.equal('../event-consultation-app/error');
              expect(context.error).to.deep.equals({code: 400});
              done();
            }
          };
        }
      };

      require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies).changeParticipation(req, res);
    });

    describe('when the vevent has the attendee', function() {
      it('should send a request to the davserver to fetch the event, and should redirect to error page if request fails', function(done) {
        requestMock = function(options, callback) {
          expect(options.method).to.equal('GET');
          expect(options.url).to.equal([
              req.davserver,
              'calendars',
              req.user._id,
              req.eventPayload.calendarURI,
              req.eventPayload.uid + '.ics'
          ].join('/'));

          return callback(new Error());
        };

        var res = {
          status: function(status) {
            expect(status).to.equal(200);

            return {
              render: function(page) {
                expect(page).to.equal('../event-consultation-app/error');
                done();
              }
            };
          }
        };

        require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies).changeParticipation(req, res);
      });

      describe('request if first get request work', function() {
        it('should send a put request to davserver with If-Match, and return 500 if it fails without 412', function(done) {
          callbackAfterGetDone = function() {
            requestMock = function(options, callback) {
              expect(options.method).to.equal('PUT');
              expect(options.headers['If-Match']).to.equal(etag);
              expect(options.url).to.equal([
                  req.davserver,
                  'calendars',
                  req.user._id,
                  req.eventPayload.calendarURI,
                  vcalendar.getFirstSubcomponent('vevent').getFirstPropertyValue('uid') + '.ics'
              ].join('/'));
              expect(options.body).to.exist;

              return callback(new Error());
            };

            mockery.registerMock('request', requestMock);
          };

          var controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);

          var res = {
            status: function(status) {
              expect(status).to.equal(200);

              return {
                render: function(page) {
                  expect(page).to.equal('../event-consultation-app/error');
                  done();
                }
              };
            }
          };

          controller.changeParticipation(req, res);
        });

        it('should retry doing put if 412 up to 12 times', function(done) {
          var time = 0;

          callbackAfterGetDone = function() {
            requestMock = function(options, callback) {
              time++;
              expect(options.method).to.equal('PUT');
              expect(options.headers['If-Match']).to.equal(etag);
              expect(options.url).to.equal([
                  req.davserver,
                  'calendars',
                  req.user._id,
                  req.eventPayload.calendarURI,
                  vcalendar.getFirstSubcomponent('vevent').getFirstPropertyValue('uid') + '.ics'
              ].join('/'));
              expect(options.body).to.exist;
              setGetRequest();

              return callback(null, {statusCode: time === 12 ? 200 : 412});
            };

            mockery.registerMock('request', requestMock);
          };

          var controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);

          var res = {
            status: function(status) {
              expect(status).to.equal(200);

              return {
                render: function(page) {
                  expect(page).to.equal('../event-consultation-app/index');
                  done();
                }
              };
            }
          };

          controller.changeParticipation(req, res);
        });

        it('should fail if put fail with 412 more than 12 times', function(done) {
          callbackAfterGetDone = function() {
            requestMock = function(options, callback) {
              expect(options.method).to.equal('PUT');
              expect(options.headers['If-Match']).to.equal(etag);
              expect(options.url).to.equal([
                  req.davserver,
                  'calendars',
                  req.user._id,
                  req.eventPayload.calendarURI,
                  vcalendar.getFirstSubcomponent('vevent').getFirstPropertyValue('uid') + '.ics'
              ].join('/'));
              expect(options.body).to.exist;
              setGetRequest();

              return callback(null, {statusCode: 412});
            };

            mockery.registerMock('request', requestMock);
          };

          var controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);

          var res = {
            status: function(status) {
              expect(status).to.equal(200);

              return {
                render: function(page, context) {
                  expect(page).to.equal('../event-consultation-app/error');
                  expect(context.error).to.deep.equals({code: 500});
                  done();
                }
              };
            }
          };

          controller.changeParticipation(req, res);
        });

      });

      describe('when the event participation change has successed', function() {
        it('should redirect to /#/calendars if the user can be found', function(done) {
          var user = {_id: 'userId'};

          userModuleMock.findByEmail = sinon.spy(function(email, callback) {
            expect(email).to.equal(req.eventPayload.attendeeEmail);
            callback(null, user);
          });

          callbackAfterGetDone = function() {
            requestMock = function(options, callback) {
              return callback(null, {statusCode: 200});
            };
            mockery.registerMock('request', requestMock);
          };

          var controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);
          var res = {
            status: function(status) {
              expect(status).to.equal(200);

              return {
                redirect: function(url) {
                  expect(url).to.equal('/#/calendar');
                  expect(userModuleMock.findByEmail).to.have.been.called;
                  done();
                }
              };
            }
          };

          controller.changeParticipation(req, res);
        });

        describe('if the user cannot be found', function() {
          it('should redirect to the error page with 500 if the user search returns an error', function(done) {
            userModuleMock.findByEmail = sinon.spy(function(email, callback) {
              expect(email).to.equal(req.eventPayload.attendeeEmail);
              callback(new Error());
            });

            callbackAfterGetDone = function() {
              requestMock = function(options, callback) {
                return callback(null, {statusCode: 200});
              };
              mockery.registerMock('request', requestMock);
            };

            var controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);
            var res = {
              status: function(status) {
                expect(status).to.equal(200);

                return {
                  render: function(page, context) {
                    expect(page).to.equal('../event-consultation-app/error');
                    expect(context.error).to.deep.equals({code: 500});
                    done();
                  }
                };
              }
            };

            controller.changeParticipation(req, res);
          });

          it('should redirect to error page with 500 if the esn baseUrl cannot be retrieved form the config', function(done) {
            helpers.config.getBaseUrl = sinon.spy(function(user, callback) {
              callback(new Error());
            });

            callbackAfterGetDone = function() {
              requestMock = function(options, callback) {
                return callback(null, {statusCode: 200});
              };
              mockery.registerMock('request', requestMock);
            };

            var controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);
            var res = {
              status: function(status) {
                expect(status).to.equal(200);

                return {
                  render: function(page, context) {
                    expect(page).to.equal('../event-consultation-app/error');
                    expect(context.error).to.deep.equals({code: 500});
                    done();
                  }
                };
              }
            };

            controller.changeParticipation(req, res);
          });

          it('should send 200 and render the event consultation page', function(done) {
            var links = 'links';

            invitationMock.link.generateActionLinks = sinon.spy(function(url, eventData) {
              expect(url).to.equal('baseUrl');
              expect(eventData).to.deep.equal(req.eventPayload);

              return q.when(links);
            });

            callbackAfterGetDone = function() {
              requestMock = function(options, callback) {

                return callback(null, {statusCode: 200});
              };
              mockery.registerMock('request', requestMock);
            };

            var controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);
            var res = {
              status: function(status) {
                expect(status).to.equal(200);

                return {
                  render: function(template, locals) {
                    expect(invitationMock.link.generateActionLinks).to.have.been.called;
                    expect(locals).to.shallowDeepEqual({
                      attendeeEmail: req.eventPayload.attendeeEmail,
                      links,
                      locale
                    });
                    done();
                  }
                };
              }
            };

            controller.changeParticipation(req, res);
          });
        });
      });
    });

    describe('when the vevent is recurring with exception', function() {
      beforeEach(function() {
        url = '/test/unit-backend/fixtures/meeting-recurring-with-exception.ics';
        setMock();
      });

      it('should work even if the attendee does not exist in the vevent but does in a subinstance of the event', function(done) {
        var req = {
          eventPayload: {
            calendarURI: 'uri',
            attendeeEmail: 'lduzan@linagora.com',
            uid: 'uid'
          },
          user: {
            _id: 'c3po'
          },
          davserver: 'davserver'
        };

        var res = {
          status: function(status) {
            expect(status).to.equal(200);
            done();
          }
        };

        callbackAfterGetDone = function() {
          requestMock = function(options, callback) {
            return callback(null, {statusCode: 200});
          };
          mockery.registerMock('request', requestMock);
        };

        var controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);

        controller.changeParticipation(req, res);
      });
    });
  });

  describe('The sendInvitation function', function() {
    let req;

    beforeEach(function() {
      req = {
        user: 1,
        body: {
          eventPath: '/foo/bar/baz.ics',
          email: 'me@open-paas.org',
          method: 'REQUEST',
          event: 'The event',
          calendarURI: 'The Calendar URI',
          notify: true
        }
      };

      this.checkErrorResponse = function(status, errorMessage, done) {
        return {
          status: function(_status) {
            expect(_status).to.equal(status);

            return {
              json: function(body) {
                expect(body.error.details).to.equals(errorMessage);
                done && done();
              }
            };
          }
        };
      };
    });

    it('should HTTP 400 when body.email is not defined', function(done) {
      delete req.body.email;

      const controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);

      controller.sendInvitation(req, this.checkErrorResponse(400, 'The "emails" array is required and must contain at least one element', done));
    });

    it('should HTTP 400 when body.eventPath is not defined', function(done) {
      delete req.body.eventPath;

      const controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);

      controller.sendInvitation(req, this.checkErrorResponse(400, 'eventPath is required and must be a string', done));
    });

    it('should HTTP 400 when body.eventPath is not a string', function(done) {
      req.body.eventPath = {foo: 'bar'};

      const controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);

      controller.sendInvitation(req, this.checkErrorResponse(400, 'eventPath is required and must be a string', done));
    });

    it('should HTTP 400 when body.method is not defined', function(done) {
      delete req.body.method;

      const controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);

      controller.sendInvitation(req, this.checkErrorResponse(400, 'Method is required and must be a string (REQUEST, REPLY, CANCEL, etc.)', done));
    });

    it('should HTTP 400 when body.method is not a string', function(done) {
      req.body.method = {foo: 'bar'};

      const controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);

      controller.sendInvitation(req, this.checkErrorResponse(400, 'Method is required and must be a string (REQUEST, REPLY, CANCEL, etc.)', done));
    });

    it('should HTTP 400 when body.event is not a defined', function(done) {
      delete req.body.event;

      const controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);

      controller.sendInvitation(req, this.checkErrorResponse(400, 'Event is required and must be a string (ICS format)', done));
    });

    it('should HTTP 400 when body.event is not a string', function(done) {
      req.body.event = {foo: 'bar'};

      const controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);

      controller.sendInvitation(req, this.checkErrorResponse(400, 'Event is required and must be a string (ICS format)', done));
    });

    it('should HTTP 400 when body.calendarURI is not a defined', function(done) {
      delete req.body.calendarURI;

      const controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);

      controller.sendInvitation(req, this.checkErrorResponse(400, 'Calendar Id is required and must be a string', done));
    });

    it('should HTTP 400 when body.calendarURI is not a string', function(done) {
      req.body.calendarURI = {foo: 'bar'};

      const controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);

      controller.sendInvitation(req, this.checkErrorResponse(400, 'Calendar Id is required and must be a string', done));
    });

    it('should not notify when body.notify is false', function(done) {
      req.body.notify = false;

      const controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);

      controller.sendInvitation(req, {
        status: _status => {
          expect(_status).to.equal(200);
          expect(sendMailSpy).to.not.have.been.called;

          return {
            end: done
          };
        }
      });
    });

    it('should HTTP 500 when invitation can not be send', function(done) {
      const error = new Error('I failed to send the email');

      sendMailSpy.returns(Promise.reject(error));

      const controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);

      controller.sendInvitation(req, {
        status: _status => {
          expect(_status).to.equal(500);
          expect(sendMailSpy).to.have.been.calledWith(req.user, req.body.email, req.body.method, req.body.event, req.body.calendarURI);

          return {
            json: body => {
              expect(body.error.details).to.equal(error.message);
              done();
            }
          };
        }
      });
    });

    it('should HTTP 200 when notification has been sent', function(done) {
      const controller = require(this.calendarModulePath + '/backend/webserver/api/calendar/controller')(this.moduleHelpers.dependencies);

      controller.sendInvitation(req, {
        status: _status => {
          expect(_status).to.equal(200);
          expect(sendMailSpy).to.have.been.calledWith(req.user, req.body.email, req.body.method, req.body.event, req.body.calendarURI);

          return {
            end: done
          };
        }
      });
    });
  });
});
