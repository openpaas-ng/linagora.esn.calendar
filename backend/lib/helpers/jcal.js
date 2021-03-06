'use strict';

const ICAL = require('@linagora/ical.js');
const moment = require('moment-timezone');
const urljoin = require('url-join');
const _ = require('lodash');
const constants = require('../constants');

module.exports = {
  jcal2content,
  getAttendeesEmails,
  getIcalEvent,
  getOrganizerEmail,
  getIcalDateAsMoment,
  getVAlarmAsObject,
  getVeventAttendeeByMail,
  updateParticipation,
  icsAsVcalendar
};

function _getEmail(attendee) {
  return attendee.getFirstValue().replace(/^MAILTO:/i, '');
}

function _icalDateToMoment(icalDate) {
  let dt;
  const momentDatetimeArg = [icalDate.year, icalDate.month - 1, icalDate.day, icalDate.hour, icalDate.minute, icalDate.second];

  if (icalDate.isDate) {
    dt = moment(momentDatetimeArg.slice(0, 3));
  } else if (icalDate.zone === ICAL.Timezone.utcTimezone) {
    dt = moment.utc(momentDatetimeArg);
  } else {
    dt = moment(momentDatetimeArg);
  }

  return dt;
}

function getIcalDateAsMoment(icalDate) {
  return _icalDateToMoment(icalDate);
}

function getVeventAttendeeByMail(vevent, email) {
  const results = vevent.getAllProperties('attendee').filter(attendee => _getEmail(attendee) === email);

  return results.length ? results[0] : null;
}

function getVAlarmAsObject(valarm, dtstart) {
  const trigger = valarm.getFirstPropertyValue('trigger');
  const attendee = valarm.getFirstPropertyValue('attendee');
  const startDate = _icalDateToMoment(dtstart);
  const triggerDuration = moment.duration(trigger);
  const action = valarm.getFirstPropertyValue('action');
  const alarmObject = {
    action,
    trigger,
    description: valarm.getFirstPropertyValue('description'),
    summary: valarm.getFirstPropertyValue('summary'),
    alarmDueDate: startDate.clone().add(triggerDuration),
    triggerDisplay: triggerDuration.humanize()
  };

  if (action === constants.VALARM_ACTIONS.EMAIL) {
    alarmObject.attendee = attendee;
    alarmObject.email = attendee.replace(/^MAILTO:/i, '');
  }

  return alarmObject;
}

/**
 * Construct the Ical.Event of a iCalendar (and setting timezone correctly)
 * @param {String} icalendar Representation of a icalendar object as a string.
 * @return {Ical.Event}
 */
function getIcalEvent(icalendar) {
  const vcalendar = ICAL.Component.fromString(icalendar);
  const event = vcalendar.getFirstSubcomponent('vevent');
  const icalEvent = new ICAL.Event(event);
  const timezones = _.chain(vcalendar.getAllSubcomponents('vtimezone')).map(ICAL.Timezone.fromData).keyBy('tzid').value();

  if (icalEvent.startDate) {
    icalEvent.startDate.zone = timezones[icalEvent.startDate.timezone] || icalEvent.startDate.zone;
    if (icalEvent.endDate) {
      icalEvent.endDate.zone = timezones[icalEvent.endDate.timezone] || icalEvent.endDate.zone;
    }
  }

  return icalEvent;
}

/**
 * Return a formatted, easily usable data from a jcal object
 * @param {String} icalendar Representation of a icalendar object as a string.
 * @return {Object} content
 * {
      method: 'REQUEST',
      sequence: 0,
      summary: 'aSummary',
      start: {
        date: '06/12/2015',
        time: '3:00 PM'
      },
      end: {
        date: '06/12/2015',
        time: '3:30 PM'
      },
      allday: true,
      location: 'aLocation',
      description: 'aDescription',
      organizer: {
        cn: 'aOrganizer',
        email: 'aorganizer@linagora.com',
        avatar: 'http://localhost:8080/api/avatars?objectType=user&email=aorganizer@linagora.com'
      },
      attendees: {
        'aattendee@linagora.com>: {
          cn: 'aattendee',
          partstat: 'ACCEPTED',
        },
        'aattendee2@linagora.com>: {
          cn: 'aattendee2',
          partstat: 'NEEDS-ACTION',
        }
      },
      alarm: {
        action: 'EMAIL',
        trigger: '-PT15M',
        description: 'an alarm',
        summary: 'Event Pending',
        attendee: 'aorganizer@linagora.com',
        email: 'aorganizer@linagora.com',
        alarmDueDate: 'a date 15 min before start date',
        triggerDisplay: '15 minutes'
      }
    }
   }
 */
