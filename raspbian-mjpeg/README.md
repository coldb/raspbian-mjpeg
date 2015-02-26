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
