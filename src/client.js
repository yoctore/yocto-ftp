'use strict';

var Client        = require('ftp');
var _             = require('lodash');
var utils         = require('yocto-utils');
var Q             = require('q');
var joi           = require('joi');
var Readable      = require('stream').Readable;
var fs            = require('fs');
var moment        = require('moment');
var util          = require('util');
var EventEmitter  = require('events');

/**
 * Main FTPClient class. Provide FTP command to current client
 *
 * @param {Object} options options to use on current connection
 * @param {Sring} name current application name
 * @param {Object} logger current logger instance to use on main process
 */
function FTPClient (options, name, logger) {
  /**
   * Default client instance
   */
  this.client = new Client();

  /**
   * Default client name
   */
  this.name   = [ _.isString(name) && !_.isEmpty(name) ? name : [
    options.user, ':', options.password,
    '@', options.host, ':', options.port
  ].join(''), moment().format('YYYYMMDD-HHmmss') ].join('-');

  /**
   * Default connection state
   */
  this.connected = false;

  /**
   * Default logger instance to use
   */
  this.logger = logger;

  /**
   * Default options data
   */
  this.options = options;

  // watch greeting event
  this.client.on('greeting', function (message) {
    // log message
    this.logger.debug([ '[ FTPClient.on.greeting ] -', message ].join(' '));
  }.bind(this));

  // watch close event
  this.client.on('close', function () {
    // log message
    this.logger.debug([ '[ FTPClient.on.close ] -',
      'Connection was closed on',
        options.host
    ].join(' '));

    // change connected value
    this.connected = false;
  }.bind(this));

  // watch close event
  this.client.on('end', function () {
    // log message
    this.logger.debug([ '[ FTPClient.on.end ] -',
      'Connection was ended on',
        options.host
    ].join(' '));

    // change connected value
    this.connected = false;
  }.bind(this));
}

// Inherits event emitter to use emit event
util.inherits(FTPClient, EventEmitter);

/**
 * Connect current client with given option
 *
 * @return {Promise} default promise to catch on process
 */
FTPClient.prototype.connect = function () {
  // create an async process
  var deferred = Q.defer();

  // watch ready event
  this.client.on('ready', function () {
    // log message
    this.logger.debug([ '[ FTPClient.on.ready ] -',
      'Connection succeed on',
        this.options.host, 'with options :',
          utils.obj.inspect(_.map(this.options, function (option, key) {
            // this key is user or password ?
            if (_.includes([ 'user', 'password' ], key)) {
              // replace the value for the current log
              option = _.repeat('*', option.length);
            }
            // default statement
            return _.set({}, key, option);
          })), 'for connection :', this.name
    ].join(' '));

    // change connected value
    this.connected = true;

    // emit connected event
    return deferred.resolve();
  }.bind(this));

  // watch close event
  this.client.on('error', function (error) {
    // log message
    this.logger.error([ '[ FTPClient.on.error ] -',
      'An error occured on',
        this.options.host, ':', error
    ].join(' '));

    // reject with
    return deferred.reject(error);
  }.bind(this));

  // try to connect to the host
  this.client.connect(this.options);

  // return default promise
  return deferred.promise;
};

/**
 * Process a put request on FTP connection
 *
 * @param {String} source content to upload
 * @param {String} destination destination were upload must do
 * @param {String} compression set to true to use compression on transfert
 * @return {Promise} default promise to catch on process
 */
