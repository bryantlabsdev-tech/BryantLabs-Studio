import { useState } from "react";

type Grid = (number | null)[][];

const puzzle: Grid = [
  [5, 3, null, null, 7, null, null, null, null],
  [6, null, null, 1, 9, 5, null, null, null],
  [null, 9, 8, null, null, null, null, 6, null],
  [8, null, null, null, 6, null, null, null, 3],
  [4, null, null, 8, null, 3, null, null, 1],
  [7, null, null, null, 2, null, null, null, 6],
  [null, 6, null, null, null, null, 2, 8, null],
  [null, null, null, 4, 1, 9, null, null, 5],
  [null, null, null, null, 8, null, null, 7, 9],
];

function App() {
  const [grid] = useState<Grid>(puzzle);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);

  return (
    <div className="app-container">
      <header>
        <h1>Sudoku</h1>
        <div className="game-controls">
          <select aria-label="Difficulty">
            <option>Easy</option>
          </select>
          <button className="btn primary" type="button">
            New Game
          </button>
        </div>
      </header>
      <main>
        <div className="sudoku-board">
          {grid.map((row, rIndex) => (
            <div key={rIndex} className="cell-row">
              {row.map((cell, cIndex) => (
                <div
                  key={cIndex}
                  className="cell"
                  onClick={() => setSelected({ row: rIndex, col: cIndex })}
                >
                  {cell}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="right-panel">
          <div className="number-pad">
            {Array.from({ length: 9 }, (_, i) => i + 1).map((num) => (
              <button key={num} className="btn" type="button">
                {num}
              </button>
            ))}
          </div>
          <div className="action-buttons">
            <button className="btn" type="button">
              Erase
            </button>
            <button className="btn" type="button">
              Hint (3)
            </button>
          </div>
        </div>
      </main>
      {selected ? <p className="sr-only">Selected {selected.row},{selected.col}</p> : null}
    </div>
  );
}

export default App;
