/**
 * Sample App
 * Each Application has a quick-getstarted panel to download 
 * sample applications for backend and client. The source codes
 * are stored in server/public. When the downloading happens, 
 * the credentials are injected into the source codes and compress
 * into zip format.
 */

var Application = require('../application/application.model').model;
var _ = require('lodash');
var fs = require('fs');
var archiver = require('archiver');
var path = require('path');

exports.download = function (req, res) {
  var appId = req.params['appId'];
  var type = req.params['type'];
  if (appId && type && _.includes(['nodejs', 'ionic'], type)) {
    Application.findOne(function (err, app) {

      if (err)
        return res.json({
          rc: 2,
          error: err
        });

      if (!app)
        return res.json({
          rc: 3,
          error: 'Appliction not exist.'
        })

      if (!_hasPermission(req, app))
        return res.json({
          rc: 4,
          error: 'Permission denied.'
        });

      _handleOnBehalf(res, app, type);
    });
  } else {
    res.json({
      rc: 0,
      error: 'Bad parameters.'
    });
  }
}

/**
 * handle each downloads on behalf.
 * @param  {[type]} res   [description]
 * @param  {[type]} appId [description]
 * @param  {[type]} type  [description]
 * @return {[type]}       [description]
 */
function _handleOnBehalf(res, app, type) {
  switch (type) {
  case 'nodejs':
    _nodejs(res, app);
    break;
  case 'ionic':
    _ionic(res, app);
    break;
  default:
    res.send('In progress');
    break;
  }
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

  // http://stackoverflow.com/questions/13104690/nodejs-mongodb-object-id-to-string
  if (resource.ownerId === req.userInfo.id) {
    return true;
  }

  return false;
}

/**
 * download the nodejs backend
 * @param  {[type]} appId [description]
 * @return {[type]}       [description]
 */
function _nodejs(res, app) {
  // first, compress the sample app file
  // creating archives
  logger.debug('Download nodejs sample app ...');

  try {
    var archive = archiver('zip');
    archive.on('error', function (err) {
      logger.error('Error building zip: ' + err);
      res.status(500).send('Error downloading zip')
    });

    res.setHeader('Content-disposition', 'attachment; filename=nodejs-backend.zip');
    res.setHeader('Content-type', 'application/octet-stream');
    archive.pipe(res);
    _zipDir(path.join(__dirname, '../../public/sampleapps/nodejs-backend'), archive, 'nodejs-backend');
    archive.append(JSON.stringify(app, null, 4), {
      name: '/nodejs-backend/app.json'
    });
    archive.finalize();
  } catch (err) {
    logger.error('Error generating zip: ' + err);
    res.status(500).send('Error downloading zip')
  }
}

/**
 * download the ionic client
 * @param  {[type]} appId [description]
 * @return {[type]}       [description]
 */
function _ionic(res, app) {
  // first, compress the sample app file
  // creating archives
  logger.debug('Download ionic sample app ...');

  try {
    var archive = archiver('zip');
    archive.on('error', function (err) {
      logger.error('Error building zip: ' + err);
      res.status(500).send('Error downloading zip')
    });

    res.setHeader('Content-disposition', 'attachment; filename=ionic-client.zip');
    res.setHeader('Content-type', 'application/octet-stream');
    archive.pipe(res);
    _zipDir(path.join(__dirname, '../../public/sampleapps/ionic-client'), archive, 'ionic-client');
    archive.append(JSON.stringify(app, null, 4), {
      name: '/ionic-client/app.json'
    });
    archive.finalize();
  } catch (err) {
    logger.error('Error generating zip: ' + err);
    res.status(500).send('Error downloading zip')
  }
}

/**
 * [_zipDir description]
 * @param  {[type]} dir        [description]
 * @param  {[type]} zip        [description]
 * @param  {[type]} zipBaseDir [description]
 * @param  {[type]} ignore     [description]
 * @param  {[type]} baseDir    [description]
 * @return {[type]}            [description]
 */
function _zipDir(dir, zip, zipBaseDir, ignore, baseDir) {
  // _zipDir('./static/app/web', archive, '/www', './static/app/web/config.xml');
  if (!baseDir) {
    baseDir = dir;
  }
  var files = fs.readdirSync(dir);
  for (var i in files) {
    if (!files.hasOwnProperty(i)) {
      continue;
    }
    var name = dir + '/' + files[i];
    if (fs.statSync(name).isDirectory()) {
      _zipDir(name, zip, zipBaseDir, ignore, baseDir);
    } else {
      if (name != ignore) {
        var zipLocation = zipBaseDir + name.substring(baseDir.length);
        zip.file(name, {
          name: zipLocation
        });
      }
    }
  }
}