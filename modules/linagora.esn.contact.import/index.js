'use strict';

var AwesomeModule = require('awesome-module');
var Dependency = AwesomeModule.AwesomeModuleDependency;

var importContactModule = new AwesomeModule('linagora.esn.contact.import', {
  dependencies: [
    new Dependency(Dependency.TYPE_NAME, 'linagora.esn.core.logger', 'logger'),
    new Dependency(Dependency.TYPE_NAME, 'linagora.esn.contact', 'contact'),
    new Dependency(Dependency.TYPE_NAME, 'linagora.esn.core.webserver.wrapper', 'webserver-wrapper'),
    new Dependency(Dependency.TYPE_NAME, 'linagora.esn.core.esn-config', 'esn-config'),
    new Dependency(Dependency.TYPE_NAME, 'linagora.esn.core.pubsub', 'pubsub'),
    new Dependency(Dependency.TYPE_NAME, 'linagora.esn.core.webserver.middleware.token', 'tokenMW'),
    new Dependency(Dependency.TYPE_NAME, 'linagora.esn.core.webserver.middleware.authorization', 'authorizationMW')
  ],
  states: {
    lib: function(dependencies, callback) {
      var libModule = require('./backend/lib')(dependencies);
      return callback(null, {lib: libModule});
    },

    deploy: function(dependencies, callback) {
      var webserver = require('./backend/webserver')(dependencies);
      var api = require('./backend/webserver/api')(dependencies, this.lib);

      var app = webserver.getRootApp();
      app.use('/api', api);

      var frontendModules = [
        'app.js',
        'constants.js',
        'services.js'
      ];

      var webserverWrapper = dependencies('webserver-wrapper');
      webserverWrapper.injectAngularModules('import', frontendModules, 'linagora.esn.contact.import', ['esn']);
      webserverWrapper.addApp('import', app);

      return callback();
    },

    start: function(dependencies, callback) {
      callback();
    }
  }
});

module.exports = importContactModule;