function jcal2content(icalendar, baseUrl = '') {
  const vcalendar = ICAL.Component.fromString(icalendar);
  const vevent = vcalendar.getFirstSubcomponent('vevent');
  const method = vcalendar.getFirstPropertyValue('method');
  const attendees = {};
  const resources = {};

  vevent.getAllProperties('attendee').forEach(attendee => {
    const partstat = attendee.getParameter('partstat');
    const cn = attendee.getParameter('cn');
    const mail = _getEmail(attendee);
    const isResource = attendee.getParameter('cutype') && attendee.getParameter('cutype') === 'RESOURCE';
    const attendeeElement = {partstat, cn};

    if (isResource) {
      resources[mail] = attendeeElement;
    } else {
      attendees[mail] = attendeeElement;
    }
  });

  const dtstart = vevent.getFirstProperty('dtstart');
  const allDay = dtstart.type === 'date';
  const icalEvent = getIcalEvent(icalendar);
  const startDate = _icalDateToMoment(icalEvent.startDate);
  const endDate = _icalDateToMoment(icalEvent.endDate);
  let durationInDays = null;
  let end;

  if (!!endDate && !!startDate) {
    durationInDays = endDate.diff(startDate, 'days');
  }

  // OR-1221: end is exclusive when the event is an allday event.
  // For end user, we are chosing an inclusive end date
  if (allDay) {
    endDate.subtract(1, 'day');
    end = {
      date: endDate.format('L')
    };
  } else {
    end = {
      date: endDate.format('L'),
      time: endDate.format('LT'),
      timezone: getTimezoneOfIcalDate(icalEvent.endDate) || getTimezoneOfIcalDate(icalEvent.startDate)
    };
  }

  let organizer = vevent.getFirstProperty('organizer') || undefined;

  if (organizer) {
    const cn = organizer.getParameter('cn');
    const mail = organizer.getFirstValue().replace(/^MAILTO:/i, '');

    organizer = {
      cn: cn,
      email: mail,
      avatar: urljoin(baseUrl, 'api/avatars?objectType=user&email=' + mail)
    };
  }

  const content = {
    method,
    uid: vevent.getFirstPropertyValue('uid'),
    sequence: vevent.getFirstPropertyValue('sequence'),
    summary: vevent.getFirstPropertyValue('summary'),
    location: vevent.getFirstPropertyValue('location'),
    description: vevent.getFirstPropertyValue('description'),
    start: {
      date: startDate.format('L'),
      time: allDay ? undefined : startDate.format('LT'),
      timezone: getTimezoneOfIcalDate(icalEvent.startDate)
    },
    end,
    allDay,
    attendees,
    resources,
    hasResources: !_.isEmpty(resources),
    organizer,
    durationInDays
  };
  const valarm = vevent.getFirstSubcomponent('valarm');
  const comment = vevent.getFirstPropertyValue('comment');

  if (valarm) {
    content.alarm = getVAlarmAsObject(valarm, dtstart);
  }
  if (comment) {
    content.comment = comment;
  }

  return content;
}

function getTimezoneOfIcalDate(icalDatetime) {
  if (icalDatetime.isDate) {
    return '';
  }

  return icalDatetime.zone === ICAL.Timezone.utcTimezone ? 'UTC' : icalDatetime.timezone;
}

function getAttendeesEmails(icalendar) {
  const vcalendar = new ICAL.Component(icalendar);
  const vevent = vcalendar.getFirstSubcomponent('vevent');

  return vevent.getAllProperties('attendee').map(_getEmail);
}

function getOrganizerEmail(icalendar) {
  const vcalendar = new ICAL.Component(icalendar);
  const vevent = vcalendar.getFirstSubcomponent('vevent');
  const organizer = vevent.getFirstProperty('organizer');

  if (organizer) {
    return organizer.getFirstValue().replace(/^MAILTO:/i, '');
  }
}

/**
 * Update the participation of the given attendee.
 * Returns the updated event as JSON or throw an error if the attendee is not in the event attendees.
 *
 * @param {*} jsonEvent as JSON
 * @param {*} attendeeEmail
 * @param {*} partstat
 */
function updateParticipation(vcalendar, attendeeEmail, partstat) {
  const vevent = vcalendar.getFirstSubcomponent('vevent');
  const events = [vevent].concat(vcalendar.getAllSubcomponents('vevent').filter(vevent => vevent.getFirstPropertyValue('recurrence-id')));
  const attendees = events.map(vevent => getVeventAttendeeByMail(vevent, attendeeEmail)).filter(Boolean);

  if (attendees.length) {
    attendees.forEach(attendee => attendee.setParameter('partstat', partstat));
  }

  return vcalendar;
}

function icsAsVcalendar(ics) {
  return ICAL.Component.fromString(ics);
}
