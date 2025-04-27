const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { encrypt, decrypt } = require('./utils/crypto');
const http = require('http');
const app = express();
const PORT = 3001;
const HOST = '0.0.0.0';

// 使用 CORS 中间件
app.use(cors({
    origin: '*', // 允许所有来源访问
    methods: ['GET', 'POST'],
    credentials: true,
    optionsSuccessStatus: 200
}));

// 创建 HTTP 服务器和 Socket.IO 实例
const server = http.createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true,
        transports: ['websocket', 'polling']
    },
    pingTimeout: 60000
});

// 初始化房间管理
const rooms = new Map();

// 简化的房间类
class GameRoom {
    constructor(id, maxRounds = 3) {
        this.id = id;
        this.maxRounds = maxRounds;
        this.players = new Set();
        this.scores = new Map();
        this.currentRound = 0;
        this.status = 'waiting';
        this.currentPlayer = null;
    }

    toJSON() {
        return {
            id: this.id,
            maxRounds: this.maxRounds,
            players: Array.from(this.players),
            scores: Array.from(this.scores),
            currentRound: this.currentRound,
            status: this.status
        };
    }
}


// 存储每个房间的准备玩家
const roomReadyPlayers = new Map();

// Socket.IO 事件处理
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // 玩家数据
    const playerData = {
        id: socket.id,
        name: `玩家${socket.id.substring(0, 4)}`,
        score: 0,
        isReady: false,
        guessHistory: []
    };

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        // 清理房间数据
        for (const [roomId, room] of rooms) {
            if (room.players.has(socket.id)) {
                room.players.delete(socket.id);
                if (room.players.size === 0) {
                    rooms.delete(roomId);
                }
                io.to(roomId).emit('playerLeft', socket.id);
            }
        }
    });

    // 返回所有房间列表
    socket.on('getRooms', () => {
        const roomsList = Array.from(rooms.values()).map(room => ({
            id: room.id,
            players: room.players.size,
            maxRounds: room.maxRounds,
            status: room.status
        }));
        socket.emit('roomsList', roomsList);
    });

    // 定期广播房间列表更新
    setInterval(() => {
        const roomsList = Array.from(rooms.values()).map(room => ({
            id: room.id,
            players: room.players.size,
            maxRounds: room.maxRounds,
            status: room.status
        }));
        io.emit('roomsList', roomsList);
    }, 5000); // 每5秒更新一次

    socket.on('createRoom', (settings = {}) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const room = new GameRoom(roomId, settings.maxRounds);
        room.players.add(socket.id);
        rooms.set(roomId, room);
        
        socket.join(roomId);
        socket.emit('roomCreated', { 
            roomCode: roomId,
            maxRounds: room.maxRounds
        });
    });

    socket.on('joinRoom', (roomId) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('error', '房间不存在');
            return;
        }

        if (room.players.size >= 2) {
            socket.emit('error', '房间已满');
            return;
        }

        room.players.add(socket.id);
        socket.join(roomId);
        
        // 发送房间信息给加入的玩家
        socket.emit('roomJoined', {
            roomId: room.id,
            maxRounds: room.maxRounds,
            currentRound: room.currentRound,
            status: room.status
        });
        
        // 通知房间内所有玩家有新玩家加入
        io.to(roomId).emit('playerJoined', {
            playerId: socket.id,
            playerName: playerData.name
        });
        
        // 发送房间内的聊天记录给新加入的玩家
        // 这里需要实现一个存储聊天记录的机制
        if (!room.chatHistory) {
            room.chatHistory = [];
        }
        
        if (room.chatHistory.length > 0) {
            socket.emit('chatHistory', room.chatHistory);
        }
    });

    socket.on('spectateRoom', (roomId) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('error', '房间不存在');
            return;
        }

        socket.join(roomId);
        socket.emit('roomSpectated', {
            roomId: room.id,
            maxRounds: room.maxRounds,
            currentRound: room.currentRound
        });
    });


    socket.on('playerReady', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('error', '房间不存在');
            return;
        }

        // 确保房间有准备玩家集合
        if (!roomReadyPlayers.has(roomId)) {
            roomReadyPlayers.set(roomId, new Set());
            console.log(`创建房间 ${roomId} 的准备玩家集合`);
        }
        
        // 设置玩家准备状态
        roomReadyPlayers.get(roomId).add(socket.id);
        
        console.log(`玩家 ${socket.id} 在房间 ${roomId} 准备就绪`);
        console.log(`房间 ${roomId} 已准备玩家: ${Array.from(roomReadyPlayers.get(roomId)).join(', ')}`);
        console.log(`房间 ${roomId} 总玩家: ${Array.from(room.players).join(', ')}`);
        
        // 检查是否所有玩家都准备好了
        let allReady = true;
        for (const playerId of room.players) {
            if (!roomReadyPlayers.get(roomId).has(playerId)) {
                allReady = false;
                break;
            }
        }

        // 如果所有玩家都准备好了，开始游戏
        if (allReady && room.players.size >= 2) {
            console.log(`房间 ${roomId} 所有玩家已准备，开始游戏`);
            // 确保清除之前的计时器
            if (room.timer) {
                clearTimeout(room.timer);
                room.timer = null;
            }
            
            // 先通知所有玩家游戏即将开始，给一个短暂的准备时间
            io.to(roomId).emit('gameStarting', { countdown: 3 });
            
            // 3秒后开始第一回合
            setTimeout(() => {
                startNewRound(room);
            }, 3000);
        }

        // 广播所有玩家的准备状态
        const readyPlayers = Array.from(roomReadyPlayers.get(roomId));
        io.to(roomId).emit('playersReadyStatus', {
            readyPlayers: readyPlayers
        });
    });

    socket.on('submitGuess', ({ roomId, guess, playerData }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        // 如果游戏已经开始（有当前玩家）
        if (room.currentPlayer) {
            // 检查猜测是否正确
            const isCorrect = guess.toLowerCase() === room.currentPlayer.hiddenName.toLowerCase();
            
            // 构建结果对象，确保包含所有GuessHistory组件需要的字段
            const result = {
                name: guess,
                team: playerData.team,
                teamCorrect: getTeamName(playerData.team) === getTeamName(room.currentPlayer.team),
                country: playerData.country,
                countryCorrect: String(playerData.country).toLowerCase() === String(room.currentPlayer.country).toLowerCase(),
                // 添加国家区域信息，用于显示"接近"状态
                countryRegion: getRegion(playerData.country),
                targetCountryRegion: getRegion(room.currentPlayer.country),
                role: playerData.role,
                roleCorrect: String(playerData.role).toLowerCase() === String(room.currentPlayer.role).toLowerCase(),
                birth_year: compareValues(playerData.birth_year || 2000, room.currentPlayer.birth_year),
                guessedAge: 2025 - (playerData.birth_year || 2000),
                targetAge: 2025 - room.currentPlayer.birth_year,
                majapp: compareMajors(playerData.majapp || 0, room.currentPlayer.majapp),
                guessedMajapp: playerData.majapp || 0,
                targetMajapp: room.currentPlayer.majapp
            };

            // 发送猜测结果给房间内所有玩家
            io.to(roomId).emit('guessResult', {
                playerId: socket.id,
                guess,
                result,
                isCorrect
            });

            // 如果猜对了，结束回合
            if (isCorrect) {
                endRound(room, socket.id);
            }
        } else {
            // 如果游戏还没开始，也将猜测结果添加到玩家的猜测历史中
            // 构建一个简化的结果对象
            const simpleResult = {
                name: guess,
                team: playerData.team,
                country: playerData.country,
                role: playerData.role,
                majapp: playerData.majapp || 0,
                guessedMajapp: playerData.majapp || 0,
                guessedAge: 2025 - (playerData.birth_year || 2000),
                timestamp: Date.now()
            };
            
            // 发送猜测结果给房间内所有玩家
            io.to(roomId).emit('guessResult', {
                playerId: socket.id,
                guess,
                result: simpleResult,
                isCorrect: false
            });
        }
    });

    socket.on('chatMessage', ({ roomId, ...message }) => {
        const room = rooms.get(roomId);
        if (room) {
            // 确保房间有聊天历史记录数组
            if (!room.chatHistory) {
                room.chatHistory = [];
            }
            
            // 将消息添加到房间的聊天历史记录
            room.chatHistory.push(message);
            
            // 限制聊天历史记录的长度，避免内存溢出
            if (room.chatHistory.length > 50) {
                room.chatHistory = room.chatHistory.slice(-50);
            }
            
            // 广播消息给房间内所有玩家
            io.to(roomId).emit('chatMessage', message);
        }
    });

    // 辅助函数
    function startNewRound(room) {
        room.currentRound++;
        room.status = 'playing';
        
        console.log(`开始房间 ${room.id} 的第 ${room.currentRound} 回合`);
        
        // 从玩家数据中随机选择一个选手
        const filePath = path.join(__dirname, 'players_data_cleaned.json');
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                console.error('无法读取数据文件:', err);
                return;
            }
            
            const players = JSON.parse(data);
            const keys = Object.keys(players);
            const randomKey = keys[Math.floor(Math.random() * keys.length)];
            const player = players[randomKey];
            
            room.currentPlayer = {
                country: player.country,
                team: player.team,
                birth_year: player.birth_year,
                role: player.role,
                majapp: player.majapp,
                hiddenName: randomKey,
                timeLeft: 60 // 添加倒计时初始值
            };
            
            console.log(`选择的玩家: ${randomKey}`);
            
            // 确保清除之前的计时器
            if (room.timer) {
                clearTimeout(room.timer);
            }
            
            // 发送回合开始事件给房间内所有玩家
            io.to(room.id).emit('roundStart', room.currentPlayer);
            
            // 设置回合计时器
            room.timer = setTimeout(() => {
                console.log(`房间 ${room.id} 的回合时间到`);
                endRound(room);
            }, 60000); // 60秒后结束回合
        });
    }

    function endRound(room, winnerId = null) {
        if (room.timer) {
            clearTimeout(room.timer);
            room.timer = null;
        }
        
        // 如果有赢家，增加他的分数
        if (winnerId) {
            if (!room.scores.has(winnerId)) {
                room.scores.set(winnerId, 0);
            }
            room.scores.set(winnerId, room.scores.get(winnerId) + 1);
        }
        
        // 发送回合结束事件
        io.to(room.id).emit('roundEnd', {
            winner: winnerId,
            correctAnswer: room.currentPlayer.hiddenName,
            scores: Array.from(room.scores)
        });
        
        // 检查游戏是否结束
        const maxScore = Math.max(...Array.from(room.scores.values(), 0));
        if (maxScore >= Math.ceil(room.maxRounds / 2)) {
            // 游戏结束
            const winners = Array.from(room.scores.entries())
                .filter(([_, score]) => score === maxScore)
                .map(([id, _]) => id);
            
            io.to(room.id).emit('gameEnd', {
                winners,
                scores: Array.from(room.scores)
            });
            
            room.status = 'waiting';
            room.currentRound = 0;
            room.scores.clear();
        } else {
            // 准备下一回合
            setTimeout(() => {
                startNewRound(room);
            }, 5000); // 5秒后开始下一回合
        }
    }

    // 获取国家所属区域 - 与客户端保持一致
    function getRegion(country) {
        const regionMapping = {
            Asia: ['China', 'Mongolia', 'Indonesia', 'Malaysia', 'Turkey', 'India', 'Israel', 'Jordan', 'Uzbekistan'],
            Oceania: ['Australia', 'New Zealand'],
            Europe: ['France', 'Germany', 'Sweden', 'Denmark', 'Poland', 'Spain', 'Italy', 
                    'Finland', 'Norway', 'Latvia', 'Estonia', 'Bosnia and Herzegovina', 
                    'Montenegro', 'Serbia', 'Bulgaria', 'Czech Republic', 'Switzerland', 
                    'Netherlands', 'Slovakia', 'Lithuania', 'Romania', 'United Kingdom', 
                    'Ukraine', 'Belgium', 'Hungary', 'Portugal', 'Kosovo'],
            Africa: ['South Africa'],
            SouthAmerica: ['Brazil', 'Uruguay', 'Argentina', 'Chile', 'Guatemala'],
            NorthAmerica: ['United States', 'Canada'],
            CIS: ['Russia', 'Kazakhstan', 'Belarus']
        };
        
        for (const [region, countries] of Object.entries(regionMapping)) {
            if (countries.includes(country)) {
                return region;
            }
        }
        return 'Other';
    }

    // 提取纯队伍名称（移除角色后缀）
    function getTeamName(team) {
        return team.replace(/\s*\((coach|benched)\)$/i, '');
    }

    function compareValues(guessed, target) {
        if (guessed === target) return 'correct';
        const diff = Math.abs(guessed - target);
        if (diff <= 3) return 'close'; // 3年内为接近
        return guessed > target ? 'higher' : 'lower';
    }

    function compareMajors(guessed, target) {
        if (guessed === target) return 'correct';
        const diff = Math.abs(guessed - target);
        if (diff <= 2) return 'close'; // 2次以内为接近
        return guessed > target ? 'higher' : 'lower';
    }
});

