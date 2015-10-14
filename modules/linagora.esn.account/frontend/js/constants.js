'use strict';

angular.module('linagora.esn.account')
  .constant('FAB_ANCHOR_POINT', 'accounts-item-anchorpoint')
  .constant('OAUTH_DEFAULT_MESSAGES', {
    denied: 'You denied access to your account',
    error: 'An error occured when trying to access to your account',
    success: 'Successful access to your account'
  })
  .constant('OAUTH_UNKNOWN_MESSAGE', 'Unknown OAuth message')
  .constant('SUPPORTED_ACCOUNTS', ['oauth']);

