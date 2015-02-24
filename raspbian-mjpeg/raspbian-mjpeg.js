/*
 * Config options
 * - fps: 25;
 * - mJpegFilePath: string; 
 * - statusFilePath: string; 
 * - fifoFilePath: string; 
 */
if (typeof String.prototype.endsWith !== 'function') {
    String.prototype.endsWith = function (suffix) {
        return this.indexOf(suffix, this.length - suffix.length) !== -1;
    };
}

var fs = require('fs'),
    exec = require('child_process').exec,
    _ = require('underscore'),
    VError = require('verror'),
    now = require("performance-now");


var raspbianMJpeg = function (options) {
    var activeStatus = null,
        onStatusChangeCallbacks = [],
        onPreviewCallbacks = [],
        previewImageTimeoutHandle = null,
        baseOptions = {
            fps: 25,
            mJpegFilePath: null,
            statusFilePath: null,
            fifoFilePath: null,
            mediaFolder: null
        },
        createdFiles = [];

    options = _.extend(baseOptions, options);

    function startPreviewImageUpdate(duration) {
        stopPreviewImageUpdate();
        previewImageTimeoutHandle = setTimeout(updatePreviewImage, duration);
    }
    
    function stopPreviewImageUpdate() {
        clearTimeout(previewImageTimeoutHandle);
    }
    
    function updatePreviewImage() {
        var start = now(),
            data = fs.readFileSync(options.mJpegFilePath),
            end;
    
        _.each(onPreviewCallbacks, function(callbackFn) {
            callbackFn(data);
        });

        data = null;

        end = now();

        startPreviewImageUpdate(Math.max(0, (1000 / options.fps) - (end - start)));
    }
    
    function updateStatus() {
        var newStatus = fs.readFileSync(options.statusFilePath, 'utf8');
        
        if (newStatus != '' && newStatus != activeStatus) {
            activeStatus = newStatus;

            updatePreviewWorkerState();

            _.each(onStatusChangeCallbacks, function(callbackFn) {
                callbackFn(newStatus);
            });
        }
    }
    
    function updatePreviewWorkerState() {
        if (activeStatus == 'halted') {
            stopPreviewImageUpdate();
        } 
        else {
            if (onPreviewCallbacks.length == 0) {
                stopPreviewImageUpdate();
            } 
            else {
                updatePreviewImage();
            }
        }
    }

    function addCommand(command) {
        exec('echo "' + command + '" > FIFO', function (error, stdout, stderr) {
            //console.log('stdout: ' + stdout);
            //console.log('stderr: ' + stderr);
            if (error !== null) {
                console.log('exec error: ' + error);
            }
        });
    }

    if (!_.isObject(options)) {
        throw new TypeError("Missing configuration object for raspbian-mjpeg");
    }
    
    if (!_.isNumber(options.fps)) {
        throw new Error("Provided FPS value is not a valid number");
    }
    
    if (options.fps <= 0 || options.fps > 30) {
        throw new new VError('Provided FPS value (%s) must be bigger then 0 and less or equal to 30', options.fps);
    }
    
    if (!_.isString(options.mJpegFilePath) || options.mJpegFilePath == '') {
        throw new Error("MJpeg file path is not a valid string or is missing");
    }

    if (!_.isString(options.statusFilePath) || options.statusFilePath == '') {
        throw new Error("Status file path is not a valid string or is missing");
    }
    
    if (!_.isString(options.fifoFilePath) || options.fifoFilePath == '') {
        throw new Error("FIFO file path is not a valid string or is missing");
    }
    
    if (!_.isString(options.mediaFolder) || options.mediaFolder == '') {
        throw new Error("Media folder path is not a valid string or is missing");
    }
    
    if (!options.mediaFolder.endsWith('/')) {
        options.mediaFolder += '/';
    }
    
    //if (!_.isString(config.imageDir) || config.imageDir == '') {
    //    throw new Error("Missing image directory or empty string in configuration object");
    //}
    
    //if (!_.isString(config.videoDir) || config.videoDir == '') {
    //    throw new Error("Missing video directory or empty string in configuration object");
    //}
    
    if (!fs.existsSync(options.statusFilePath)) {
        throw new Error("Status file doesn't exist");
    }
    
    if (!fs.existsSync(options.fifoFilePath)) {
        throw new Error("FIFO file doesn't exist");
    }

    updateStatus();
    
    updatePreviewImage();

    fs.watch(options.statusFilePath, function(event) {
        if (event == 'change') {
            updateStatus();
        }
    });
    
    fs.watch(options.mediaFolder, function(event, fileName) {
        fileName = options.mediaFolder + fileName;
        
        if (!_.contains(createdFiles, fileName)) {
            createdFiles.push(fileName);
        }
    });

    return {
        /*
         * Possible callback return values 
         * - ready: camera is running
         * - md_ready: ???
         * - video: ???
         * - timelapse: ???
         * - md_video: ???
         * - image: ???
         * - boxing: ???
         * - md_boxing: ???
         * - halted: camera is stopped
         */
        onStatusChange: function(onStatusChangeCallback) {
            if (!_.isFunction(onStatusChangeCallback)) {
                throw new TypeError("Provided argument is not a valid callback function");
            }

            onStatusChangeCallbacks.push(onStatusChangeCallback);

            return function() {
                onStatusChangeCallbacks = _.without(onStatusChangeCallbacks, onStatusChangeCallback);
            };
        },
        startCamera: function(onStartedCallback) {
            if (!_.isFunction(onStartedCallback)) {
                throw new TypeError("Provided argument is not a valid callback function");
            }
            
            if (activeStatus != 'halted') {
                return;
            }

            var onStatusChange = this.onStatusChange(function (status) {
                if (status == 'ready') {
                    onStatusChange();
                    onStartedCallback();
                }
            });

            addCommand("ru 1");

        },
        stopCamera: function(onStoppedCallback) {
            if (!_.isFunction(onStoppedCallback)) {
                throw new TypeError("Provided argument is not a valid callback function");
            }
            
            if (activeStatus != 'ready') {
                return;
            }
            
            var onStatusChange = this.onStatusChange(function (status) {
                if (status == 'halted') {
                    onStatusChange();
                    onStoppedCallback();
                }
            });
            
            addCommand("ru 0");
        },
        takePicture: function(onImageTakenCallback) {
            createdFiles = [];
            
            var onStatusChange = this.onStatusChange(function (status) {
                if (status == 'ready') {
                    onStatusChange();
                    onImageTakenCallback(createdFiles);
                }
            });

            addCommand("im");
        },
        startTimelapse: function() {
            createdFiles = [];
            
            addCommand("tl " + (1 * 10));
        },
        stopTimelapse: function(onTimelapseCompleteCallback) {
            var onStatusChange = this.onStatusChange(function (status) {
                if (status == 'ready') {
                    onStatusChange();
                    onTimelapseCompleteCallback(createdFiles);
                }
            });
            
            addCommand("tl 0");
        },
        onPreviewImage: function(onPreviewCallback) {
            if (!_.isFunction(onPreviewCallback)) {
                throw new TypeError("Provided argument is not a valid callback function");
            }
            
            onPreviewCallbacks.push(onPreviewCallback);
            
            return function () {
                onPreviewCallbacks = _.without(onPreviewCallbacks, onPreviewCallback);
            };
        }
    };
};


module.exports = raspbianMJpeg;