// 读取 JSON 文件
app.get('/api/players', (req, res) => {
    const filePath = path.join(__dirname, 'players_data_cleaned.json');
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: '无法读取数据文件' });
        }
        res.json(JSON.parse(data));
    });
});

// 随机获取一个选手（隐藏名字）
app.get('/api/random-player', (req, res) => {
    const filePath = path.join(__dirname, 'players_data_cleaned.json');
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: '无法读取数据文件' });
        }
        const players = JSON.parse(data);
        const keys = Object.keys(players);
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        const player = players[randomKey];
        
        // 加密敏感数据
        const encryptedData = encrypt(JSON.stringify({
            country: player.country,
            team: player.team,
            birth_year: player.birth_year,
            role: player.role,
            majapp: player.majapp,
            hiddenName: randomKey
        }));

        res.json({ encryptedData });
    });
});

// 验证用户猜测
app.post('/api/guess', express.json(), (req, res) => {
    const { guess, hiddenName } = req.body;
    if (!guess || !hiddenName) {
        return res.status(400).json({ error: '缺少必要参数' });
    }
    const filePath = path.join(__dirname, 'players_data_cleaned.json');
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: '无法读取数据文件' });
        }
        const players = JSON.parse(data);
        if (players[hiddenName] && hiddenName.toLowerCase() === guess.toLowerCase()) {
            res.json({ correct: true });
        } else {
            res.json({ correct: false });
        }
    });
});

// 根据输入返回匹配的选手列表
app.get('/api/search-players', (req, res) => {
    const { query } = req.query;
    if (!query) {
        return res.status(400).json({ error: '缺少查询参数' });
    }
    const filePath = path.join(__dirname, 'players_data_cleaned.json');
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: '无法读取数据文件' });
        }
        const players = JSON.parse(data);
        const matches = Object.keys(players)
            .filter((key) => key.toLowerCase().includes(query.toLowerCase()))
            .map((key) => ({ name: key, fullName: players[key].link.split('/').pop() }));
        res.json(matches);
    });
});

// 添加解密端点
app.post('/api/decrypt', express.json(), (req, res) => {
    try {
        const { encryptedData } = req.body;
        const decryptedData = decrypt(encryptedData);
        res.json(JSON.parse(decryptedData));
    } catch (error) {
        console.error('解密失败:', error);
        res.status(500).json({ error: '解密失败' });
    }
});

// 确保监听所有网络接口
server.listen(PORT, '0.0.0.0', () => {
    console.log(`服务器已启动，访问地址：http://0.0.0.0:${PORT}`);
});

// 删除或注释掉这行，因为它会导致端口冲突
// app.listen(PORT, HOST, () => { ... });
