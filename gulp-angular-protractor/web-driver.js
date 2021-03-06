/**
 * Utility module to manage the WebDriver
 *
 * @author Julien Roche
 * @version 0.4.0
 * @since 0.0.1
 */

'use strict';

// Imports
const gutil = require('gulp-util');
const url = require('url');
const childProcess = require('child_process');
const protractorUtils = require('./protractor-utils');

// Constants & variables
const PLUGIN_NAME = require('./constants.json').PLUGIN_NAME;
const IS_WINDOWS = /^win/.test(process.platform);
const WIN_COMMAND_EXTENSION = IS_WINDOWS ? '.cmd' : '';
const COMMAND_RELATIVE_PATH = IS_WINDOWS ? '' : './';
const PROTRACTOR_COMMAND = 'protractor' + WIN_COMMAND_EXTENSION;

const SELENIUM_PID = ' seleniumProcess.pid';
const WEB_DRIVER_LOG_STARTED = 'Started org.openqa.jetty.jetty.Server';
const WEB_DRIVER_LOG_STARTED_NEW = 'Selenium Server is up and running';
const WEB_DRIVER_LOG_STOPPED = 'Command request: shutDownSeleniumServer';
const WEB_DRIVER_COMMAND = 'webdriver-manager' + WIN_COMMAND_EXTENSION;
const WEB_DRIVER_START_COMMAND = 'start';

module.exports = function (protractorModulePath) {
    let protractorDirToUse = protractorModulePath ? protractorModulePath : protractorUtils.getProtractorDir();

    return {
        /**
         * Default WebDriver URL
         *
         * @constant
         * @static
         */
        'DEFAULT_WEB_DRIVER_URL': 'http://localhost:4444/wd/hub',


        /**
         * Execute the protractor engine
         *
         * @method
         * @static
         * @param {string[]} args
         * @param {string} binary
         * @param {string[]} binaryArgs
         * @returns {Object}
         */
        'runProtractor': function (args, binary, binaryArgs) {
            var allArgs = (binaryArgs || []).concat(args);
            return childProcess.spawn(binary ? binary : COMMAND_RELATIVE_PATH + PROTRACTOR_COMMAND,
            	allArgs,
            	{
                	'stdio': 'inherit',
	                'env': process.env,
    	            'cwd': protractorDirToUse
	            });
        },

        /**
         * Execute the protractor engine
         *
         * @method
         * @static
         * @param {string[]} args
         * @param {string} binary
         * @param {string[]} binaryArgs
         * @param {Function} callback
         */
        'runProtractorAndWait': function (args, binary, binaryArgs, callback) {
            let child = this
                .runProtractor(args, binary, binaryArgs)
                .on('exit', function (code) {
                    if (child) {
                        child.kill();
                    }

                    if (callback) {
                        callback(code);
                    }
                });
        },

        /**
         * @callback WebDriverService~stopServer
         */

        /**
         * Start the WebDriver server
         *
         * @method
         * @static
         * @param {Function} callback
         * @param {boolean} [verbose=true]
         * @param {Object} [startOptions]
         * @returns {WebDriverService~stopServer} Function to stop the server
         */
        'webDriverStandaloneStart': function (callback, verbose, startOptions) {
            gutil.log(PLUGIN_NAME + ' - Webdriver standalone server will be started');

            let callbackWasCalled = false;
            let logOutput = true;
            let command;
            let seleniumPid = null;

            function _interceptLogData(data) {
                let dataString = data.toString();

                if (logOutput && verbose) {
                    gutil.log(dataString);
                }

                if (dataString.indexOf(WEB_DRIVER_LOG_STARTED_NEW) >= 0 || dataString.indexOf(WEB_DRIVER_LOG_STARTED) >= 0) {
                    gutil.log(PLUGIN_NAME + ' - Webdriver standalone server is started');
                    callbackWasCalled = true;
                    logOutput = false;
                    callback();

                } else if (dataString.indexOf(WEB_DRIVER_LOG_STOPPED) >= 0) {
                    logOutput = true;

                    if (verbose) {
                        gutil.log(dataString);
                    }

                } else if (dataString.indexOf(SELENIUM_PID) >= 0) {
                    seleniumPid = parseInt(dataString.split(SELENIUM_PID)[1].substr(1).trim(), 10);
                    gutil.log(PLUGIN_NAME + ' - Webdriver standalone server PID is detected:' + seleniumPid);
                }
            }

            command = childProcess.spawn(
                COMMAND_RELATIVE_PATH + WEB_DRIVER_COMMAND,
                [WEB_DRIVER_START_COMMAND].concat(startOptions && startOptions.args ? startOptions.args : []),
                {
                    'cwd': protractorDirToUse
                }
            );

            command.once('close', function (errorCode) {
                gutil.log(PLUGIN_NAME + ' - Webdriver standalone server will be closed');

                if (!callbackWasCalled) {
                    callback(errorCode);
                }
            });

            command.stderr.on('data', _interceptLogData);
            command.stdout.on('data', _interceptLogData);

            return function () {
                if (seleniumPid) {
                    process.kill(seleniumPid, 'SIGINT');
                }
            };
        },

        /**
         * Update the webDriver connector
         *
         * @method
         * @static
         * @params {{ 'browsers' } | Function} optsOrCallback
         * @param {Function} cb
         */
        'webDriverUpdate': function (optsOrCallback, cb) {
            let callback = cb ? cb : optsOrCallback;
            let options = cb ? optsOrCallback : null;
            let args = ['update', '--standalone'];
            let browsers = ['chrome'];

            if (options) {
                if (options.browsers && options.browsers.length > 0) {
                    browsers = options.browsers;
                }

                browsers.forEach(function (element) {
                    args.push('--' + element);
                });

                if (options.args) {
                    args = args.concat(options.args);
                }
            }

            childProcess
                .spawn(
                    COMMAND_RELATIVE_PATH + WEB_DRIVER_COMMAND,
                    args,
                    {
                        'cwd': protractorDirToUse,
                        'stdio': 'inherit'
                    }
                )
                .once('close', callback);
        },

        /**
         * Update and start the webDriver connector
         *
         * @method
         * @static
         * @param {Function} callback
         * @param {boolean} [verbose=true]
         * @param {Object} [updateOptions]
         * @param {Object} [startOptions]
         * @returns {Promise.<WebDriverService~stopServer>}
         */
        'webDriverUpdateAndStart': function (callback, verbose, updateOptions, startOptions) {
            gutil.log(PLUGIN_NAME + ' - Webdriver standalone will be updated');

            return new Promise((resolve) => {
                this.webDriverUpdate(updateOptions, () => {
                    gutil.log(PLUGIN_NAME + ' - Webdriver standalone is updated');
                    resolve(this.webDriverStandaloneStart(callback, verbose, startOptions));
                });
            });
        }
    };
};
