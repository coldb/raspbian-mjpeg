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
        
        _.each(onPreviewCallbacks, function (callbackFn) {
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
    
    function addCommand(command, callback) {
        exec('echo "' + command + '" > FIFO', function (error) {
            if (error !== null) {
                var cmdError = new Error('exec error: ' + error);
                cmdError.name = 'execError';
                callback(cmdError);
            } 
            else {
                callback(null);
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
    
    fs.watch(options.statusFilePath, function (event) {
        if (event == 'change') {
            updateStatus();
        }
    });
    
    fs.watch(options.mediaFolder, function (event, fileName) {
        fileName = options.mediaFolder + fileName;
        
        if (fileName.indexOf(".mp4.h264") == -1 && !_.contains(createdFiles, fileName)) {
            createdFiles.push(fileName);
        }
    });
    
    return {
        getStatus: function () {
            return activeStatus;
        },
        onPreviewImage: function (onPreviewCallback) {
            if (!_.isFunction(onPreviewCallback)) {
                var typeError = new TypeError("Provided argument is not a valid callback function");
                typeError.propertyName = 'onPreviewCallback';
                throw typeError;
            }
            
            onPreviewCallbacks.push(onPreviewCallback);
            
            return function () {
                onPreviewCallbacks = _.without(onPreviewCallbacks, onPreviewCallback);
            };
        },
        onStatusChange: function (onStatusChangeCallback) {
            if (!_.isFunction(onStatusChangeCallback)) {
                throw new TypeError("Provided argument is not a valid callback function");
            }
            
            onStatusChangeCallbacks.push(onStatusChangeCallback);
            
            return function () {
                onStatusChangeCallbacks = _.without(onStatusChangeCallbacks, onStatusChangeCallback);
            };
        },
        startCamera: function (onStartedCallback) {
            if (!_.isFunction(onStartedCallback)) {
                var typeError = new TypeError("Provided argument is not a valid callback function");
                typeError.propertyName = 'onStartedCallback';
                throw typeError;
            }
            
            if (activeStatus != 'halted') {
                var statusError = new VError("Camera is already running");
                statusError.name = "invalidStatus";
                onStartedCallback(statusError);
                return;
            }
            
            var onStatusChange = this.onStatusChange(function (err, status) {
                if (status == 'ready') {
                    onStatusChange();
                    onStartedCallback(null);
                }
            });
            
            addCommand("ru 1", function (error) {
                if (error !== null) {
                    onStatusChange();
                    onStartedCallback(error);
                }
            });
        },
        stopCamera: function (onStoppedCallback) {
            if (!_.isFunction(onStoppedCallback)) {
                var typeError = new TypeError("Provided argument is not a valid callback function");
                typeError.propertyName = 'onStoppedCallback';
                throw typeError;
            }
            
            if (activeStatus != 'ready') {
                var statusError = new VError("Camera can be stopped only when status is 'ready'");
                statusError.name = "invalidStatus";
                onStoppedCallback(statusError);
                return;
            }
            
            var onStatusChange = this.onStatusChange(function (err, status) {
                if (status == 'halted') {
                    onStatusChange();
                    onStoppedCallback(null);
                }
            });
            
            addCommand("ru 0", function (error) {
                if (error !== null) {
                    onStatusChange();
                    onStoppedCallback(error);
                }
            });
        },
        disposeCamera: function (onDisposedCallback) {
            if (!_.isFunction(onDisposedCallback)) {
                var typeError = new TypeError("Provided argument is not a valid callback function");
                typeError.propertyName = 'onDisposedCallback';
                throw typeError;
            }
            
            if (activeStatus == 'ready' || activeStatus == 'halted') {
                onDisposedCallback();
            }
            else if (activeStatus == 'video') {
                this.stopRecording(function () { onDisposedCallback(); });
            }
            else if (activeStatus == 'timelapse') {
                this.stopTimelapse(function () { onDisposedCallback(); });
            } 
            else {
                var onStatusChange = this.onStatusChange(function (err, status) {
                    if (status == 'ready') {
                        onStatusChange();
                        this.stopCamera(function () { onDisposedCallback(); });
                    }
                });
            }
        },
        takePicture: function (onImageTakenCallback) {
            if (!_.isFunction(onImageTakenCallback)) {
                var typeError = new TypeError("Provided argument is not a valid callback function");
                typeError.propertyName = 'onImageTakenCallback';
                throw typeError;
            }
            
            
            if (activeStatus != 'ready') {
                var statusError = new VError("Picture can be taken only when the status is 'ready'");
                statusError.name = "invalidStatus";
                onImageTakenCallback(statusError, []);
                return;
            }
            
            createdFiles = [];
            
            var onStatusChange = this.onStatusChange(function (err, status) {
                if (status == 'ready') {
                    onStatusChange();
                    onImageTakenCallback(null, createdFiles);
                }
            });
            
            addCommand("im", function (error) {
                if (error !== null) {
                    onStatusChange();
                    onImageTakenCallback(error);
                }
            });
        },
        startTimelapse: function (interval, onTimelapseStartedCallback) {
            if (!_.isNumber(interval)) {
                var typeErrorInterval = new TypeError("Provided argument is not a valid number");
                typeErrorInterval.propertyName = 'interval';
                throw typeErrorInterval;
            }
            
            if (interval < 0.1 || interval > 3200) {
                var rangeErrorInterval = new RangeError("Timelapse interval must be between 0.1 and 3200");
                rangeErrorInterval.propertyName = 'interval';
                throw rangeErrorInterval;
            }
            
            if (!_.isFunction(onTimelapseStartedCallback)) {
                var typeErrorCallaback = new TypeError("Provided argument is not a valid callback function");
                typeErrorCallaback.propertyName = 'onTimelapseStartedCallback';
                throw typeErrorCallaback;
            }
            
            if (activeStatus != 'ready') {
                var statusError = new VError("Timelapse can only be started when the status is 'ready'");
                statusError.name = "invalidStatus";
                onTimelapseStartedCallback(statusError);
                return;
            }
            
            createdFiles = [];
            
            var onStatusChange = this.onStatusChange(function (err, status) {
                if (status == 'timelapse') {
                    onStatusChange();
                    onTimelapseStartedCallback(null);
                }
            });
            
            addCommand("tl " + (interval * 10), function (error) {
                if (error !== null) {
                    onStatusChange();
                    onTimelapseStartedCallback(error);
                }
            });
        },
        stopTimelapse: function (onTimelapseCompleteCallback) {
            if (!_.isFunction(onTimelapseCompleteCallback)) {
                var typeErrorCallaback = new TypeError("Provided argument is not a valid callback function");
                typeErrorCallaback.propertyName = 'onTimelapseCompleteCallback';
                throw typeErrorCallaback;
            }
            
            if (activeStatus != 'timelapse') {
                var statusError = new VError("Timelapse can only be stopped when the status is 'timelapse'");
                statusError.name = "invalidStatus";
                onTimelapseCompleteCallback(statusError, []);
                return;
            }
            
            var onStatusChange = this.onStatusChange(function (err, status) {
                if (status == 'ready') {
                    onStatusChange();
                    onTimelapseCompleteCallback(null, createdFiles);
                }
            });
            
            addCommand("tl 0", function (error) {
                if (error !== null) {
                    onStatusChange();
                    onTimelapseCompleteCallback(error);
                }
            });
        },
        startRecording: function (onRecordingStartedCallback) {
            if (!_.isFunction(onRecordingStartedCallback)) {
                var typeErrorCallaback = new TypeError("Provided argument is not a valid callback function");
                typeErrorCallaback.propertyName = 'onRecordingStartedCallback';
                throw typeErrorCallaback;
            }
            
            if (activeStatus != 'ready') {
                var statusError = new VError("Video recording can only be started when the status is 'ready'");
                statusError.name = "invalidStatus";
                onRecordingStartedCallback(statusError);
                return;
            }
            
            var onStatusChangeRecording = this.onStatusChange(function (err, status) {
                if (status == 'video') {
                    onStatusChangeRecording();
                    onRecordingStartedCallback(null);
                }
            });
            
            addCommand("ca 1", function (error) {
                if (error !== null) {
                    onStatusChange();
                    onRecordingStartedCallback(error);
                }
            });
        },
        stopRecording: function (onRecordingCompleteCallback, onBoxingStartedCallback) {
            if (!_.isFunction(onRecordingCompleteCallback)) {
                var typeErrorComplete = new TypeError("Provided argument is not a valid callback function");
                typeErrorComplete.propertyName = 'onRecordingCompleteCallback';
                throw typeErrorComplete;
            }
            
            if (!_.isUndefined(onBoxingStartedCallback) && !_.isFunction(onBoxingStartedCallback)) {
                var typeErrorBoxing = new TypeError("Provided argument is not a valid callback function");
                typeErrorBoxing.propertyName = 'onBoxingStartedCallback';
                throw typeErrorBoxing;
            }
            
            if (activeStatus != 'video') {
                var statusError = new VError("Video recording can only be stopped when the status is 'video'");
                statusError.name = "invalidStatus";
                onRecordingCompleteCallback(statusError);
                return;
            }
            
            createdFiles = [];
            
            var onStatusChangeBoxing = this.onStatusChange(function (err, status) {
                if (status == 'boxing') {
                    onStatusChangeBoxing();
                    
                    if (_.isFunction(onBoxingStartedCallback)) {
                        onBoxingStartedCallback();
                    }
                }
            });
            
            var onStatusChangeRecording = this.onStatusChange(function (err, status) {
                if (status == 'ready') {
                    onStatusChangeRecording();
                    onRecordingCompleteCallback(null, createdFiles);
                }
            });
            
            addCommand("ca 0", function (error) {
                if (error !== null) {
                    onStatusChangeBoxing();
                    onStatusChangeRecording();
                    onRecordingCompleteCallback(error);
                }
            });
        }
    };
};


module.exports = raspbianMJpeg;