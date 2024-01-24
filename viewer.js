// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/**
 * This file demonstrates the process of starting WebRTC multi streaming using a KVS Signaling Channel.
 */
const viewer = {};
let maxTrackNumber;
const count = 4;

function createRemoteView(id) {
    let colDiv = document.createElement("div");
    colDiv.className = "col";

    let h5 = document.createElement("h5");
    h5.innerText = "Camera " + id;
    colDiv.appendChild(h5);

    let videoContainerDiv = document.createElement("div");
    videoContainerDiv.className = "video-container";
    videoContainerDiv.innerHTML = `<video class="remote-view" autoplay controls disablepictureinpicture></video>`;

    colDiv.appendChild(videoContainerDiv);
    return colDiv;
}

function createRow() {
    console.debug('createRow');
    let rowDiv = document.createElement("div");
    rowDiv.className="row";
    return rowDiv;
}

function createRowsContainer() {
    console.debug('createRowsContainer');
    let rowsDiv = document.createElement("div");
    rowsDiv.id = "rows-container";
    return rowsDiv;
}

function createAllView(number) {
    console.debug('createAllView, number = ', number);
    maxTrackNumber = Number(number);
    console.debug('createAllView, row number = ', maxTrackNumber / count);
    const viewsContainer = document.getElementById("views-container");
    let rowsContainer = document.getElementById("rows-container");
    if (rowsContainer) {
        viewsContainer.removeChild(rowsContainer);
    }
    rowsContainer = createRowsContainer();
    viewsContainer.appendChild(rowsContainer);
    for (let i = 0; i < maxTrackNumber / count; i++) {
        rowsContainer.append(createRow());
    }
    const rows = $('#rows-container .row');
    console.debug('rows length = ', rows.length);
    const remoteView = $('#views-container .remote-view');
    console.debug('remoteView length = ', remoteView.length);
    for (let i = 0; i < rows.length; i++) {
        for (let j = 0; j < count && j < maxTrackNumber - i * count; j++) {
            console.debug('createView, index = ', i * count + j);
            rows[i].append(createRemoteView(i * count + j));
        }
    }
}

function fetchAllView() {
    console.debug('fetchAllView');
    viewer.remoteView = $('#views-container .remote-view');
    console.debug('remote-view, length = ', viewer.remoteView.length);
    for (let i = 0; i < viewer.remoteView.length; i++) {
        viewer.remoteView[i].addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement) {
                console.warn('window ' + i.toString() + ' enter fullscreenElement');
                const message = "webrtc_rtp_mix:0;maincam_id:" + i +"\n";
                sendViewerMessage(message);
            } else {
                console.warn('window ' + i.toString() + ' exist fullscreenElement');
                const message = "webrtc_rtp_mix:1;maincam_id:16\n";
                sendViewerMessage(message);
            }
        });
    }
}

