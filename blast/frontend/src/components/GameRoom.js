import React, { useState, useEffect, useCallback, useRef } from 'react';
import './GameRoom.css';
import { API_BASE_URL } from '../config';
import GuessHistory from './GuessHistory';

const decryptData = async (encryptedData) => {
    const response = await fetch(`${API_BASE_URL}/api/decrypt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedData }),
    });
    return await response.json();
};

function GameRoom({ roomId, socket, scores, currentRound, maxRounds, isReady, onReady }) {
    const [gameState, setGameState] = useState({
        currentPlayer: null,
        timeLeft: 60,
        guess: '',
        remainingGuesses: 8,
        guessHistory: [], 
    });
    
    const [playersGuesses, setPlayersGuesses] = useState({}); 
    const [messages, setMessages] = useState([]);

    const [suggestions, setSuggestions] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [newMessage, setNewMessage] = useState('');
    const [showGameResult, setShowGameResult] = useState(false);
    const [players, setPlayers] = useState({});
    const [isChatExpanded, setIsChatExpanded] = useState(true);
    const [startCountdown, setStartCountdown] = useState(null);

    const regionMapping = {
        Asia: ['China', 'Mongolia', 'Indonesia', 'Malaysia', 'Turkey', 'India'],
        Europe: ['France', 'Germany', 'Sweden', 'Denmark', 'Poland', 'Spain', 'Italy', 'Ukraine', 'Finland', 'Norway'],
    };

    const getRegion = (country) => {
        for (const [region, countries] of Object.entries(regionMapping)) {
            if (countries.includes(country)) {
                return region;
            }
        }
        return 'Other';
    };

    const getAge = (birthYear) => 2025 - birthYear;

    const guessHistoryRef = useRef([]);
    const playersRef = useRef({});

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/players`)
            .then(res => res.json())
            .then(data => setPlayers(data))
            .catch(err => console.error('获取玩家数据失败:', err));
    }, []);

    // 统一的事件处理
    useEffect(() => {
        if (!socket) return;

        console.log("Setting up socket event listeners");

        const handleGameStarting = ({ countdown }) => {
            console.log(`游戏即将开始，倒计时: ${countdown}秒`);
            setStartCountdown(countdown);
            
            // 创建倒计时定时器
            let timeLeft = countdown;
            const countdownTimer = setInterval(() => {
                timeLeft -= 1;
                if (timeLeft > 0) {
                    setStartCountdown(timeLeft);
                } else {
                    clearInterval(countdownTimer);
                    setStartCountdown(null);
                }
            }, 1000);
        };

        const handleRoundStart = (data) => {
            console.log('Round started with player:', data);
            const simplePlayer = {
                country: data.country,
                team: data.team,
                role: data.role,
                majapp: data.majapp,
                hiddenName: data.hiddenName,
                birth_year: data.birth_year
            };
            
            setGameState(prev => ({
                ...prev,
                currentPlayer: simplePlayer,
                remainingGuesses: 8,
                timeLeft: 60,
                guess: ''
            }));
            setPlayersGuesses({});
            
            // 清理历史记录
            guessHistoryRef.current = [];
        };

        const handleRoundEnd = ({ winner, correctAnswer }) => {
            console.log('Round ended, correct answer:', correctAnswer);
            setGameState(prev => ({
                ...prev,
                showAnswer: true,
                currentPlayer: { ...prev.currentPlayer, hiddenName: correctAnswer }
            }));
            setShowGameResult(true);
        };

        const handleGuessResult = ({ playerId, guess, result }) => {
            console.log('Guess result received:', playerId, guess, result);
            if (!result) return;
            
            // 使用单层数据结构
            setPlayersGuesses(prev => {
                const newGuesses = { ...prev };
                if (!newGuesses[playerId]) {
                    newGuesses[playerId] = [];
                }
                newGuesses[playerId].push({
                    name: guess,
                    ...result,
                    timestamp: Date.now()
                });
                return newGuesses;
            });
        };

        // 处理游戏开始前的玩家猜测
        const handlePlayerGuess = ({ playerId, guess, playerData }) => {
            console.log('Player guess received:', playerId, guess, playerData);
            
            // 将猜测添加到聊天消息中
            const message = {
                id: playerId,
                content: `猜测: ${guess}`,
                timestamp: Date.now(),
                isGuess: true
            };
            
            setMessages(prev => [...prev, message]);
        };

        const handleChatMessage = (message) => {
            // 只有当消息不是自己发送的时候才添加到消息列表
            if (message.id !== socket.id) {
                setMessages(prev => [...prev, message]);
            }
        };

        const handleChatHistory = (history) => {
            // 设置历史聊天记录
            setMessages(history);
        };

        // 注册所有事件监听器
        socket.on('gameStarting', handleGameStarting);
        socket.on('roundStart', handleRoundStart);
        socket.on('roundEnd', handleRoundEnd);
        socket.on('guessResult', handleGuessResult);
        socket.on('playerGuess', handlePlayerGuess);
        socket.on('chatMessage', handleChatMessage);
        socket.on('chatHistory', handleChatHistory);

        // 清理函数
        return () => {
            socket.off('gameStarting', handleGameStarting);
            socket.off('roundStart', handleRoundStart);
            socket.off('roundEnd', handleRoundEnd);
            socket.off('guessResult', handleGuessResult);
            socket.off('playerGuess', handlePlayerGuess);
            socket.off('chatMessage', handleChatMessage);
            socket.off('chatHistory', handleChatHistory);
        };
    }, [socket]);

    // 添加倒计时定时器
    useEffect(() => {
        let timer;
        if (gameState.timeLeft > 0 && gameState.currentPlayer) {
            console.log(`Countdown: ${gameState.timeLeft} seconds left`);
            timer = setInterval(() => {
                setGameState(prev => ({
                    ...prev,
                    timeLeft: prev.timeLeft - 1
                }));
            }, 1000);
        } else if (gameState.timeLeft === 0 && gameState.currentPlayer) {
            // 时间到，显示结果
            console.log('Time is up, showing result');
            setShowGameResult(true);
        }

        return () => {
            if (timer) clearInterval(timer);
        };
    }, [gameState.timeLeft, gameState.currentPlayer]);

    // 确保当currentPlayer更新时重置倒计时
    useEffect(() => {
        if (gameState.currentPlayer) {
            console.log('Current player updated, resetting timer');
            setGameState(prev => ({
                ...prev,
                timeLeft: 60,
                remainingGuesses: 8
            }));
        }
    }, [gameState.currentPlayer]);

    const handleInputChange = (e) => {
        const value = e.target.value;
        setGameState((prev) => ({ ...prev, guess: value }));
        
        if (!value.trim()) {
            setSuggestions([]);
            return;
        }

        // 使用encodeURIComponent确保查询参数正确编码
        fetch(`${API_BASE_URL}/api/search-players?query=${encodeURIComponent(value)}`)
            .then((response) => response.json())
            .then((data) => {
                setSuggestions(data);
                // 确保建议列表可见
                const suggestionsElement = document.querySelector('.suggestions-list');
                if (suggestionsElement) {
                    suggestionsElement.style.display = 'block';
                }
            })
            .catch((error) => console.error('搜索选手失败:', error));
    };

    // 改进的键盘事件处理，增加跨平台兼容性
    const handleKeyDown = (e) => {
        if (suggestions.length === 0) return;

        // 获取键值，兼容不同浏览器和平台
        const key = e.key || e.keyCode;
        
        // 使用键值或键码进行判断
        if (key === 'ArrowDown' || key === 40) {
            e.preventDefault();
            const nextIndex = selectedIndex < suggestions.length - 1 ? selectedIndex + 1 : selectedIndex;
            setSelectedIndex(nextIndex);
            if (nextIndex >= 0) {
                setGameState(prev => ({ ...prev, guess: suggestions[nextIndex].name }));
            }
        } 
        else if (key === 'ArrowUp' || key === 38) {
            e.preventDefault();
            const prevIndex = selectedIndex > 0 ? selectedIndex - 1 : 0;
            setSelectedIndex(prevIndex);
            if (prevIndex >= 0) {
                setGameState(prev => ({ ...prev, guess: suggestions[prevIndex].name }));
            }
        } 
        else if (key === 'Enter' || key === 13) {
            e.preventDefault();
            if (selectedIndex >= 0) {
                submitGuessWithName(suggestions[selectedIndex].name);
                setSuggestions([]);
                setSelectedIndex(-1);
            } else if (gameState.guess.trim()) {
                handleGuess();
            }
        }
    };

    const submitGuessWithName = (playerName) => {
        const guessedPlayer = players[playerName];
        if (!guessedPlayer) return;

        // 发送简化的猜测数据
        const guessData = {
            roomId,
            guess: playerName,
            playerData: {
                name: playerName,
                team: guessedPlayer.team,
                country: guessedPlayer.country,
                role: guessedPlayer.role,
                majapp: guessedPlayer.majapp
            }
        };

        // 无论游戏是否开始，都发送猜测数据
        socket.emit('submitGuess', guessData);

        // 添加自己的猜测到聊天消息中
        const message = {
            id: socket.id,
            content: `猜测: ${playerName}`,
            timestamp: Date.now(),
            isGuess: true
        };
        
        setMessages(prev => [...prev, message]);

        // 如果游戏已经开始且有剩余猜测次数，则减少剩余猜测次数
        if (gameState.currentPlayer && gameState.remainingGuesses > 0) {
            setGameState(prev => ({
                ...prev,
                remainingGuesses: prev.remainingGuesses - 1,
                guess: ''
            }));
        } else {
            // 如果游戏还没开始，只是清空输入框
            setGameState(prev => ({
                ...prev,
                guess: ''
            }));
        }
        setSuggestions([]);
    };

    const handleGuess = () => {
        if (!gameState.guess.trim()) return;
        
        const guessedPlayer = players[gameState.guess];
        if (!guessedPlayer) return;

        // 发送简化的猜测数据
        const guessData = {
            roomId,
            guess: gameState.guess,
            playerData: {
                name: gameState.guess,
                team: guessedPlayer.team,
                country: guessedPlayer.country,
                role: guessedPlayer.role,
                majapp: guessedPlayer.majapp
            }
        };

        // 无论游戏是否开始，都发送猜测数据
        socket.emit('submitGuess', guessData);

        // 添加自己的猜测到聊天消息中
        const message = {
            id: socket.id,
            content: `猜测: ${gameState.guess}`,
            timestamp: Date.now(),
            isGuess: true
        };
        
        setMessages(prev => [...prev, message]);

        // 如果游戏已经开始且有剩余猜测次数，则减少剩余猜测次数
        if (gameState.currentPlayer && gameState.remainingGuesses > 0) {
            setGameState(prev => ({
                ...prev,
                remainingGuesses: prev.remainingGuesses - 1,
                guess: ''
            }));
        } else {
            // 如果游戏还没开始，只是清空输入框
            setGameState(prev => ({
                ...prev,
                guess: ''
            }));
        }
        setSuggestions([]);
    };

    const sendMessage = () => {
        if (!newMessage.trim() || !socket) return;

        const message = {
            id: socket.id,
            content: newMessage,
            timestamp: Date.now(),
        };

        // 先添加到本地消息列表，确保立即显示
        setMessages(prev => [...prev, message]);
        
        // 然后发送到服务器
        socket.emit('chatMessage', { roomId, ...message });
        setNewMessage('');
    };

    return (
        <div className="game-room">
            <div className="game-room-container">
                {/* 左侧游戏区域 */}
                <div className="game-main">
                    <div className="game-header">
                        <h2>房间 #{roomId}</h2>
                        <div className="game-status">
                            <span>回合: {currentRound}/{maxRounds}</span>
                            <span>剩余时间: {gameState.timeLeft}秒</span>
                            {startCountdown !== null && (
                                <div className="game-starting-countdown">
                                    游戏即将开始: {startCountdown}秒
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 单人模式风格的输入区域 */}
                    <div className="input-section">
                        <input
                            type="text"
                            value={gameState.guess}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            placeholder="输入选手名字"
                            disabled={gameState.remainingGuesses <= 0}
                            className="player-input"
                        />
                        {suggestions.length > 0 && (
                            <div className="suggestions-list">
                                {suggestions.map((suggestion, index) => (
                                    <div
                                        key={suggestion.name}
                                        className={`suggestion-item ${index === selectedIndex ? 'selected' : ''}`}
                                        onClick={() => {
                                            setGameState((prev) => ({ ...prev, guess: suggestion.name }));
                                            setSuggestions([]);
                                            setSelectedIndex(-1);
                                        }}
                                    >
                                        {suggestion.name}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="button-group">
                        {gameState.currentPlayer ? (
                            <button
                                className="submit-guess"
                                onClick={handleGuess}
                                disabled={gameState.remainingGuesses <= 0}
                            >
                                提交
                            </button>
                        ) : (
                            <button
                                className={`ready-button ${isReady ? 'ready' : ''}`}
                                onClick={onReady}
                                disabled={isReady}
                            >
                                {isReady ? '已准备' : '准备'}
                            </button>
                        )}
                    </div>

                    <div className="progress-container">
                        <div
                            className="progress-bar"
                            style={{width: `${(gameState.remainingGuesses / 8) * 100}%`}}
                        >
                            {gameState.remainingGuesses}
                        </div>
                    </div>

                    {/* 将猜测历史区域分为两列显示 */}
                    <div className="guess-histories">
                        <div className="player-history">
                            <h3>你的猜测</h3>
                            <GuessHistory history={gameState.guessHistory} />
                        </div>
                        <div className="player-history">
                            <h3>对手的猜测</h3>
                            {Object.entries(playersGuesses).map(([playerId, guesses]) => (
                                playerId !== socket.id && (
                                    <GuessHistory key={playerId} history={guesses} />
                                )
                            ))}
                        </div>
                    </div>
                </div>

                <div className={`chat-section ${isChatExpanded ? 'expanded' : 'collapsed'}`}>
                    <div className="chat-header" onClick={() => setIsChatExpanded(!isChatExpanded)}>
                        <h3>聊天</h3>
                        <button className="toggle-button">
                            {isChatExpanded ? '↓' : '↑'}
                        </button>
                    </div>
                    <div className="messages-container">
                        {messages.map((msg, idx) => (
                            <div 
                                key={idx} 
                                className={`message ${msg.id === socket.id ? 'self' : ''}`}
                                data-is-guess={msg.isGuess ? "true" : "false"}
                            >
                                <span className="message-time">
                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                </span>
                                <span className="message-content">{msg.content}</span>
                            </div>
                        ))}
                    </div>
                    <div className="message-input">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            onKeyDown={(e) => {
                                // 使用onKeyDown代替onKeyPress，并支持键码
                                const key = e.key || e.keyCode;
                                if (key === 'Enter' || key === 13) {
                                    sendMessage();
                                }
                            }}
                            placeholder="发送消息..."
                        />
                        <button onClick={sendMessage}>发送</button>
                    </div>
                </div>
            </div>

            {showGameResult && (
                <div className="game-result-modal">
                    <h3>回合结束</h3>
                    <p>正确答案: {gameState.currentPlayer.hiddenName}</p>
                    <button onClick={() => setShowGameResult(false)}>继续</button>
                </div>
            )}
        </div>
    );
}

export default React.memo(GameRoom); // 使用 memo 优化渲染