FTPClient.prototype.put = function (source, destination, compression) {
  // create an async process
  var deferred = Q.defer();

  // is connected ?
  if (!this.connected) {
    // log errpr
    this.logger.error([ '[ FTPClient.on.put ] -',
      'Cannot upload file on',
        this.options.host, 'client is not connected'
    ].join(' '));

    // reject
    return deferred.reject('Not connected');
  }

  // validate source data
  var result = joi.validate({
    source      : source,
    destination : destination,
    compression : compression
  }, joi.object().required().keys({
    source      : joi.string().required().empty(),
    destination : joi.string().required().empty(),
    compression : joi.boolean().optional().default(false)
  }));

  // is valid ?
  if (!_.isNull(result.error)) {
    // log errpr
    this.logger.error([ '[ FTPClient.on.put ] -',
      'Cannot upload file on',
        this.options.host, 'input is not valid :', result.error
    ].join(' '));

    // reject
    return deferred.reject(result.error);
  }

  // is a file or a directory
  fs.stat(result.value.source, function (err, stats) {
    // defined here our main stream
    var stream;
    // default content size
    var size     = 0;
    // process value for process % value
    var progress = 0;

    // has error ?
    if (err) {
      // warning message
      this.logger.warning([ '[ FTPClient.on.put ] - given source is not a file',
        'try to upload data from string'
      ].join(' '));

      // stream name too long
      if (err.code === 'ENAMETOOLONG') {
        // warning message
        this.logger.error([ '[ FTPClient.on.put ] - given source is too big.',
          'Maybe try to upload from a temporary file ? (', err.code, ')'
        ].join(' '));

        // reject with code
        return deferred.reject(err);
      }
    }

    // is not a file ?
    if (_.isUndefined(stats)) {
      // create new stream here
      stream = new Readable();
      // transport data to a readableStream
      stream.push(result.value.source);
      stream.push(null);
      // change size
      size = result.value.source.length;
    } else {
      // is a file ?
      if (stats && stats.isFile()) {
        // create a readable file streamn
        stream = fs.createReadStream(result.value.source);
        // change size value
        size = stats.size;
      }
      // if a directory ?
      if (stats && stats.isDirectory()) {
        // TODO after
        console.log('must use mkdir command');
      }
    }

    // debug message
    this.logger.debug([ '[ FTPClient.on.put.progress ] - File size is :',
      size, 'bytes' ].join(' '));

    // watch progress event
    stream.on('data', function (chunk) {
      progress += chunk.length;
      // build progress percent value
      var percent = Math.round((progress / size) * 100);
      // debug message
      this.logger.debug([ '[ FTPClient.on.put.progress ] -',
        [ 'uploading, progress is :',
          percent, '%' ].join(' ')
      ].join(' '));

      // emit progress event
      this.emit('progress', {
        percent       : percent,
        totalBytes    : size,
        currentBytes  : progress
      });
    }.bind(this));

    // try to put data on ftp client
    this.client.put(stream, result.value.destination, result.value.compression, function (error) {
      // has error ?
      if (error) {
        // debug message
        this.logger.error([ '[ FTPClient.on.put ] - Cannot upload',
          stats && stats.isFile() ? 'file' : 'data', 'on',
          [ this.options.host, result.value.destination ].join('/'),
          ':', error ].join(' '));
        // reject with error
        return deferred.reject(error);
      }

      // debug message
      this.logger.debug([ '[ FTPClient.on.put ] -',
        'uploaded', stats && stats.isFile() ? 'file' : 'data', 'on',
        [ this.options.host, result.value.destination ].join('/'),
        'succeed' ].join(' '));
      // all is ok
      return deferred.resolve();
    }.bind(this));
  }.bind(this));

  // return default promise
  return deferred.promise;
};

/**
 * Process a single put request with auto connect/disconnect
 *
 * @param {String} source content to upload
 * @param {String} destination destination were upload must do
 * @param {String} compression set to true to use compression on transfert
 * @return {Promise} default promise to catch on process
 */
FTPClient.prototype.fastPut = function (source, destination, compression) {
  // create an async process
  var deferred = Q.defer();

  // debug message
  this.logger.debug([ '[ FTPClient.on.putFast ] -',
    'Try to run a fast put request' ].join(' '));

  // is connected ?
  this.connect().then(function () {
    // try to put data
    this.put(source, destination, compression).then(function (success) {
      // try to close connection
      this.gracefullDisconnect();
      // resolve with success value
      return deferred.resolve(success);
    }.bind(this)).catch(function (error) {
      // try to close connection
      this.gracefullDisconnect();
      // reject with error
      return deferred.reject(error);
    }.bind(this));
  }.bind(this)).catch(function (error) {
    // try to close connection
    this.gracefullDisconnect();
    // reject with error
    return deferred.reject(error);
  }.bind(this));

  // return default promise
  return deferred.promise;
};

/**
 * Disconnect current client in hard mode
 *
 * @return {Void} nothing to return
 */
FTPClient.prototype.hardDisconnect = function () {
  // debug message
  this.logger.debug([ '[ FTPClient.on.hardDisconnect ] -',
    'A hard disconnection was asked.' ].join(' '));

  // try to connect properly
  return this.client.destroy();
};

/**
 * Disconnect current client in gracefull mode
 *
 * @return {Void} nothing to return
 */
FTPClient.prototype.gracefullDisconnect = function () {
  // debug message
  this.logger.debug([ '[ FTPClient.on.gracefullDisconnect ] -',
    'A gracefull disconnection was asked.' ].join(' '));
  // try to connect properly
  return this.client.end();
};

// Default export
module.exports = FTPClient;
