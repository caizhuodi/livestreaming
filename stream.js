let localStream;
const peer = new Peer();
    
// 显示本地ID
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

// 处理视频通话
function handleCall(call) {
    call.on('stream', (remoteStream) => {
        const remoteVideo = document.getElementById('remoteVideo');
        remoteVideo.srcObject = remoteStream;
    });
    
    call.on('error', (err) => {
        console.error('通话错误:', err);
        alert('通话发生错误');
    });
    
    call.on('close', () => {
        const remoteVideo = document.getElementById('remoteVideo');
        remoteVideo.srcObject = null;
    });
}

// 连接到远程Peer
document.getElementById('connectBtn').addEventListener('click', async () => {
    const remoteId = document.getElementById('remoteId').value;
    if (!remoteId) {
        alert('请输入远程Peer ID');
        return;
    }

    if (!localStream) {
        await getLocalStream();
    }

    const call = peer.call(remoteId, localStream);
    handleCall(call);
});

// 页面加载时获取本地视频流
getLocalStream();