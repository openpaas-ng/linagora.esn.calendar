const CONSTANTS = require('../../constants');
const path = require('path');
const Q = require('q');
const jcalHelper = require('../../helpers/jcal');
const template = { name: 'event.alarm', path: path.resolve(__dirname, '../../../../templates/email') };

module.exports = dependencies => {
  const helpers = dependencies('helpers');
  const emailModule = dependencies('email');
  const logger = dependencies('logger');
  const userModule = dependencies('user');
  const i18nLib = require('../../i18n')(dependencies);
  const linksHelper = require('../../helpers/links')(dependencies);

  return {
    uniqueId: 'linagora.esn.calendar.alarm.email',
    action: CONSTANTS.VALARM_ACTIONS.EMAIL,
    handle
  };

  function handle({ ics, attendee, eventPath }) {
    return Q.denodeify(userModule.findByEmail)(attendee)
      .then(user => {
        if (!user) {
          throw new Error(`User can not be found from email ${attendee}`);
        }

        return user;
      })
      .then(user => Q.all([
        Q.nfcall(helpers.config.getBaseUrl, null),
        i18nLib.getI18nForMailer(user),
        linksHelper.getEventDetails(eventPath),
        linksHelper.getEventInCalendar(ics)
      ]))
    .spread((baseUrl, i18nConf, eventDetailsLink, seeInCalendarLink) => {
      const event = jcalHelper.jcal2content(ics, baseUrl);
      const alarm = event.alarm;
      const message = {
        to: attendee,
        subject: `${i18nConf.translate('Notification')} : ${event.alarm.summary}`
      };

      return emailModule.getMailer().sendHTML(message, template, {
        content: {
          baseUrl,
          event,
          alarm,
          seeInCalendarLink
        },
        translate: i18nConf.translate
      });
    }).catch(err => {
      logger.error('Can not send alarm email', err);
      throw err;
    });
  }
};