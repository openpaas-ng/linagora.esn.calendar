'use strict';

var q = require('q');
var PATH = 'addressbooks';

module.exports = function(dependencies) {

  var logger = dependencies('logger');
  var pubsub = dependencies('pubsub').local;
  var contactModule = dependencies('contact');
  var proxy = require('../proxy')(dependencies)(PATH);
  var avatarHelper = require('./avatarHelper')(dependencies);

  function getContactUrl(req, bookId, contactId) {
    return [req.davserver, '/', PATH, '/', bookId, '/contacts/', contactId, '.vcf'].join('');
  }

  function getContactsFromDAV(req, res) {
    var options = {
      ESNToken: req.token && req.token.token ? req.token.token : ''
    };

    contactModule.lib.client(options)
    .addressbook(req.params.bookId)
    .contacts()
    .list(req.query)
    .then(function(data) {
      var body = data.body;
      var response = data.response;
      // inject text avatar if there's no avatar
      if (body && body._embedded && body._embedded['dav:item']) {
        q.all(body._embedded['dav:item'].map(function(davItem) {
          return avatarHelper.injectTextAvatar(req.params.bookId, davItem.data)
            .then(function(newData) {
              davItem.data = newData;
            });
        })).then(function() {
          return res.status(response.statusCode).json(body);
        });
      } else {
        return res.status(response.statusCode).json(body);
      }
    }, function(err) {
      res.status(500).json({
        error: {
          code: 500,
          message: 'Server Error',
          details: 'Error while getting contacts from DAV server'
        }
      });
    });
  }

  function getContact(req, res) {
    var options = {
      ESNToken: req.token && req.token.token ? req.token.token : ''
    };

    contactModule.lib.client(options)
    .addressbook(req.params.bookId)
    .contacts(req.params.contactId)
    .get()
    .then(function(data) {
      avatarHelper.injectTextAvatar(req.params.bookId, data.body).then(function(newBody) {
        return res.status(data.response.statusCode).json(newBody);
      });
    }, function(err) {
      res.status(500).json({
        error: {
          code: 500,
          message: 'Server Error',
          details: 'Error while getting contact from DAV server'
        }
      });
    });
  }

  function updateContact(req, res) {
    var headers = req.headers || {};
    headers.ESNToken = req.token && req.token.token ? req.token.token : '';

    var create = true;
    if (headers['if-match']) {
      create = false;
    }

    delete headers['if-match'];

    // Workaround to avoid frontend accidentally save text avatar to backend
    req.body = avatarHelper.removeTextAvatar(req.body);
    // Since req.body has been modified so contentLength will not be the same
    // Delete it to avoid issule relating to contentLength while sending request
    delete headers['content-length'];

    if (create) {
      contactModule.lib.client({ ESNToken: headers.ESNToken })
      .addressbook(req.params.bookId)
      .contacts(req.params.contactId)
      .create(req.body)
      .then(function(data) {
        avatarHelper.injectTextAvatar(req.params.bookId, req.body).then(function(newBody) {
          pubsub.topic('contacts:contact:add').publish({contactId: req.params.contactId, bookId: req.params.bookId, vcard: newBody, user: req.user});
        });
        res.status(data.response.statusCode).json(data.body);
      }, function(err) {
        res.status(500).json({
          error: {
            code: 500,
            message: 'Server Error',
            details: 'Error while creating contact on DAV server'
          }
        });
      });
    } else {
      return proxy.handle({
        onError: function(response, data, req, res, callback) {
          logger.error('Error while updating contact', req.params.contactId);
          return callback(null, data);
        },

        onSuccess: function(response, data, req, res, callback) {
          logger.debug('Success while updating contact %s', req.params.contactId);
          pubsub.topic('contacts:contact:update').publish({contactId: req.params.contactId, bookId: req.params.bookId, vcard: req.body, user: req.user});

          return callback(null, data);
        },
        json: true
      })(req, res);
    }

  }

  function deleteContact(req, res) {

    return proxy.handle({
      onError: function(response, data, req, res, callback) {
        logger.error('Error while deleting contact', req.params.contactId);
        return callback(null, data);
      },

      onSuccess: function(response, data, req, res, callback) {
        logger.debug('Success while deleting contact %s', req.params.contactId);

        pubsub.topic('contacts:contact:delete').publish({contactId: req.params.contactId, bookId: req.params.bookId});

        return callback(null, data);
      }
    })(req, res);
  }

  function defaultHandler(req, res) {
    proxy.handle()(req, res);
  }

  function searchContacts(req, res) {
    var ESNToken = req.token && req.token.token ? req.token.token : '';

    var options = {
      userId: req.user._id,
      search: req.query.search,
      limit: req.query.limit,
      page: req.query.page
    };
    contactModule.lib.client({ ESNToken: ESNToken })
      .addressbook(req.params.bookId)
      .contacts()
      .search(options)
      .then(function(data) {
        var json = {
          _links: {
            self: {
              href: req.originalUrl
            }
          },
          _total_hits: data.total_count,
          _current_page: data.current_page,
          _embedded: {
            'dav:item': []
          }
        };
        res.header('X-ESN-Items-Count', data.total_count);

        var dataCleanResult = [];
        data.results.map(function(result) {
          if (result.err) {
            logger.error('The search cannot fetch contact', result.contactId, result.err);
            return;
          }
          var statusCode = result.response.statusCode;
          if (statusCode < 200 || statusCode > 299) {
            logger.warn('The search cannot fetch contact', result.contactId, 'status code', statusCode);
            return;
          }
          dataCleanResult.push(result);
        });

        q.all(dataCleanResult.map(function(result, index) {
          return avatarHelper.injectTextAvatar(req.params.bookId, result.body)
            .then(function(newVcard) {
              json._embedded['dav:item'][index] = {
                _links: {
                  self: getContactUrl(req, req.params.bookId, result.contactId)
                },
                data: newVcard
              };
            });
        })).then(function() {
          return res.status(200).json(json);
        });
      }, function(err) {
        logger.error('Error while searching contacts', err);
        res.status(500).json({
          error: {
            code: 500,
            message: 'Server Error',
            details: 'Error while searching contacts'
          }
        });
      });
  }

  function getContacts(req, res) {
    if (req.query.search) {
      return searchContacts(req, res);
    }

    getContactsFromDAV(req, res);
  }

  return {
    getContactsFromDAV: getContactsFromDAV,
    getContact: getContact,
    getContacts: getContacts,
    searchContacts: searchContacts,
    updateContact: updateContact,
    deleteContact: deleteContact,
    defaultHandler: defaultHandler
  };

};