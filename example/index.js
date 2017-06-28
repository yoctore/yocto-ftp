'use strict';

var ftp   = require('../src/')();
var path  = require('path');
var fs    = require('fs');

// create new single connection
var connection = ftp.createConnection({
  host      : process.env.FTP_HOST || 'ftp.dlptest.com',
  user      : process.env.FTP_USER || 'dlpuser@dlptest.com',
  password  : process.env.FTP_PASSWORD || 'KZhfl2N53lsZM7E8'
});

// source
var sourcePath  = 'example';
var filename    = 'test.txt';

// destination
var filePath    = path.normalize([ process.cwd(), sourcePath, filename ].join('/'));
var destination = 'destination.txt';
var isFile = true;
var fast   = false;
var put    = false;

/**
 * We can here catch the progress event during upload.
 */
connection.on('progress', function (progress) {
  console.log(progress);
});   

if (!fast) {
  /**
   * He will be the classic mode. We use same connection to put multiple files
   * This mode don't close the current connection you must close it manually.
   */
  // is connected ?
  connection.connect().then(function () {
    console.log('connected');
    if (put) {
      // try to put data
      connection.put(isFile ? filePath : fs.readFileSync(filePath).toString(), destination).then(function () {
        
      }).catch(function (error) {
        /**
         * You can choose between hard disconnect ant gracefull disconnect
         */
        //connection.hardDisconnect();
        connection.gracefullDisconnect();
      });
    } else {
      connection.gracefullDisconnect();      
    }
  }).catch(function (error) {
    console.log('connect error :', error);
  });
} else {
  /**
   * He will be the single mode.
   * This method do : connect, put, disconnect 
   */
  if (put) {
    connection.fastPut(isFile ? filePath : fs.readFileSync(filePath).toString(), destination).then(function () {
      console.log('fast put success');
    }).catch(function (error) {
      console.log('fast put error : ', error);
    }); 
  }
}