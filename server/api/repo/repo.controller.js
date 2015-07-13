/**
 * Controller of repo to process req and res
 */

'use strict';

module.exports = RepoController;

var _ = require('lodash');
var shortid = require('shortid');
var EventProxy = require('eventproxy');
var roles = require('../../lib/auth/roles');
var User = require('../user/user.model').model;
var Shape = require('../shape/shape.model');
var Repo = require('./repo.proxy');

/**
 * RepoController constructor
 * @classdesc Controller that handles /api/repos route requests
 * for the repo api.
 * Uses the 'repoId' parameter and the 'repoParam' request property
 * to operate with the [main repo API Model]{@link repo:model~Repo} model.
 * @constructor
 * @see application:model~Repo
 */
function RepoController(router) {

  // modify select only properties
  // this.select = ['-__v'];

  // omit properties on update
  // this.omit = ['hashedPassword'];

  // property to return (maybe a virtual getter of the model)
  // this.defaultReturn = 'profile';
}

// define properties for the ApplicationController here
RepoController.prototype = {

  /**
   * Set our own constructor property for instanceof checks
   * @private
   */
  constructor: RepoController,
  // Enable GET /api/repos
  index: _index,
  // Enable POST /api/repos/:repoName
  post: _post,
  // Enable GET /api/repos/:repoName
  get: _get,
  // Enable PUT /api/repos/:repoName/:uid
  put: _put,
  // Enable DELETE /api/repos/:repoName/:uid
  delete: _delete
}

/**
 * get dave's repo array
 * @param  {[type]} req [description]
 * @param  {[type]} res [description]
 * @return {[type]}     [description]
 */
function _index(req, res) {
  // {"_id":"5596b9bd30e816d8f84bba33","role":"admin","iat":1436510300,"exp":1436528300}
  // logger.debug('get req.user %j', req.user);
  if (req.userInfo.repos && req.userInfo.repos.length > 0) {
    res.json({
      rc: 1,
      data: req.userInfo.repos
    });
  } else {
    res.json({
      rc: 0,
      data: 'User does not have any repo yet.'
    });
  }
}

/**
 * [_get description]
 * @param  {[type]} req [description]
 * @param  {[type]} res [description]
 * @return {[type]}     [description]
 */
function _get(req, res) {
  res.send('oks');
}

/**
 * [_get description]
 * @param  {[type]} req [description]
 * @param  {[type]} res [description]
 * @return {[type]}     [description]
 */
function _delete(req, res) {
  res.send('ok');
}

/**
 * [_get description]
 * @param  {[type]} req [description]
 * @param  {[type]} res [description]
 * @return {[type]}     [description]
 */
function _put(req, res) {
  var repoName = req.params['repoName'];
  var repoUId = req.params['uid'];
  var repoBody = req.body;

  logger.debug('%s %s update. %j', repoName, repoUId, repoBody);

  var ep = new EventProxy();

  ep.all('doc', function (doc) {
    res.json({
      rc: 0,
      data: doc
    });
  });

  ep.fail(function (err) {
    logger.error(err);
    res.json({
      rc: 1,
      error: err
    });
  });

  if (!(repoName || repoUId || repoBody)) {
    return ep.throw(new Error('Bad parameters.'));
  }

  Shape.findOne({
    name: repoName
  }).then(function (doc) {
    if (!doc)
      return ep.throw(new Error('Repo not exist.'));

    if (_hasPermission(req, doc)) {
      var M = Repo.getModel(doc);
      _updateRepoRecord(ep, doc, M, repoUId, repoBody);
    } else {
      return ep.throw(new Error('Permission denied.'));
    }
  }, function (err) {
    ep.throw(err);
  });

}

/**
 * Post new record into a repo.
 * Note, uid is created, also support other properties in mSchema.
 * @param  {[type]} req [description]
 * @param  {[type]} res [description]
 * @return {[type]}     [description]
 */
function _post(req, res) {
  var repoName = req.params['repoName'];
  var repoBody = req.body;

  var ep = new EventProxy();

  ep.all('doc', function (doc) {
    logger.debug('%s new doc created. %j', repoName, doc);
    res.json({
      rc: 1,
      data: doc
    });
  });

  ep.fail(function (err) {
    logger.error(err);
    res.json({
      rc: 0,
      error: err
    })
  });

  if (!repoName) {
    return ep.throw(new Error('Repo name is required.'));
  }

  Shape.findOne({
      name: repoName
    })
    .then(function (doc) {
      logger.log(repoName, doc);
      if (!doc) {
        return new Error('Requested repo not exist.');
      } else {
        return doc;
      }
    }, function (err) {
      ep.throw(err);
    })
    .then(function (doc) {
      logger.log(doc);
      // check permission
      if (_hasPermission(req, doc)) {
        var M = Repo.getModel(doc);
        var m = new M();
        var keys = _.keys(repoBody);
        _.each(keys, function (key) {
          m[key] = repoBody[key];
        });
        m.uid = shortid.generate();
        m.save(function (err, result) {
          if (err) {
            ep.throw(err);
          } else {
            var resultJSON = result.toJSON();
            delete resultJSON.__v;
            delete resultJSON._id;
            ep.emit('doc', resultJSON);
          }
        });
      } else {
        ep.throw(new Error('Permission deny.'));
      }
    }, function (err) {
      ep.throw(err);
    });

}

/**
 * check if user hasPermission
 * @param  {[type]}  req [description]
 * @param  {[type]}  res [description]
 * @return {Boolean}     [description]
 */
function _hasPermission(req, resource) {
  if (req.userInfo.role == 'root') {
    return true;
  }

  // assign the requested resource into req before check.
  // http://stackoverflow.com/questions/11637353/comparing-mongoose-id-and-strings
  // _id and ownerId are object.
  // if (resource.ownerId.equals(req.userInfo._id)) {
  if (resource.ownerId.equals(req.userInfo.ownerId)) {
    return true;
  }

  return false;
}

/**
 * update record in a repo by uid
 * @param  {[type]} ep    ep.emit(doc) to return succ with res, ep.throw to send err with res.
 * @param  {[type]} shape
 * @param  {[type]} model [description]
 * @param  {[type]} uid   [description]
 * @param  {[type]} data  desired data.
 * @return {[type]}       [description]
 */
function _updateRepoRecord(ep, shape, model, uid, data) {

  logger.debug('uid %s', uid);
  model.findOne({
      uid: uid
    })
    .then(function (doc) {
      if (!doc) {
        logger.error(err);
        return ep.throw(new Error('Can not find record with this uid.'));
      }
      delete data._id;
      delete data.__v;
      delete data.uid;

      // #TODO delete disappeared keys
      var target = _.merge(doc.toJSON(), data);
      var keys = _.keys(target);
      _.each(keys, function (k) {
        doc[k] = target[k];
      });
      doc.save(function (err, result) {
        if (err)
          return ep.throw(err);
        var resultJSON = result.toJSON();
        delete resultJSON.__v;
        delete resultJSON._id;
        ep.emit('doc', resultJSON);
      });
    }, function (err) {
      logger.error(err);
      return ep.throw(new Error('DB error.'));
    });
}
