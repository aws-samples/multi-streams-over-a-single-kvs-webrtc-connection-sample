KVS WebRTC Master For Multi Camera Streams
=============================================
This is a patch file to https://github.com/awslabs/amazon-kinesis-video-streams-webrtc-sdk-c.git repo to build KVS WebRTC Master.

## Getting Started
1. Go to https://github.com/awslabs/amazon-kinesis-video-streams-webrtc-sdk-c and refer the instructions to download the code.
2. Checkout commit `b2b05c8982beed62e4c589d2890621bf98638153`
3. Copy `0001-Add-multi-camera-support-to-kvs-webrtc.path` to top directory of workspace downloded and apply the patch.
4. Build the sample applications according to the instructions in the web page.

## Running kvsWebrtcClientMaster
1. Set running environment according to instructions in above web page.
2. Download or create H264 Video files and copy over video files to `build/` and/or `build/samples/`. The directory under should be like `h264SampleFrames/main/camx` and `h264SampleFrames/preview/camx`, "x" is from 0 to 7. 
	- The frame rate is fixed at 15 fps.
	- The preview stream is up to 360p and main stream is up to 1080p.
	- Minimum 500 frames are required.
	- The download link is: https://drive.google.com/file/d/1-Zj9z6f-9nB2KqBSHXAMYk0pgP3c0IUl/view?usp=sharing.
3. Run following command to start master with certain number of video files as camera, default is 8 cameras. Other command line options are not supported.
```
./samples/kvsWebrtcClientMaster <channelName> <cameraNumber> 
```

## Running kvsWebrtcClientMasterGstSample
1. Set running environment according to above web page.
2. Run following command to start master with RTSP streams as camera. Other options are not supported.
```
./samples/kvsWebrtcClientMasterGstSample <channelName> <cameraNumber> <rtspCameraConfigFile>
```

An example of RTSP stream configuration file "rtspconfig.txt" is included under samples/. An example line in the file is shown below:
```
rtsp://192.168.31.51:554/stream2 admin Iotlab11 preview passthru
```
The fields are space seperated with following meaning,
```
rtsp://192.168.31.51:554/stream2(url) admin(username) Iotlab11(password) preview(streamType) passthru(pipelineType)
```
- url: RTSP stream url
- username: username for RTSP stream, if not required use "none".
- password: password for RTSP stream, if not required use "none".
- streamType: either "preview" or "main".
- pipelineType: "passthru" for H.264 stream that does not need to be decoded. "decoding" for other stream.
