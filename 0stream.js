/////////1️⃣ 仅有双人窗口

// // let localStream;
// const peer = new Peer();
    
// // 显示本地ID
// peer.on('open', (id) => {
//     document.getElementById('localId').textContent = id;
// });

// // 获取本地视频流
// async function getLocalStream() {
//     try {
//         localStream = await navigator.mediaDevices.getUserMedia({
//             video: true,
//             audio: true
//         });
//         const localVideo = document.getElementById('localVideo');
//         localVideo.srcObject = localStream;
//     } catch (err) {
//         console.error('获取媒体流失败:', err);
//         alert('无法访问摄像头和麦克风');
//     }
// }

// // 处理接入连接
// peer.on('call', async (call) => {
//     if (!localStream) {
//         await getLocalStream();
//     }
    
//     call.answer(localStream);
//     handleCall(call);
// });

// // 处理视频通话
// function handleCall(call) {
//     call.on('stream', (remoteStream) => {
//         const remoteVideo = document.getElementById('remoteVideo');
//         remoteVideo.srcObject = remoteStream;
//     });
    
//     call.on('error', (err) => {
//         console.error('通话错误:', err);
//         alert('通话发生错误');
//     });
    
//     call.on('close', () => {
//         const remoteVideo = document.getElementById('remoteVideo');
//         remoteVideo.srcObject = null;
//     });
// }

// // 连接到远程Peer
// document.getElementById('connectBtn').addEventListener('click', async () => {
//     const remoteId = document.getElementById('remoteId').value;
//     if (!remoteId) {
//         alert('请输入远程Peer ID');
//         return;
//     }

//     if (!localStream) {
//         await getLocalStream();
//     }

//     const call = peer.call(remoteId, localStream);
//     handleCall(call);
// });

// // 页面加载时获取本地视频流
// getLocalStream();




/////////2️⃣ 多人窗口
let localStream;
const peer = new Peer();
const videoContainer = document.querySelector('.video-container');

// 显示本地 ID
peer.on('open', (id) => {
    document.getElementById('localId').textContent = id;
});

// 获取本地视频流
async function getLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error('获取媒体流失败:', err);
        alert('无法访问摄像头和麦克风');
    }
}

// 处理接入连接
peer.on('call', async (call) => {
    if (!localStream) {
        await getLocalStream();
    }

    call.answer(localStream);
    handleCall(call);
});

// 处理视频通话（支持多个远程视频）
function handleCall(call) {
    call.on('stream', (remoteStream) => {
        addRemoteVideo(call.peer, remoteStream);
    });

    call.on('error', (err) => {
        console.error('通话错误:', err);
        alert('通话发生错误');
    });

    call.on('close', () => {
        removeRemoteVideo(call.peer);
    });
}

// 连接到远程 Peer
document.getElementById('connectBtn').addEventListener('click', async () => {
    const remoteId = document.getElementById('remoteId').value;
    if (!remoteId) {
        alert('请输入远程 Peer ID');
        return;
    }

    if (!localStream) {
        await getLocalStream();
    }

    const call = peer.call(remoteId, localStream);
    handleCall(call);
});

// 添加远程视频
function addRemoteVideo(peerId, stream) {
    let videoElement = document.getElementById(`video-${peerId}`);
    if (!videoElement) {
        const videoWrapper = document.createElement('div');
        videoWrapper.innerHTML = `<h3>远程用户 ${peerId}</h3><video id="video-${peerId}" autoplay playsinline></video>`;
        videoContainer.appendChild(videoWrapper);
        videoElement = document.getElementById(`video-${peerId}`);
    }
    videoElement.srcObject = stream;
}

// 移除远程视频
function removeRemoteVideo(peerId) {
    const videoElement = document.getElementById(`video-${peerId}`);
    if (videoElement) {
        videoElement.parentElement.remove();
    }
}

// 页面加载时获取本地视频流
getLocalStream();