async function startViewer(formValues, onRemoteDataMessage) {
    try {
        console.log('[VIEWER] Client id is:', formValues.clientId);
        fetchAllView();

        // Create KVS client
        const kinesisVideoClient = new AWS.KinesisVideo({
            region: formValues.region,
            accessKeyId: formValues.accessKeyId,
            secretAccessKey: formValues.secretAccessKey,
            sessionToken: formValues.sessionToken,
            endpoint: formValues.endpoint,
            correctClockSkew: true,
        });

        // Get signaling channel ARN
        const describeSignalingChannelResponse = await kinesisVideoClient
            .describeSignalingChannel({
                ChannelName: formValues.channelName,
            })
            .promise();
        const channelARN = describeSignalingChannelResponse.ChannelInfo.ChannelARN;
        console.log('[VIEWER] Channel ARN:', channelARN);

        // Get signaling channel endpoints
        const getSignalingChannelEndpointResponse = await kinesisVideoClient
            .getSignalingChannelEndpoint({
                ChannelARN: channelARN,
                SingleMasterChannelEndpointConfiguration: {
                    Protocols: ['WSS', 'HTTPS'],
                    Role: KVSWebRTC.Role.VIEWER,
                },
            })
            .promise();
        const endpointsByProtocol = getSignalingChannelEndpointResponse.ResourceEndpointList.reduce((endpoints, endpoint) => {
            endpoints[endpoint.Protocol] = endpoint.ResourceEndpoint;
            return endpoints;
        }, {});
        console.log('[VIEWER] Endpoints:', endpointsByProtocol);

        const kinesisVideoSignalingChannelsClient = new AWS.KinesisVideoSignalingChannels({
            region: formValues.region,
            accessKeyId: formValues.accessKeyId,
            secretAccessKey: formValues.secretAccessKey,
            sessionToken: formValues.sessionToken,
            endpoint: endpointsByProtocol.HTTPS,
            correctClockSkew: true,
        });

        // Get ICE server configuration
        const getIceServerConfigResponse = await kinesisVideoSignalingChannelsClient
            .getIceServerConfig({
                ChannelARN: channelARN,
            })
            .promise();
        const iceServers = [];
        // Don't add stun if user selects TURN only or NAT traversal disabled
        if (!formValues.natTraversalDisabled && !formValues.forceTURN) {
            iceServers.push({ urls: `stun:stun.kinesisvideo.${formValues.region}.amazonaws.com:443` });
        }

        // Don't add turn if user selects STUN only or NAT traversal disabled
        if (!formValues.natTraversalDisabled && !formValues.forceSTUN) {
            getIceServerConfigResponse.IceServerList.forEach(iceServer =>
                iceServers.push({
                    urls: iceServer.Uris,
                    username: iceServer.Username,
                    credential: iceServer.Password,
                }),
            );
        }
        console.log('[VIEWER] ICE servers:', iceServers);

        // Create Signaling Client
        viewer.signalingClient = new KVSWebRTC.SignalingClient({
            channelARN,
            channelEndpoint: endpointsByProtocol.WSS,
            clientId: formValues.clientId,
            role: KVSWebRTC.Role.VIEWER,
            region: formValues.region,
            credentials: {
                accessKeyId: formValues.accessKeyId,
                secretAccessKey: formValues.secretAccessKey,
                sessionToken: formValues.sessionToken,
            },
            systemClockOffset: kinesisVideoClient.config.systemClockOffset,
        });

        const configuration = {
            iceServers,
            iceTransportPolicy: formValues.forceTURN ? 'relay' : 'all',
        };
        viewer.peerConnection = new RTCPeerConnection(configuration);
        if (formValues.openDataChannel) {
            const dataChannelObj = viewer.peerConnection.createDataChannel('kvsDataChannel');
            viewer.dataChannel = dataChannelObj;
            dataChannelObj.onopen = event => {
                dataChannelObj.send("Opened data channel by viewer");
            };
            // Callback for the data channel created by viewer
            dataChannelObj.onmessage = onRemoteDataMessage;

            viewer.peerConnection.ondatachannel = event => {
                // Callback for the data channel created by master
                event.channel.onmessage = onRemoteDataMessage;
            };
        }

        viewer.signalingClient.on('open', async () => {
            console.log('[VIEWER] Connected to signaling service');

            // Create an SDP offer to send to the master
            console.log('[VIEWER] Creating SDP offer:', viewer.peerConnection.getTransceivers().length);
            for (let i = 0; i < maxTrackNumber; i++) {
                viewer.peerConnection.addTransceiver('video', {
                    direction: 'recvonly'
                });
            }

            const sdpOffer = await viewer.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
            });
            console.log('sdp Offer = ', sdpOffer.sdp);
            await viewer.peerConnection.setLocalDescription(sdpOffer);

            // When trickle ICE is enabled, send the offer now and then send ICE candidates as they are generated.
            // Otherwise wait on the ICE candidates.
            if (formValues.useTrickleICE) {
                console.log('[VIEWER] Sending SDP offer');
                console.debug('SDP offer:', viewer.peerConnection.localDescription);
                viewer.signalingClient.sendSdpOffer(sdpOffer);
            }
            console.log('[VIEWER] Generating ICE candidates');
        });

        viewer.signalingClient.on('sdpAnswer', async answer => {
            // Add the SDP answer to the peer connection
            console.log('[VIEWER] Received SDP answer');
            // Type: string
            console.log('SDP answer:', answer.sdp);
            await viewer.peerConnection.setRemoteDescription(answer);
        });

        viewer.signalingClient.on('iceCandidate', candidate => {
            // Add the ICE candidate received from the MASTER to the peer connection
            console.log('[VIEWER] Received ICE candidate');
            console.debug('ICE candidate', candidate);
            if (shouldAcceptCandidate(formValues, candidate)) {
                viewer.peerConnection.addIceCandidate(candidate);
            } else {
                console.log('[VIEWER] Not adding candidate from peer.');
            }
        });

        viewer.signalingClient.on('close', () => {
            console.log('[VIEWER] Disconnected from signaling channel');
        });

        viewer.signalingClient.on('error', error => {
            console.error('[VIEWER] Signaling client error:', error);
        });

        // Send any ICE candidates to the other peer
        viewer.peerConnection.addEventListener('icecandidate', ({ candidate }) => {
            if (candidate) {
                console.log('[VIEWER] Generated ICE candidate');
                console.debug('ICE candidate:', candidate);

                // When trickle ICE is enabled, send the ICE candidates as they are generated.
                if (formValues.useTrickleICE) {
                    if (shouldSendIceCandidate(formValues, candidate)) {
                        console.log('[VIEWER] Sending ICE candidate');
                        viewer.signalingClient.sendIceCandidate(candidate);
                    } else {
                        console.log('[VIEWER] Not sending ICE candidate');
                    }
                }
            } else {
                console.log('[VIEWER] All ICE candidates have been generated');

                // When trickle ICE is disabled, send the offer now that all the ICE candidates have ben generated.
                if (!formValues.useTrickleICE) {
                    console.log('[VIEWER] Sending SDP offer');
                    console.debug('SDP offer:', viewer.peerConnection.localDescription);
                    viewer.signalingClient.sendSdpOffer(viewer.peerConnection.localDescription);
                }
            }
        });

        viewer.peerConnection.addEventListener('connectionstatechange', async event => {
            printPeerConnectionStateInfo(event, '[VIEWER]');
        });

        // As remote tracks are received, add them to the remote view
        viewer.peerConnection.addEventListener('track', event => {
            console.log('[VIEWER] Received remote track');
            console.log('[VIEWER] Received remote track, event =', event);
            if (event.track.kind === "video") {
                console.warn('[VIEWER] Received remote track, id =', event.track.id);
                console.warn('[VIEWER] Received remote stream, id =', event.streams[0].id);
                const index = Number(event.streams[0].id.split("_")[1]);
                console.warn('[VIEWER] index = ', index);
                viewer.remoteStream = event.streams[0];
                viewer.remoteView[index].srcObject = viewer.remoteStream;
            } else {
                console.warn('[VIEWER] Received remote track, id =', event.track.id);
                console.warn('[VIEWER] Received remote track, kind =', event.track.kind);
                console.warn('[VIEWER] Received remote stream, id =', event.streams[0].id);
            }
        });
        console.log('[VIEWER] Starting viewer connection');
        viewer.signalingClient.open();
    } catch (e) {
        console.error('[VIEWER] Encountered error starting:', e);
    }
}

