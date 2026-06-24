import { useState, useEffect } from 'react';

export function App() {
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let interval: number | undefined;
    if (isActive) {
      interval = setInterval(() => {
        setSeconds((prevSeconds) => prevSeconds + 1);
      }, 1000);
    } else if (!isActive && seconds !== 0) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive, seconds]);

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const toggleTimer = () => {
    setIsActive(!isActive);
  };

  const resetTimer = () => {
    setSeconds(0);
    setIsActive(false);
  };

  return (
    <main>
      <h1>Sudoku</h1>
      <p>Puzzle board fixture for BryantLabs Studio Playwright tests.</p>
      <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '10px', borderRadius: '5px' }}>
        <h2>Timer: {formatTime(seconds)}</h2>
        <button onClick={toggleTimer} style={{ marginRight: '10px', padding: '8px 15px', cursor: 'pointer' }}>
          {isActive ? 'Pause' : 'Start'}
        </button>
        <button onClick={resetTimer} style={{ padding: '8px 15px', cursor: 'pointer' }}>
          Reset
        </button>
      </div>
    </main>
  );
}