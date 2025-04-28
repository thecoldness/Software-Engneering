import React from 'react';
import './GuessHistory.css';

function GuessHistory({ history, player, isOpponent = false }) { // 添加 isOpponent prop
    if (!history || history.length === 0) return null;

    return (
        <div className="history-container">
            <table className="guess-table">
                <thead>
                    <tr>
                        <th>名字</th>
                        <th>队伍</th>
                        <th>国家及地区</th>
                        <th>年龄</th>
                        <th>角色</th>
                        <th>Major次数</th>
                    </tr>
                </thead>
                <tbody>
                    {history.map((guess, index) => (
                        <tr key={index}>
                            <td>{isOpponent ? '***' : guess.name}</td>
                            <td className={guess.teamCorrect ? 'correct' : 'incorrect'}>
                                {isOpponent ? '***' : guess.team}
                            </td>
                            <td className={guess.countryCorrect ? 'correct' : 
                                 (guess.countryRegion === guess.targetCountryRegion ? 'close' : 'incorrect')}>
                                 {isOpponent ? '***' : guess.country}
                            </td>
                            <td className={`age-cell ${guess.birth_year}`}>
                                {isOpponent ? '***' : guess.guessedAge}
                                {!isOpponent && guess.birth_year !== 'correct' && (
                                    <span className="indicator">
                                        {guess.birth_year === 'higher' ? '↑' : 
                                         guess.birth_year === 'close' ? 
                                            (guess.guessedAge > guess.targetAge ? '↓' : '↑') : 
                                         '↓'}
                                    </span>
                                )}
                            </td>
                            <td className={guess.roleCorrect ? 'correct' : 'incorrect'}>
                                {isOpponent ? '***' : guess.role}
                            </td>
                            <td className={`majapp-cell ${guess.majapp}`}>
                                {isOpponent ? '***' : guess.guessedMajapp}
                                {!isOpponent && guess.majapp !== 'correct' && (
                                    <span className="indicator">
                                        {guess.majapp === 'higher' ? '↓' : 
                                         guess.majapp === 'close' ? 
                                            (guess.guessedMajapp > guess.targetMajapp ? '↓' : '↑') : 
                                         '↑'}
                                    </span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default GuessHistory;
