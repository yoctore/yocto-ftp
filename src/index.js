'use strict';

var logger = require('yocto-logger');
var Client = require('./client');
var joi    = require('joi');
var _      = require('lodash');

/**
 * Main YoctoFTP class. Provide a wrapper to use an FTP client
 *
 * @param {Object} logger current logger instance to use on main process
 */
function YFtp (logger) {
  /**
   * Default logger instance to use
   */
  this.logger = logger;
}

/**
 * Create an instance of FTP connection
 *
 * @param {Object} options options to use on ftp connection
 * @param {String} name a connection name
 */
YFtp.prototype.createConnection = function (options, name) {
  /**
   * Default options schema
   */
  var schema = joi.object().optional().keys({
    host          : joi.string().required().empty(),
    port          : joi.number().optional().min(0).default(21),
    secureOptions : joi.object().optional().unknown(),
    user          : joi.string().optional().empty().default('anonymous'),
    password      : joi.string().optional().empty().default('anonymous@'),
    connTimeout   : joi.number().optional().min(0).default(10000),
    pasvTimeout   : joi.number().optional().min(0).default(10000),
    keepalive     : joi.number().optional().min(0).default(10000)
  }).default({
    host        : 'localhost',
    post        : 21,
    user        : 'anonymous',
    password    : 'anonymous@',
    connTimeout : 10000,
    pasvTimeout : 10000,
    keepalive   : 10000
  });

  // validate
  var result = joi.validate(options, schema);

  // has error ?
  if (!_.isNull(result.error)) {
    // throw an exception
    throw [ 'Invalid schema given cannot create',
            'a new connection with given options.' ].join(' ');
  }

  // default statement
  return new Client(result.value, name, logger);
};

// Default export
module.exports = function (clogger) {
  // default statement
  return new YFtp(clogger || logger);
};
