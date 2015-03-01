raspbian-mjpeg
==========

A node module for interacting with RaspiMJPEG that is created by silvanmelchior.

## Setup
See this guide on how to get [node.js running on Raspberry Pi](http://joshondesign.com/2013/10/23/noderpi).

## Install

```
npm install raspbian-mjpeg
```

## Usage

### Create object

```
var raspbianMjpeg = require('raspbian-mjpeg');

var mJpeg = new raspbianMjpeg({
    statusFilePath: 'status_mjpeg.txt',
    fifoFilePath: 'FIFO',
    mJpegFilePath: '/run/shm/mjpeg/cam.jpg',
    mediaFolder: 'media/',
    fps: 25
});
```
### Take image

```
raspbianMjpeg.takePicture(function(err, pictures) {
    if (err != null) {
        console.log('ERROR: ' + err.message);
    } 
    else {
        console.log('picture taken');
        console.log(pictures);
    }
});
```

## API

### Constructor options

* statusFilePath: path of the status file created by RaspiMJPEG
* fifoFilePath: path of the FIFO file used by RaspiMJPEG
* mJpegFilePath: path to the jpeg file that is created by RaspiMJPEG
* mediaFolder: path to the folder where image and video files are created by RaspiMJPEG
* fps: the fps of the preview image that is returned.

### Methods

#### getStatus()
Returns current status.

Possible status values
* ready: camera is running
* video: video is recording
* timelapse: timelapse is running
* image: image being taken
* boxing: mp4box is running on video
* halted: camera is stopped

#### onPreviewImage(callback)
Sets a callback function to be triggered when a new image is available.
* callback(data): Provides File data as the first argument.

Returns: method that need to be called to remove the added onPreviewImage callback.

Possible thrown errors:
* TypeError; err.property contains the name of the parameter.

#### onStatusChange(callback)
Sets a callback function to be triggered when the RaspiMJPEG status changes. 
* callback(err, newStatus): Provides Error as the first argument if an error happens (null otherwise). Second argument is the new status as a string. 

Returns: method that need to be called to remove the added onStatusChange callback.

Possible values are listed under the getStatus() API methods documentation.

#### startCamera(callback)
Starts the camera and sets a callback to be triggered when the camera is started.
* callback(err): Provides Error as the first argument if an error happens (null on no error).

Possible thrown errors:
* TypeError; err.property contains the name of the parameter.

Possible returned errors:
* err.name = 'invalidStatus'; Status is anything else then "halted". The status needs to be "halted" to start the camera.

#### stopCamera(callback)
Stops the camera and sets a callback to be triggered when the camera is stopped. The camera status needs to be "ready" for it to be stopped. 
* callback(err): Provides Error as the first argument if an error happens (null on no error).

Possible thrown errors:
* TypeError; err.property contains the name of the parameter.

Possible returned errors:
* err.name = 'invalidStatus'; Status is anything else then "ready". The status needs to be "ready" to stop the camera.

#### disposeCamera(callback)
Stop the camera independent of the state it is in. If video is being recorded then recording is stopped and camera is stopped. The same goes for time lapse as well.
* callback(err): Provides error as the first argument if an error happens (null on no error).

Possible thrown errors:
* TypeError; err.property contains the name of the parameter.

#### takePicture(callback)
Take a picture with the camera. The status needs to be "ready" to take image. If the status is anything else an error will be thrown.
* callback(err, createdFiles): Provides error as the first argument if an error happens (null on no error). Second argument contains an array with the created file name for the created picture. The array will contain one item.

Possible thrown errors:
* TypeError; err.property contains the name of the parameter.

Possible returned errors:
* err.name = 'invalidStatus'; Status is anything else then "ready". The status needs to be "ready" to take a picture.

#### startTimelapse(interval, callback)
Starts taking a picture at fixed intervals. The status needs to be "ready" to start time lapse.
* interval: the interval between the images taken. The valid value is between 0.1 and 3200
* callback(err): Provides error as the first argument if an error happens (null on no error). 

Possible thrown errors:
* TypeError; err.property contains the name of the parameter.
* RangeError; err.property contains the name of the parameter. This is type is returned when the interval is out of the valid range.

Possible returned errors:
* err.name = 'invalidStatus'; Status is anything else then "ready". The status needs to be "ready" to start a time lapse.

#### stopTimelapse(callback)
Stops taking pictures at a fixed interval. The status needs to be "timelapse" to stop the running time lapse.
* callback(err, createdFiles): Provides error as the first argument if an error happens (null on no error). Second argument contains an array of created files.

Possible thrown errors:
* TypeError; err.property contains the name of the parameter.

Possible returned errors:
* err.name = 'invalidStatus'; Status is anything else then "timelapse". The status needs to be "time lapse" to start a time lapse.

#### startRecording(callback)
Starts recording video. The status needs to be "ready" to start recording a video.
* callback(err): Provides error as the first argument if an error happens (null on no error).

Possible thrown errors:
* TypeError; err.property contains the name of the parameter.

Possible returned errors:
* err.name = 'invalidStatus'; Status is anything else then "ready". The status needs to be "ready" to start recording a video.

#### stopRecording(recordingCompleteCallback [, boxingStartedCallback])
Stops video recording. The status needs to be "video" to stop recording a video.
* recordingCompleteCallback(err, createdFiles): Provides error as the first argument if an error happens (null on no error). Second argument contains an array with the created file name of the video. The array will contain one item.
* onBoxingStartedCallback(): The callback is triggered when the recorded h264 file conversion is started.

Possible thrown errors:
* TypeError; err.property contains the name of the parameter.

Possible returned errors:
* err.name = 'invalidStatus'; Status is anything else then "video". The status needs to be "video" to stop recording a video.

