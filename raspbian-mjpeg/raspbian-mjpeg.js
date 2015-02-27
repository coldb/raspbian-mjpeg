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
    
    // Update activeStatus
    function updateStatus() {
        var newStatus = fs.readFileSync(options.statusFilePath, 'utf8');
        
        if (newStatus != '' && newStatus != activeStatus) {
            activeStatus = newStatus;
            
            updatePreviewWorkerState();
            
            _.each(onStatusChangeCallbacks, function (callbackFn) {
                callbackFn(null, newStatus);
            });
        }
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
                var typeError = new TypeError("Provided argument is not a valid callback function");
                typeError.propertyName = 'onStartedCallback';
                throw typeError;
            }
            
            if (activeStatus != 'halted') {
                var error = new VError("Camera is already running");
                error.name = "invalidStatus";
                onStartedCallback(error);
                return;
            }

            var onStatusChange = this.onStatusChange(function (status) {
                if (status == 'ready') {
                    onStatusChange();
                    onStartedCallback(null);
                }
            });

            addCommand("ru 1");
        },
        stopCamera: function(onStoppedCallback) {
            if (!_.isFunction(onStoppedCallback)) {
                var typeError = new TypeError("Provided argument is not a valid callback function");
                typeError.propertyName = 'onStoppedCallback';
                throw typeError;
            }
            
            if (activeStatus != 'ready') {
                var error = new VError("Camera can be stopped only when status is 'ready'");
                error.name = "invalidStatus";
                onStoppedCallback(error);
                return;
            }
            
            var onStatusChange = this.onStatusChange(function (status) {
                if (status == 'halted') {
                    onStatusChange();
                    onStoppedCallback(null);
                }
            });
            
            addCommand("ru 0");
        },
        takePicture: function(onImageTakenCallback) {
            if (activeStatus != 'ready') {
                return;
            }
            
            createdFiles = [];
            
            var onStatusChange = this.onStatusChange(function (status) {
                if (status == 'ready') {
                    onStatusChange();
                    onImageTakenCallback(createdFiles);
                }
            });

            addCommand("im");
        },
        startTimelapse: function(interval, onTimelapseStartedCallback) {
            createdFiles = [];
            
            var onStatusChange = this.onStatusChange(function (status) {
                if (status == 'timelapse') {
                    onStatusChange();
                    onTimelapseStartedCallback();
                }
            });

            addCommand("tl " + (interval * 10));
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
        startVideo: function() {
            addCommand("ca 1");
        },
        stopVideo: function() {
            addCommand("ca 0");
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