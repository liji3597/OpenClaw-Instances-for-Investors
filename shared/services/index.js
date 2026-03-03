const userContext = require('./user-context');
const strategyService = require('./strategy-service');
const alertService = require('./alert-service');

module.exports = {
    ...userContext,
    ...strategyService,
    ...alertService,
};
