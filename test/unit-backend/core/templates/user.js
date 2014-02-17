'use strict';

var expect = require('chai').expect,
    mongoose = require('mongoose'),
    fs = require('fs');

describe('The User template module', function() {

  describe('If not configured', function() {

    before(function() {
      try {
        fs.unlinkSync(this.testEnv.tmp + '/db.json');
      } catch (e) {}
    });

    it('should not inject templates', function(done) {
      var core = require(this.testEnv.basePath + '/backend/core');
      var templates = core.templates;
      var configured = core.configured;
      expect(configured()).to.be.false;
      templates.inject(done);
    });
  });

  describe('If configured', function() {

    before(function() {
      this.testEnv.writeDBConfigFile();
    });

    it('should inject templates', function(done) {
      var core = require(this.testEnv.basePath + '/backend/core');
      var templates = core.templates;
      var configured = core.configured;
      expect(configured()).to.be.true;
      templates.inject(done);
    });

    after(function(done) {
      this.testEnv.removeDBConfigFile();
      mongoose.connect(this.testEnv.mongoUrl, function(err) {
        if (err) { return done(err); }
        mongoose.connection.db.dropDatabase(function(err, ok) {
          if (err) { return done(err); }
          mongoose.disconnect(done);
        });
      });
    });
  });

});
