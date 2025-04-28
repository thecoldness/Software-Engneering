import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../config';
import GameRoom from './GameRoom';
import GameLobby from './GameLobby';
import './MultiPlayer.css';

function MultiPlayer() {
    const socketRef = useRef(null);
    const [rooms, setRooms] = useState([]); // 添加 rooms 状态
    const [gameState, setGameState] = useState({
        roomId: null,
        currentRound: 0,
        maxRounds: 3,
        status: 'lobby',
        isReady: false,
        scores: {} // 初始化分数对象
    });

    useEffect(() => {
        // 使用完整的配置选项
        const socket = io(API_BASE_URL, {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            autoConnect: true,
            timeout: 10000,
        });

        socketRef.current = socket;

        const handlers = {
            connect: () => {
                console.log('Connected to server');
                socket.emit('getRooms'); // 连接后请求房间列表
            },
            disconnect: (reason) => {
                console.log('Disconnected:', reason);
            },
            connect_error: (error) => {
                console.error('Connection error:', error);
            },
            roomsList: (roomsList) => {
                console.log('Received rooms list:', roomsList);
                setRooms(roomsList); // 处理房间列表更新
            },
            roomCreated: (data) => {
                setGameState(prev => ({
                    ...prev,
                    roomId: data.roomCode,
                    status: 'room',
                    isReady: false // 重置准备状态
                }));
            },
            roomJoined: (data) => {
                setGameState(prev => ({
                    ...prev,
                    roomId: data.roomId,
                    currentRound: data.currentRound,
                    maxRounds: data.maxRounds,
                    status: 'room',
                    isReady: false // 重置准备状态
                }));
            },
            playersReadyStatus: ({ readyPlayers }) => {
                // 处理玩家准备状态更新
                console.log('Players ready status updated:', readyPlayers);
                // 更新本地状态，标记当前玩家是否已准备
                if (socketRef.current) {
                    setGameState(prev => ({
                        ...prev,
                        isReady: readyPlayers.includes(socketRef.current.id)
                    }));
                }
            },
            roundEnd: ({ winner, correctAnswer, scores }) => {
                // 处理回合结束，更新分数
                console.log('Round ended, winner:', winner, 'scores:', scores);
                if (scores) {
                    // 将服务器返回的分数数组转换为对象
                    const scoresObj = {};
                    scores.forEach(([playerId, score]) => {
                        scoresObj[playerId] = score;
                    });
                    
                    setGameState(prev => ({
                        ...prev,
                        scores: scoresObj
                    }));
                }
            },
            gameEnd: ({ winners, scores }) => {
                // 处理游戏结束，更新最终分数
                console.log('Game ended, winners:', winners, 'scores:', scores);
                if (scores) {
                    // 将服务器返回的分数数组转换为对象
                    const scoresObj = {};
                    scores.forEach(([playerId, score]) => {
                        scoresObj[playerId] = score;
                    });
                    
                    setGameState(prev => ({
                        ...prev,
                        scores: scoresObj
                    }));
                }
            },
            roomClosed: ({ roomId }) => {
                // 处理房间关闭事件，返回大厅
                console.log(`房间 ${roomId} 已关闭`);
                setGameState(prev => ({
                    ...prev,
                    status: 'lobby',
                    roomId: null,
                    currentRound: 0,
                    scores: {},
                    isReady: false // 重置准备状态
                }));
            },
            chatHistory: (messages) => {
                // 处理历史聊天记录
                console.log('Received chat history:', messages);
                // 这里可以将历史消息传递给GameRoom组件
            },
            error: console.error
        };

        Object.entries(handlers).forEach(([event, handler]) => {
            socket.on(event, handler);
        });

        return () => {
            if (socket) {
                Object.keys(handlers).forEach(event => {
                    socket.off(event);
                });
                socket.disconnect();
            }
        };
    }, []);

    const handleCreateRoom = useCallback((settings = {}) => {
        if (!socketRef.current) return;
        
        const roomSettings = {
            maxRounds: settings.maxRounds || 3
        };

        socketRef.current.emit('createRoom', roomSettings);
    }, []);

    const handleJoinRoom = (roomId) => {
        if (socketRef.current) {
            socketRef.current.emit('joinRoom', roomId);
            setGameState(prev => ({
                ...prev,
                status: 'room',
                isReady: false // 重置准备状态
            }));
        }
    };


    const handlePlayerReady = () => {
        if (socketRef.current && gameState.roomId) {
            socketRef.current.emit('playerReady', { roomId: gameState.roomId });
            setGameState(prev => ({
                ...prev,
                isReady: true
            }));
        }
    };

    return (
        <div className="multiplayer-container">
            {gameState.status === 'lobby' && (
                <GameLobby 
                    rooms={rooms}
                    maxRounds={gameState.maxRounds}
                    setMaxRounds={(rounds) => setGameState(prev => ({ ...prev, maxRounds: rounds }))}
                    onCreateRoom={() => handleCreateRoom({ maxRounds: gameState.maxRounds })}
                    onJoinRoom={handleJoinRoom}
                />
            )}
            
            {gameState.status === 'room' && (
                <GameRoom 
                    socket={socketRef.current}
                    roomId={gameState.roomId}
                    currentRound={gameState.currentRound}
                    maxRounds={gameState.maxRounds}
                    scores={gameState.scores}
                    isReady={gameState.isReady}
                    onReady={handlePlayerReady}
                    onReturnToLobby={() => setGameState(prev => ({ ...prev, status: 'lobby', isReady: false }))}
                />
            )}

        </div>
    );
}

// 防抖函数
function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

export default MultiPlayer;
