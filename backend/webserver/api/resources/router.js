const express = require('express');

module.exports = dependencies => {
  const controller = require('./controller')(dependencies);
  const resourceMW = require('./middleware')(dependencies);
  const authorizationMW = dependencies('authorizationMW');
  const davMiddleware = dependencies('davserver').davMiddleware;
  const router = express.Router();

  router.get('/:resourceId/:eventId/participation',
    authorizationMW.requiresAPILogin,
    resourceMW.requiresStatusQueryParameter,
    resourceMW.load,
    resourceMW.requiresCurrentUserAsAdministrator,
    resourceMW.getTechnicalUserToken,
    davMiddleware.getDavEndpoint,
    controller.changeParticipation);

  return router;
};
