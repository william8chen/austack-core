/**
 * Module for setting up the authentication service functions.
 * Utility and service methods for the authentication and authorization services.
 * @module {object} auth:service
 */
'use strict';

var mongoose = require('mongoose');
var jwt = require('jsonwebtoken');
var expressJwt = require('express-jwt');
var compose = require('composable-middleware');
var roles = require('./roles');
var config = require('../../config');
var contextService = require('request-context');
var Application = require('../../api/application/application.model').model;

var secretCallback = function (req, payload, done) {
  if (payload._id) {
    return done(null, config.secrets.session);
  }

  // jwt for application: eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjbGllbnRJZCI6IjdlMzc0NDYxNDdiYzUyMjRmYTQyMDcyNSIsIm93bmVySWQiOiI1NTk2YjliZDMwZTgxNmQ4Zjg0YmJhMzUiLCJpYXQiOjE0MzY3MjQzMTMsImV4cCI6MTQzNjc0MjMxM30.s8JjLhiCInZrjaEcS6veh-wv_jw8VHp0YJL7lO5ebMY
  if (payload.clientId && payload.ownerId) {
    //get clientSecret From application collection
    Application.findOne({
      clientId: payload.clientId,
      ownerId: payload.ownerId
    }, function (err, doc) {
      if (err || !doc) {
        return done(err);
      }
      var secret = doc.clientSecret;
      done(null, secret);
    });
  }

  // data.getTenantByIdentifier(issuer, function (err, tenant) {
  //   if (err) {
  //     return done(err);
  //   }
  //   if (!tenant) {
  //     return done(new Error('missing_secret'));
  //   }

  //   var secret = utilities.decrypt(tenant.secret);
  //   done(null, secret);
  // });
};

var validateJwt = expressJwt({
  secret: secretCallback
    // secret: config.secrets.session
});

module.exports = {

  /**
   * Middleware for checking for valid authentication
   * @see {auth:service~isAuthenticated}
   */
  isAuthenticated: isAuthenticated,

  /**
   * Middleware for checking for a minimum role
   * @see {auth:service~hasRole}
   */
  hasRole: hasRole,

  /**
   * Middleware for add the current user object to the request context as the given name
   * @see {auth:service~addAuthContex}
   * @type {Function}
   */
  addAuthContext: addAuthContext,

  /**
   * Sign a token with a user id
   * @see {auth:service~signToken}
   */
  signToken: signToken,
  signTokenForApplication: signTokenForApplication,

  /**
   * Set a signed token cookie
   * @see {auth:service~setTokenCookie}
   */
  setTokenCookie: setTokenCookie,

  /**
   * Utility functions for handling user roles
   * @type {Object}
   */
  roles: roles

};

/**
 * Attaches the user object to the request if authenticated otherwise returns 403
 * @return {express.middleware}
 */
function isAuthenticated() {
  return compose()
    // Validate jwt
    .use(function (req, res, next) {
      // allow access_token to be passed through query parameter as well
      if (req.query && req.query.hasOwnProperty('access_token')) {
        req.headers.authorization = 'Bearer ' + req.query.access_token;
      }
      validateJwt(req, res, next);
    })

  .use(function (req, res, next) { // Attach userInfo to request
    // return if this request has already been authorized
    if (req.hasOwnProperty('userInfo')) {
      return next();
    }

    // load user model on demand
    var User = require('../../api/user/user.model').model;

    logger.log(req.user);

    // read the user id from the token information provided in req.user
    User.findOne({
      _id: req.user._id,
      active: true
    }, function (err, user) {
      if (err) {
        return next(err);
      }

      if (!user) {
        res.unauthorized();
        return next();
      }

      // set the requests userInfo object as the authenticated user
      req.userInfo = user;
      next();
    });
  });
}

/**
 * Checks if the user role meets the minimum requirements of the route, sets
 * the response status to FORBIDDEN if the requirements do not match.
 * @param {String} roleRequired - Name of the required role
 * @return {ServerResponse}
 */
function hasRole(roleRequired) {
  if (!roleRequired) {
    throw new Error('Required role needs to be set');
  }

  return compose()
    .use(isAuthenticated())
    .use(function meetsRequirements(req, res, next) {
      if (roles.hasRole(req.userInfo.role, roleRequired)) {
        next();
      } else {
        res.forbidden();
      }
    });
}

/**
 * Returns a jwt token signed by the app secret
 * @param {String} id - Id used to sign a token
 * @return {String}
 */
function signToken(id, role) {
  return jwt.sign({
    _id: id,
    role: role
  }, config.secrets.session, {
    expiresInMinutes: 60 * 5
  });
}

function signTokenForApplication(clientId, ownerId) {
  return jwt.sign({
    clientId: clientId,
    // role: 'admin',
    ownerId: ownerId
  }, config.secrets.session, {
    expiresInMinutes: 60 * 5
  });
}

/**
 * Set token cookie directly for oAuth sreturn trategies. Use the user object of the request to
 * identify a valid session. Set the signed cookie to the request and redirect to '/'.
 * @param {http.IncomingMessage} req - The request message object
 * @param {ServerResponse} res - The outgoing response object the cookie is set to
 * @return {ServerResponse}
 */
function setTokenCookie(req, res) {
  if (!req.userInfo) {
    return res.notFound({
      message: 'Something went wrong, please try again.'
    });
  }

  var token = signToken(req.userInfo._id, req.userInfo.role);
  res.cookie('token', JSON.stringify(token));
  res.redirect('/');
}

/**
 * Add the current user object to the request context as the given name
 *
 * @param {http.IncomingMessage} req - The request message object
 * @param {ServerResponse} res - The outgoing response object
 * @param {function} next - The next handler callback
 */
function addAuthContext(namespace) {
  if (!namespace) {
    throw new Error('No context namespace specified!');
  }

  return function addAuthContextMiddleWare(req, res, next) {
    contextService.setContext(namespace, req.userInfo);
    next();
  };
}