function stopViewer() {
    try {
        console.log('[VIEWER] Stopping viewer connection');

        if (viewer.signalingClient) {
            viewer.signalingClient.close();
            viewer.signalingClient = null;
        }

        if (viewer.peerConnection) {
            viewer.peerConnection.close();
            viewer.peerConnection = null;
        }

        if (viewer.remoteStream) {
            viewer.remoteStream.getTracks().forEach(track => track.stop());
            viewer.remoteStream = null;
        }

        if (viewer.peerConnectionStatsInterval) {
            clearInterval(viewer.peerConnectionStatsInterval);
            viewer.peerConnectionStatsInterval = null;
        }

        for (let i = 0; i < maxTrackNumber; i++)
        {
            if (viewer.remoteView[i]) {
                viewer.remoteView[i].srcObject = null;
            }
        }

        if (viewer.dataChannel) {
            viewer.dataChannel = null;
        }

    } catch (e) {
        console.error('[VIEWER] Encountered error stopping', e);
    }
}

function sendViewerMessage(message) {
    if (viewer.dataChannel) {
        try {
            viewer.dataChannel.send(message);
            console.log('[VIEWER] Sent', message, 'to MASTER!');
            return true;
        } catch (e) {
            console.error('[VIEWER] Send DataChannel:', e.toString());
            return false;
        }
    } else {
        console.warn('[VIEWER] No DataChannel exists!');
        return false;
    }
}