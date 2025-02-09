let localStream; // Declare this globally so it can be accessed everywhere.
let currentId = ''; // Store the current client ID

// 获取本地视频流
async function getLocalStream() {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            document.getElementById('localVideo').srcObject = localStream;
            console.log('Local stream initialized successfully');
            return;
        } catch (error) {
            attempts++;
            console.error(`Error accessing local media (attempt ${attempts}/${maxAttempts}):`, error);
            if (attempts === maxAttempts) {
                throw error;
            }
            // 等待一秒后重试
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// 获取视频设备列表
async function listVideoDevices() {
    const videoSourceSelect = document.getElementById('videoSourceSelect');

    // Clear the existing options (to avoid duplicates)
    videoSourceSelect.innerHTML = '<option value="">选择视频输入设备</option>';

    try {
        // Get the list of media devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        videoDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Camera ${videoSourceSelect.length}`;
            videoSourceSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error enumerating devices:', error);
    }
}

// 获取音频设备列表
async function listAudioDevices() {
    const audioSourceSelect = document.getElementById('audioSourceSelect');

    // Clear the existing options (to avoid duplicates)
    audioSourceSelect.innerHTML = '<option value="">选择音频输入设备</option>';

    try {
        // Get the list of media devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = devices.filter(device => device.kind === 'audioinput');

        audioDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Microphone ${audioSourceSelect.length}`;
            audioSourceSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error enumerating devices:', error);
    }
}

// DOM加载完成后再运行其他部分
document.addEventListener('DOMContentLoaded', async () => {  // 改为 async 函数
    // 等待获取视频输入设备
    await listVideoDevices();
    // 等待获取音频输入设备
    await listAudioDevices();
    // 等待获取本地媒体流
    await getLocalStream();

    const ws = new WebSocket('ws://localhost:8080');
    let peerConnections = {}; // 存储 WebRTC 连接
    let clients = {}; // 存储已连接的客户端ID

    // 创建或获取远程视频元素
    function getRemoteVideoElement(clientId) {
        let videoElement = document.getElementById(`remote-video-${clientId}`);

        if (!videoElement) {
            const remoteVideos = document.getElementById('remoteVideos');
            const videoContainer = document.createElement('div');
            videoContainer.className = 'remote-video-container';

            videoElement = document.createElement('video');
            videoElement.id = `remote-video-${clientId}`;
            videoElement.autoplay = true;
            videoElement.playsinline = true;

            const label = document.createElement('div');
            label.className = 'remote-video-label';
            label.textContent = `ID: ${clientId}`;

            videoContainer.appendChild(videoElement);
            videoContainer.appendChild(label);
            remoteVideos.appendChild(videoContainer);
        }

        return videoElement;
    }

    // 视频清理函数，当连接断开时移除视频元素
    function removeRemoteVideo(clientId) {
        const videoElement = document.getElementById(`remote-video-${clientId}`);
        if (videoElement) {
            // 停止所有轨道
            const stream = videoElement.srcObject;
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            videoElement.srcObject = null;

            // 移除容器元素
            const container = videoElement.parentElement;
            if (container) {
                container.remove();
            }

            console.log(`Removed video element for client: ${clientId}`);
        }
    }

    ws.onopen = () => {
        console.log('Connected to WebSocket');
        currentId = Math.random().toString(36).substring(7);  // 初始ID

        // 将生成的 ID 显示在 <p id="oldId"> 元素中
        document.getElementById('myId').textContent = `ID: ${currentId}`;

        ws.send(JSON.stringify({ type: 'register', id: currentId }));
    };

    // 监听服务器的信令消息
    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log("Received WebSocket message:", data); // 查看服务器返回的消息

        if (data.type === 'register') {
            console.log('Registered client:', data.id);
        }

        if (data.type === 'newClient') {
            console.log('New client connected:', data.id);
            // 存储新连接的客户端ID
            clients[data.id] = true;

            // 尝试与新客户端建立连接
            const pc = createPeerConnection(data.id);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: 'offer', target: data.id, offer }));
        }

        if (data.type === 'clientIdChanged') {
            console.log(`Client ID changed: ${data.oldId} -> ${data.newId}`);
            // 查找所有已显示的远程视频标签并更新
            const remoteVideoLabel = document.querySelectorAll('.remote-video-label');
            remoteVideoLabel.forEach(label => {
                if (label.textContent === `ID: ${data.oldId}`) {
                    label.textContent = `ID: ${data.newId}`;
                    console.log(`Updated label for client ${data.oldId} to ${data.newId}`);
                }
            });
        }

        if (data.type === 'offer') {
            if (!data.sender) {
                console.error('No sender information in offer');
                return;
            }
            console.log("Received offer from:", data.sender);
            const pc = createPeerConnection(data.sender);
            if (pc) {  // 添加检查
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                ws.send(JSON.stringify({ type: 'answer', target: data.sender, answer }));
            }
        }

        if (data.type === 'answer') {
            console.log("Received answer from:", data.sender);
            const pc = peerConnections[data.sender];
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            } else {
                console.error('Peer connection not found for answer');
            }
        }

        if (data.type === 'candidate') {
            console.log("Received ICE candidate from:", data.sender);

            // Check if peer connection exists, if not, create one
            let pc = peerConnections[data.sender];
            if (!pc) {
                console.log('Peer connection not found, creating one for:', data.sender);
                pc = createPeerConnection(data.sender);
            }

            if (pc) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                    console.log('ICE candidate added successfully');
                } catch (error) {
                    console.error('Error adding ICE candidate:', error);
                }
            } else {
                console.error('Unable to add ICE candidate, peer connection creation failed');
            }
        }

        // 添加处理客户端断开连接的逻辑
        if (data.type === 'clientDisconnected') {
            console.log('Client disconnected:', data.id);
            // 关闭并清理相关的 peer connection
            if (peerConnections[data.id]) {
                peerConnections[data.id].close();
                delete peerConnections[data.id];
            }
            // 删除相关的客户端记录
            delete clients[data.id];
            // 移除视频元素
            removeRemoteVideo(data.id);
        }

        // toggleVideo之后的显示控制
        if (data.type === 'toggleVideo') {
            const remoteVideo = document.getElementById(`remote-video-${data.id}`);

            if (remoteVideo) {
                const stream = remoteVideo.srcObject;
                if (stream) {
                    // 获取视频轨道
                    const videoTracks = stream.getVideoTracks();
                    if (videoTracks.length > 0) {
                        videoTracks[0].enabled = data.videoEnabled;  // 直接控制视频轨道的启用/禁用
                    }
                }

                // 额外的 UI 处理
                if (!data.videoEnabled) {
                    remoteVideo.style.backgroundColor = 'black';  // 纯黑背景
                    remoteVideo.style.opacity = '1';  // 隐藏视频
                } else {
                    remoteVideo.style.backgroundColor = '';  // 重置背景
                    remoteVideo.style.opacity = '1';  // 显示视频
                }
            }
        }

        // toggleAudio之后的控制
        if (data.type === 'toggleAudio') {
            // 获取远程视频元素
            const remoteVideo = getRemoteVideoElement(data.id); // 根据客户端ID获取对应的远程视频元素

            if (remoteVideo) {
                const stream = remoteVideo.srcObject;
                if (stream) {
                    const audioTracks = stream.getAudioTracks();
                    if (audioTracks.length > 0) {
                        audioTracks[0].enabled = data.audioEnabled; // 控制音频轨道
                    }
                }
            } else {
                console.error('Remote video element not found for ID:', data.id);
            }
        }

    };

    // 创建 WebRTC 连接
    function createPeerConnection(target) {
        if (!localStream) {
            console.error('Local stream not initialized');
            return null;
        }

        try {
            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' }
                ]
            });

            console.log('Creating peer connection for target:', target);

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('Sending ICE candidate for target:', target);
                    ws.send(JSON.stringify({
                        type: 'candidate',
                        target,
                        candidate: event.candidate
                    }));
                }
            };

            pc.ontrack = (event) => {
                console.log('Received remote track');
                // const remoteVideo = document.getElementById('remoteVideo');
                const remoteVideo = getRemoteVideoElement(target);
                if (remoteVideo && event.streams && event.streams[0]) {
                    console.log('Setting remote video stream...');
                    remoteVideo.srcObject = event.streams[0];
                } else {
                    console.error('Remote video element or stream not available');
                }
            };

            // 添加本地媒体轨道
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
                console.log('Added local track:', track.kind);
            });

            peerConnections[target] = pc;
            console.log('Added peer connection for target:', target);
            return pc;
        } catch (error) {
            console.error('Error creating peer connection:', error);
            return null;
        }
    }

    // Listen for "Change ID" button click
    document.getElementById('changeIdBtn').addEventListener('click', () => {
        const newId = document.getElementById('newId').value;
        if (newId && newId !== currentId) {
            // Send request to change ID
            ws.send(JSON.stringify({
                type: 'changeId',
                oldId: currentId,
                newId: newId
            }));
            currentId = newId;  // Update the currentId to the new one

            // Update the displayed ID on the page
            document.getElementById('myId').textContent = `ID: ${currentId}`; // Add this line
        } else {
            alert('Please enter a different ID');
        }
    });

    // 控制视频输入设备
    document.getElementById('videoSourceSelect').addEventListener('change', async (event) => {
        const deviceId = event.target.value;
        if (deviceId) {
            // Stop the current stream (if any)
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }

            // Get the new video stream from the selected device
            try {
                const constraints = {
                    video: { deviceId: { exact: deviceId } },
                    audio: true
                };

                localStream = await navigator.mediaDevices.getUserMedia(constraints);
                document.getElementById('localVideo').srcObject = localStream;
                console.log('Local video source changed successfully');
            } catch (error) {
                console.error('Error accessing selected video source:', error);
            }
        }
    });

    // 控制音频输入设备
    document.getElementById('audioSourceSelect').addEventListener('change', async (event) => {
        const deviceId = event.target.value;
        if (deviceId) {
            // Stop the current audio stream (if any)
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }

            // Get the new audio stream from the selected device
            try {
                const constraints = {
                    video: true, // Keep the video enabled
                    audio: { deviceId: { exact: deviceId } }
                };

                localStream = await navigator.mediaDevices.getUserMedia(constraints);
                document.getElementById('localVideo').srcObject = localStream; // You can update this to audio controls if needed
                console.log('Local audio source changed successfully');
            } catch (error) {
                console.error('Error accessing selected audio source:', error);
            }
        }
    });


    // 控制视频开关
    document.getElementById('toggleVideo').addEventListener('click', async () => {
        const videoEnabled = localStream.getTracks().some(track => track.kind === 'video' && track.enabled);

        // Toggle the video track (enable/disable)
        localStream.getTracks().forEach(track => {
            if (track.kind === 'video') {
                track.enabled = !videoEnabled; // Toggle the video track
            }
        });

        // Send the toggle video state to the server
        ws.send(JSON.stringify({
            type: 'toggleVideo',
            id: currentId,
            videoEnabled: !videoEnabled // Send the new video state (enabled or disabled)
        }));
    });

    // 控制音频开关
    document.getElementById('toggleAudio').addEventListener('click', () => {
        const audioEnabled = localStream.getTracks().some(track => track.kind === 'audio' && track.enabled);

        // Toggle the audio track (enable/disable)
        localStream.getTracks().forEach(track => {
            if (track.kind === 'audio') {
                track.enabled = !audioEnabled; // Toggle the audio track
            }
        });

        // Send the toggle audio state to the server
        ws.send(JSON.stringify({
            type: 'toggleAudio',
            id: currentId,
            audioEnabled: !audioEnabled // Send the new audio state (enabled or disabled)
        }));
    });


    // Initialize by getting the local stream
    getLocalStream();
});

