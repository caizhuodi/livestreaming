const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

const clients = {}; // 存储所有客户端 { id: ws }

wss.on('connection', (ws) => {
    console.log('New WebSocket connection');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'register') {
                // 客户端注册自己并绑定 ID
                clients[data.id] = ws; // 记录连接的客户端
                console.log(`Registered client: ${data.id}`);

                // 向所有已连接的客户端广播新客户端的 ID
                for (const clientId in clients) {
                    if (clientId !== data.id) {
                        clients[clientId].send(JSON.stringify({ type: 'newClient', id: data.id }));
                    }
                }
                return;
            }

            if (data.type === 'changeId') {
                // 客户端请求更改 ID
                const oldId = data.oldId;
                const newId = data.newId;

                if (clients[oldId]) {
                    // 从旧的 ID 移除客户端
                    delete clients[oldId];
                    // 将客户端与新的 ID 关联
                    clients[newId] = ws;
                    console.log(`Client ID changed from ${oldId} to ${newId}`);

                    // 向所有已连接的客户端广播该客户端的 ID 已更改
                    for (const clientId in clients) {
                        if (clientId !== newId) {
                            clients[clientId].send(JSON.stringify({
                                type: 'clientIdChanged',
                                oldId,
                                newId
                            }));
                        }
                    }
                } else {
                    console.error(`Client with ID ${oldId} not found`);
                    // 向客户端发送错误信息
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: `Client with ID ${oldId} not found`
                    }));
                }
                return;
            }

            // 处理 WebRTC 的消息
            if (data.type === 'offer' || data.type === 'answer' || data.type === 'candidate') {
                const target = clients[data.target];
                if (target) {
                    // 添加发送者信息
                    data.sender = Object.keys(clients).find(id => clients[id] === ws);
                    target.send(JSON.stringify(data));
                } else {
                    console.error(`No client found for target: ${data.target}`);
                }
            }

        } catch (err) {
            console.error('Error processing message:', err);
        }
    });

    ws.on('close', () => {
        // 找到断开连接的客户端ID
        let disconnectedId;
        for (const [id, client] of Object.entries(clients)) {
            if (client === ws) {
                disconnectedId = id;
                delete clients[id];
                break;
            }
        }
    
        if (disconnectedId) {
            console.log(`Client disconnected: ${disconnectedId}`);
            // 向其他客户端广播这个客户端已断开连接
            for (const client of Object.values(clients)) {
                client.send(JSON.stringify({
                    type: 'clientDisconnected',
                    id: disconnectedId
                }));
            }
        }
    });
});

console.log('Server running on http://localhost:8080/');
