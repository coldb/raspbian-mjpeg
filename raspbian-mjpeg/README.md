raspbian-mjpeg
==========

<b>NB! The current version is very unstable and lacking documentation.</b>

A node module for interacting with RaspiMJPEG that is created by silvanmelchior.

## Setup
See this guide on how to get [node.js running on Raspberry Pi](http://joshondesign.com/2013/10/23/noderpi).

## API

### Methods

#### onStatusChange(callback)
Sets a callback function to be triggered when the RaspiMJPEG status changes. 
* callback(err, newStatus): Provides Error as the first argument if an error occured (null otherwise). Second argument is the new status as a string. 

Possible status values
* ready: camera is running
* md_ready: ???
* video: video is recording
* timelapse: timelapse is running
* md_video: ???
* image: image being taken
* boxing: mp4box is running on video
* md_boxing: ???
* halted: camera is stopped

#### startCamera(callback)
Starts the camera and sets a callback to be triggererd when the camera is started.
* callback(err): Provides Error as the first argument if an error occures (null on no error).

Possible thrown errors:
* TypeError; err.property contains the name of the parameter.

Possible returned errors:
* err.name = 'invalidStatus'; Status is anything else then "halted". The status needs to be "halted" to start the camera.

#### stopCamera(callback)
Stops the camera and sets a callback to be triggered when the camera is stopped.
* callback(err): Provides Error as the first argument if an error occures (null on no error).

Possible thrown errors:
* TypeError; err.property contains the name of the parameter.

Possible returned errors:
* err.name = 'invalidStatus'; Status is anything else then "ready". The status needs to be "ready" to stop the camera.

#### disposeCamera(callback)
Stop the camera independent of the state it is in. If video is being recorded then recording is stopped and camera is stopped. The same goes for timelapse as well.
* callback(err): Provides error as the first argument if an error occures (null on no error).

Possible thrown errors:
* TypeError; err.property contains the name of the parameter.

