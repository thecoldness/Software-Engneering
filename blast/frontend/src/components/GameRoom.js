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

    // 区域映射 - 与 SinglePlayer 保持一致
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

    const getRegion = (country) => {
        for (const [region, countries] of Object.entries(regionMapping)) {
            if (countries.includes(country)) {
                return region;
            }
        }
        return 'Other';
    };

    // 添加国家中英文映射 - 与 SinglePlayer 保持一致
    const countryTranslations = {
        'China': '中国',
        'Mongolia': '蒙古',
        'Indonesia': '印度尼西亚',
        'Malaysia': '马来西亚',
        'Turkey': '土耳其',
        'India': '印度',
        'Israel': '以色列',
        'Jordan': '约旦',
        'Uzbekistan': '乌兹别克斯坦',
        'Australia': '澳大利亚',
        'New Zealand': '新西兰',
        'France': '法国',
        'Germany': '德国',
        'Sweden': '瑞典',
        'Denmark': '丹麦',
        'Poland': '波兰',
        'Spain': '西班牙',
        'Italy': '意大利',
        'Finland': '芬兰',
        'Norway': '挪威',
        'Latvia': '拉脱维亚',
        'Estonia': '爱沙尼亚',
        'Bosnia and Herzegovina': '波黑',
        'Montenegro': '黑山',
        'Serbia': '塞尔维亚',
        'Bulgaria': '保加利亚',
        'Czech Republic': '捷克',
        'Switzerland': '瑞士',
        'Netherlands': '荷兰',
        'Slovakia': '斯洛伐克',
        'Lithuania': '立陶宛',
        'Romania': '罗马尼亚',
        'United Kingdom': '英国',
        'Ukraine': '乌克兰',
        'Belgium': '比利时',
        'Hungary': '匈牙利',
        'Portugal': '葡萄牙',
        'Kosovo': '科索沃',
        'South Africa': '南非',
        'Brazil': '巴西',
        'Uruguay': '乌拉圭',
        'Argentina': '阿根廷',
        'Chile': '智利',
        'Guatemala': '危地马拉',
        'United States': '美国',
        'Canada': '加拿大',
        'Russia': '俄罗斯',
        'Kazakhstan': '哈萨克斯坦',
        'Belarus': '白俄罗斯'
    };

    // 新增函数：提取纯队伍名称（移除角色后缀）- 与 SinglePlayer 保持一致
    const getTeamName = (team) => {
        return team.replace(/\s*\((coach|benched)\)$/i, '');
    };

    const getAge = (birthYear) => 2025 - birthYear;

    // 比较函数 - 与 SinglePlayer 保持一致
    const compareValues = (guessed, target) => {
        if (guessed === target) return 'correct';
        const diff = Math.abs(guessed - target);
        if (diff <= 3) return 'close'; // 修改为 3 年内为接近
        return guessed > target ? 'higher' : 'lower';
    };

    const compareMajors = (guessed, target) => {
        if (guessed === target) return 'correct';
        const diff = Math.abs(guessed - target);
        if (diff <= 2) return 'close'; // 修改为 2 次以内为接近
        return guessed > target ? 'higher' : 'lower';
    };

    const guessHistoryRef = useRef([]);
    const playersRef = useRef({});

    // 获取随机选手
    const fetchRandomPlayer = () => {
        fetch(`${API_BASE_URL}/api/random-player`)
            .then(response => {
                if (!response.ok) throw new Error('无法获取随机选手');
                return response.json();
            })
            .then(async data => {
                const decryptedData = await decryptData(data.encryptedData);
                setPlayer(decryptedData);
                setGuess('');
                setSuggestions([]);
                setGuessHistory([]);
                setRemainingGuesses(8);
                setShowGameResult(false);
            })
            .catch(error => console.error('获取随机选手失败:', error));
    };

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/players`)
            .then(response => {
                if (!response.ok) throw new Error('无法获取选手数据');
                return response.json();
            })
            .then(data => setPlayers(data))
            .catch(err => console.error('获取玩家数据失败:', err));

        fetchRandomPlayer();
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

        // 处理玩家准备状态更新
        const handlePlayersReadyStatus = ({ readyPlayers }) => {
            console.log('Players ready status updated:', readyPlayers);
            // 不需要直接设置isReady，因为它是一个prop
            // 只需要在控制台记录当前玩家的准备状态
            console.log('Current player ready status:', readyPlayers.includes(socket.id));
            // isReady状态由父组件管理，这里不需要设置
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
            
            // 创建一个标准格式的猜测记录
            const guessRecord = {
                name: guess,
                ...result,
                timestamp: Date.now()
            };
            
            // 如果是自己的猜测，添加到自己的历史记录中
            if (playerId === socket.id) {
                setGameState(prev => ({
                    ...prev,
                    guessHistory: [...(prev.guessHistory || []), guessRecord]
                }));
                
                // 同时更新引用，确保其他地方也能访问到最新的历史记录
                guessHistoryRef.current = [...guessHistoryRef.current, guessRecord];
            }
            
            // 无论是谁的猜测，都添加到玩家猜测记录中
            setPlayersGuesses(prev => {
                const newGuesses = { ...prev };
                if (!newGuesses[playerId]) {
                    newGuesses[playerId] = [];
                }
                newGuesses[playerId].push(guessRecord);
                return newGuesses;
            });
        };

        // 不再需要单独处理游戏开始前的玩家猜测，因为现在所有猜测都通过guessResult事件处理

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
        socket.on('chatMessage', handleChatMessage);
        socket.on('chatHistory', handleChatHistory);
        socket.on('playersReadyStatus', handlePlayersReadyStatus);

        // 清理函数
        return () => {
            socket.off('gameStarting', handleGameStarting);
            socket.off('roundStart', handleRoundStart);
            socket.off('roundEnd', handleRoundEnd);
            socket.off('guessResult', handleGuessResult);
            socket.off('chatMessage', handleChatMessage);
            socket.off('chatHistory', handleChatHistory);
            socket.off('playersReadyStatus', handlePlayersReadyStatus);
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

    // 添加一个新的函数来处理直接用名字提交 - 仿照 SinglePlayer
    const submitGuessWithName = (playerName) => {
        if (!gameState.currentPlayer || gameState.remainingGuesses <= 0) return;

        let guessedPlayer = players[playerName];
        
        if (!guessedPlayer) {
            const matchedEntry = Object.entries(players).find(
                ([name]) => name.toLowerCase() === playerName.toLowerCase()
            );
            
            if (matchedEntry) {
                guessedPlayer = matchedEntry[1];
            }
        }

        if (!guessedPlayer) {
            setGameState(prev => ({ ...prev, guess: '' }));
            return;
        }

        // 构建新的猜测数据 - 与 SinglePlayer 保持一致
        const newGuess = {
            name: playerName,
            team: guessedPlayer.team,
            teamCorrect: getTeamName(guessedPlayer.team) === getTeamName(gameState.currentPlayer.team),
            country: countryTranslations[guessedPlayer.country] || guessedPlayer.country,
            countryCorrect: String(guessedPlayer.country).toLowerCase() === String(gameState.currentPlayer.country).toLowerCase(),
            countryRegion: getRegion(guessedPlayer.country),
            targetCountryRegion: getRegion(gameState.currentPlayer.country),
            birth_year: compareValues(guessedPlayer.birth_year, gameState.currentPlayer.birth_year),
            guessedAge: 2025 - guessedPlayer.birth_year,
            targetAge: 2025 - gameState.currentPlayer.birth_year,
            role: guessedPlayer.role,
            roleCorrect: guessedPlayer.role.toLowerCase() === gameState.currentPlayer.role.toLowerCase(),
            majapp: compareMajors(guessedPlayer.majapp, gameState.currentPlayer.majapp),
            guessedMajapp: guessedPlayer.majapp,
            targetMajapp: gameState.currentPlayer.majapp
        };

        // 发送猜测数据到服务器
        const guessData = {
            roomId,
            guess: playerName,
            playerData: {
                name: playerName,
                team: guessedPlayer.team,
                country: guessedPlayer.country,
                role: guessedPlayer.role,
                majapp: guessedPlayer.majapp,
                birth_year: guessedPlayer.birth_year
            }
        };
        socket.emit('submitGuess', guessData);

        // 更新本地状态
        setGameState(prev => ({
            ...prev,
            guessHistory: [...prev.guessHistory, newGuess],
            remainingGuesses: prev.remainingGuesses - 1,
            guess: ''
        }));

        // 更新进度条
        const progressBar = document.querySelector('.progress-bar');
        if (progressBar) {
            progressBar.style.width = `${((gameState.remainingGuesses - 1) / 8) * 100}%`;
        }

        setSuggestions([]);

        // 检查是否猜对或用完猜测次数
        if (playerName.toLowerCase() === gameState.currentPlayer.hiddenName.toLowerCase() || gameState.remainingGuesses - 1 === 0) {
            setShowGameResult(true);
        }
    };

    // 提交猜测 - 仿照 SinglePlayer
    const handleGuess = () => {
        if (!gameState.currentPlayer || gameState.remainingGuesses <= 0 || !gameState.guess.trim()) return;

        // 先尝试完全匹配
        let guessedPlayer = players[gameState.guess];
        
        // 如果完全匹配未找到，再尝试不区分大小写的匹配
        if (!guessedPlayer) {
            const matchedEntry = Object.entries(players).find(
                ([name]) => name.toLowerCase() === gameState.guess.toLowerCase()
            );
            
            if (matchedEntry) {
                setGameState(prev => ({ ...prev, guess: matchedEntry[0] })); // 设置为正确的大小写形式
                guessedPlayer = matchedEntry[1];
            }
        }

        if (!guessedPlayer) {
            setGameState(prev => ({ ...prev, guess: '' }));
            return;
        }

        // 构建新的猜测数据 - 与 SinglePlayer 保持一致
        const newGuess = {
            name: gameState.guess,
            team: guessedPlayer.team,
            teamCorrect: getTeamName(guessedPlayer.team) === getTeamName(gameState.currentPlayer.team),
            country: countryTranslations[guessedPlayer.country] || guessedPlayer.country,
            countryCorrect: String(guessedPlayer.country).toLowerCase() === String(gameState.currentPlayer.country).toLowerCase(),
            countryRegion: getRegion(guessedPlayer.country),
            targetCountryRegion: getRegion(gameState.currentPlayer.country),
            birth_year: compareValues(guessedPlayer.birth_year, gameState.currentPlayer.birth_year),
            guessedAge: 2025 - guessedPlayer.birth_year,
            targetAge: 2025 - gameState.currentPlayer.birth_year,
            role: guessedPlayer.role,
            roleCorrect: guessedPlayer.role.toLowerCase() === gameState.currentPlayer.role.toLowerCase(),
            majapp: compareMajors(guessedPlayer.majapp, gameState.currentPlayer.majapp),
            guessedMajapp: guessedPlayer.majapp,
            targetMajapp: gameState.currentPlayer.majapp
        };

        // 发送猜测数据到服务器
        const guessData = {
            roomId,
            guess: gameState.guess,
            playerData: {
                name: gameState.guess,
                team: guessedPlayer.team,
                country: guessedPlayer.country,
                role: guessedPlayer.role,
                majapp: guessedPlayer.majapp,
                birth_year: guessedPlayer.birth_year
            }
        };
        socket.emit('submitGuess', guessData);

        // 更新本地状态
        setGameState(prev => ({
            ...prev,
            guessHistory: [...prev.guessHistory, newGuess],
            remainingGuesses: prev.remainingGuesses - 1,
            guess: ''
        }));

        // 更新进度条
        const progressBar = document.querySelector('.progress-bar');
        if (progressBar) {
            progressBar.style.width = `${((gameState.remainingGuesses - 1) / 8) * 100}%`;
        }

        setSuggestions([]);

        // 检查是否猜对或用完猜测次数
        if (gameState.guess.toLowerCase() === gameState.currentPlayer.hiddenName.toLowerCase() || gameState.remainingGuesses - 1 === 0) {
            setShowGameResult(true);
        }
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

                    {/* 猜测历史区域 */}
                    <div className="guess-histories">
                        <div>
                            <h3>你的猜测</h3>
                            <GuessHistory history={gameState.guessHistory || []} player={gameState.currentPlayer} />
                        </div>
                        <div>
                            <h3>对手的猜测</h3>
                            {Object.entries(playersGuesses).map(([playerId, guesses]) => (
                                playerId !== socket.id && (
                                    <GuessHistory key={playerId} history={guesses} player={gameState.currentPlayer} />
                                )
                            ))}
                            {/* 如果没有对手的猜测，显示空表格 */}
                            {Object.keys(playersGuesses).filter(id => id !== socket.id).length === 0 && (
                                <GuessHistory history={[]} player={gameState.currentPlayer} />
                            )}
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

            {/* 游戏结果弹窗 - 与 SinglePlayer 保持一致 */}
            {showGameResult && gameState.currentPlayer && (
                <div className="game-result-modal">
                    <div className="game-result-title">
                        {gameState.guessHistory.some(g => g.name.toLowerCase() === gameState.currentPlayer.hiddenName.toLowerCase()) 
                            ? '恭喜猜对了！' 
                            : '游戏结束'}
                    </div>
                    <div className="game-result-content">
                        <div className="player-info-item">
                            <span className="player-info-label">选手名字:</span>
                            <span className="player-info-value">{gameState.currentPlayer.hiddenName}</span>
                        </div>
                        <div className="player-info-item">
                            <span className="player-info-label">所属战队:</span>
                            <span className="player-info-value">{gameState.currentPlayer.team}</span>
                        </div>
                        <div className="player-info-item">
                            <span className="player-info-label">国家及地区:</span>
                            <span className="player-info-value">
                                {countryTranslations[gameState.currentPlayer.country] || gameState.currentPlayer.country}
                            </span>
                        </div>
                        <div className="player-info-item">
                            <span className="player-info-label">出生年份:</span>
                            <span className="player-info-value">{gameState.currentPlayer.birth_year}</span>
                        </div>
                        <div className="player-info-item">
                            <span className="player-info-label">游戏角色:</span>
                            <span className="player-info-value">{gameState.currentPlayer.role}</span>
                        </div>
                        <div className="player-info-item">
                            <span className="player-info-label">Major次数:</span>
                            <span className="player-info-value">{gameState.currentPlayer.majapp}</span>
                        </div>
                        {players[gameState.currentPlayer.hiddenName]?.link && (
                            <a 
                                className="game-result-link"
                                href={players[gameState.currentPlayer.hiddenName]?.link}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                查看选手资料 →
                            </a>
                        )}
                    </div>
                    <div className="game-result-buttons">
                        <button className="button-continue" onClick={() => setShowGameResult(false)}>
                            继续
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default React.memo(GameRoom); // 使用 memo 优化渲染
