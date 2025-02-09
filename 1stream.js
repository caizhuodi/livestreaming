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

// DOM加载完成后再运行其他部分
document.addEventListener('DOMContentLoaded', async () => {  // 改为 async 函数
    // 首先等待获取本地媒体流
    await getLocalStream();
    document.getElementById('toggleVideo').addEventListener('click', toggleVideo);
    document.getElementById('toggleAudio').addEventListener('click', toggleAudio);

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

    // Initialize by getting the local stream
    getLocalStream();
});

