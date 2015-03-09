if (typeof String.prototype.endsWith !== 'function') {
    String.prototype.endsWith = function (suffix) {
        return this.indexOf(suffix, this.length - suffix.length) !== -1;
    };
}

function pad(n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
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
        createdFiles = [],
        resolutionSettings = {
            videoWidth: 1920,
            videoHeight: 1080,
            videoFps: 25,
            boxingFps: 25,
            imageWidth: 2592,
            imageHeight: 1944
        },
        cameraOptions = {
            sharpness: null,
            contrast: null,
            brightness: null,
            saturation: null,
            iso: null
        };
    
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
    
    function createTypeError(message, propertyName) {
        var newError = new TypeError(message);
        newError.propertyName = propertyName;
        return newError;
    }
    
    function createError(message, name) {
        var newError = new Error(message);
        newError.name = name;
        return newError;
    }
    
    function createRangeError(message, propertyName) {
        var newError = new RangeError(message);
        newError.propertyName = propertyName;
        throw newError;
    }
    
    return {
        getStatus: function () {
            return activeStatus;
        },
        setSharpness: function(value, onComplete) {
            if (!_.isNumber(value)) {
                throw createTypeError('New sharpness is not a valid number', 'value');
            }
            
            if (value < -100 || value > 100) {
                throw createRangeError('Sharpness value must be between -100 and 100', 'value');
            }
            
            if (!_.isFunction(onComplete)) {
                throw createTypeError('Provided argument is not a valid callback function', 'onComplete');
            }
            
            if (cameraOptions.sharpness == value) {
                onComplete(null);
                return;
            } 
            else {
                cameraOptions.sharpness = value;
            }

            addCommand("sh " + value, function(error) {
                if (error !== null) {
                    onComplete(error);
                } 
                else {
                    onComplete(null);
                }
            });
        },
        setContrast: function(value, onComplete) {
            if (!_.isNumber(value)) {
                throw createTypeError('New contrast is not a valid number', 'value');
            }
            
            if (value < -100 || value > 100) {
                throw createRangeError('Contrast value must be between -100 and 100', 'value');
            }
            
            if (!_.isFunction(onComplete)) {
                throw createTypeError('Provided argument is not a valid callback function', 'onComplete');
            }
            
            if (cameraOptions.contrast == value) {
                onComplete(null);
                return;
            } 
            else {
                cameraOptions.contrast = value;
            }
            
            addCommand("co " + value, function (error) {
                if (error !== null) {
                    onComplete(error);
                } 
                else {
                    onComplete(null);
                }
            });
        },
        setBrightness: function(value, onComplete) {
            if (!_.isNumber(value)) {
                throw createTypeError('New brightness is not a valid number', 'value');
            }
            
            if (value < 0 || value > 100) {
                throw createRangeError('Brightness value must be between 0 and 100', 'value');
            }
            
            if (!_.isFunction(onComplete)) {
                throw createTypeError('Provided argument is not a valid callback function', 'onComplete');
            }
            
            if (cameraOptions.brightness == value) {
                onComplete(null);
                return;
            } 
            else {
                cameraOptions.brightness = value;
            }
            
            addCommand("br " + value, function (error) {
                if (error !== null) {
                    onComplete(error);
                } 
                else {
                    onComplete(null);
                }
            });
        },
        setSaturation: function(value, onComplete) {
            if (!_.isNumber(value)) {
                throw createTypeError('New saturation is not a valid number', 'value');
            }
            
            if (value < -100 || value > 100) {
                throw createRangeError('Saturation value must be between -100 and 100', 'value');
            }
            
            if (!_.isFunction(onComplete)) {
                throw createTypeError('Provided argument is not a valid callback function', 'onComplete');
            }
            
            if (cameraOptions.saturation == value) {
                onComplete(null);
                return;
            } 
            else {
                cameraOptions.saturation = value;
            }
            
            addCommand("sa " + value, function (error) {
                if (error !== null) {
                    onComplete(error);
                } 
                else {
                    onComplete(null);
                }
            });
        },
        setISO: function(value, onComplete) {
            if (!_.isNumber(value)) {
                throw createTypeError('New ISO is not a valid number', 'value');
            }

            if (!_.contains([0, 100, 200, 400, 800], value)) {
                throw createRangeError('ISO must be one of the following 0 (auto), 100, 200, 400 or 800', 'value');
            }
            
            if (!_.isFunction(onComplete)) {
                throw createTypeError('Provided argument is not a valid callback function', 'onComplete');
            }
            
            if (cameraOptions.iso == value) {
                onComplete(null);
                return;
            } 
            else {
                cameraOptions.iso = value;
            }
            
            addCommand("is " + value, function (error) {
                if (error !== null) {
                    onComplete(error);
                } 
                else {
                    onComplete(null);
                }
            });
        },
        setResolution: function (settings, onComplete) {
            if (!_.isObject(settings)) {
                throw createTypeError("Resolution settings must be an object", 'settings');
            }
            
            if (!_.isNumber(settings.videoWidth)) {
                throw createTypeError("Video width is not a valid number", 'settings');
            }
            
            if (!_.isNumber(settings.videoHeight)) {
                throw createTypeError("Video height is not a valid number", 'settings');
            }
            
            if (!_.isNumber(settings.videoFps)) {
                throw createTypeError("Video FPS is not a valid number", 'settings');
            }
            
            if (!_.isNumber(settings.boxingFps)) {
                throw createTypeError("Video boxing FPS is not a valid number", 'settings');
            }
            
            if (!_.isNumber(settings.imageWidth)) {
                throw createTypeError("Picture width is not a valid number", 'settings');
            }
            
            if (!_.isNumber(settings.imageHeight)) {
                throw createTypeError("Picture height is not a valid number", 'settings');
            }
            
            resolutionSettings = _.extend(resolutionSettings, settings);
            
            var cmdParts = [];
            cmdParts.push(pad(resolutionSettings.videoWidth, 4));
            cmdParts.push(pad(resolutionSettings.videoHeight, 4));
            cmdParts.push(pad(resolutionSettings.videoFps, 2));
            cmdParts.push(pad(resolutionSettings.boxingFps, 2));
            cmdParts.push(pad(resolutionSettings.imageWidth, 4));
            cmdParts.push(pad(resolutionSettings.imageHeight, 4));
            
            addCommand("px " + cmdParts.join(' ') , function (error) {
                if (error !== null) {
                    onComplete(error);
                } 
                else {
                    onComplete(null);
                }
            });
        },
        onPreviewImage: function (onPreviewCallback) {
            if (!_.isFunction(onPreviewCallback)) {
                throw createTypeError('Provided argument is not a valid callback function', 'onPreviewCallback');
            }
            
            onPreviewCallbacks.push(onPreviewCallback);
            
            return function () {
                onPreviewCallbacks = _.without(onPreviewCallbacks, onPreviewCallback);
            };
        },
        onStatusChange: function (onStatusChangeCallback) {
            if (!_.isFunction(onStatusChangeCallback)) {
                throw createTypeError('Provided argument is not a valid callback function', 'onStatusChangeCallback');
            }
            
            onStatusChangeCallbacks.push(onStatusChangeCallback);
            
            return function () {
                onStatusChangeCallbacks = _.without(onStatusChangeCallbacks, onStatusChangeCallback);
            };
        },
        startCamera: function (onStartedCallback) {
            if (!_.isFunction(onStartedCallback)) {
                throw createTypeError('Provided argument is not a valid callback function', 'onStartedCallback');
            }
            
            if (activeStatus != 'halted') {
                onStartedCallback(createError('Camera is already running', 'invalidStatus'));
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
                throw createTypeError('Provided argument is not a valid callback function', 'onStoppedCallback');
            }
            
            if (activeStatus != 'ready') {
                onStoppedCallback(createError('Camera can be stopped only when status is "ready"', 'invalidStatus'));
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
                throw createTypeError('Provided argument is not a valid callback function', 'onDisposedCallback');
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
                throw createTypeError('Provided argument is not a valid callback function', 'onImageTakenCallback');
            }
            
            if (activeStatus != 'ready') {
                onImageTakenCallback(createError('Picture can be taken only when the status is "ready"', 'invalidStatus'), []);
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
                throw createTypeError('Provided argument is not a valid number', 'interval');
            }
            
            if (interval < 0.1 || interval > 3200) {
                throw createRangeError('Timelapse interval must be between 0.1 and 3200', 'interval');
            }
            
            if (!_.isFunction(onTimelapseStartedCallback)) {
                var typeErrorCallaback = new TypeError("Provided argument is not a valid callback function");
                typeErrorCallaback.propertyName = 'onTimelapseStartedCallback';
                throw typeErrorCallaback;
            }
            
            if (activeStatus != 'ready') {
                onTimelapseStartedCallback(createError('Timelapse can only be started when the status is "ready"', 'invalidStatus'));
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
                throw createTypeError('Provided argument is not a valid callback function', 'onTimelapseCompleteCallback');
            }
            
            if (activeStatus != 'timelapse') {
                onTimelapseCompleteCallback(createError('Timelapse can only be stopped when the status is "timelapse"', 'invalidStatus'), []);
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
                throw createTypeError('Provided argument is not a valid callback function', 'onRecordingStartedCallback');
            }
            
            if (activeStatus != 'ready') {
                onRecordingStartedCallback(createError('Video recording can only be started when the status is "ready"', 'invalidStatus'));
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
                throw createTypeError('Provided argument is not a valid callback function', 'onRecordingCompleteCallback');
            }
            
            if (!_.isUndefined(onBoxingStartedCallback) && !_.isFunction(onBoxingStartedCallback)) {
                var typeErrorBoxing = new TypeError("Provided argument is not a valid callback function");
                typeErrorBoxing.propertyName = 'onBoxingStartedCallback';
                throw typeErrorBoxing;
            }
            
            if (activeStatus != 'video') {
                onRecordingCompleteCallback(createError('Video recording can only be stopped when the status is "video"', 'invalidStatus'));
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