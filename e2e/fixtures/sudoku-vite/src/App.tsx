import { useState } from "react";

/** Independently authored 9×9 starter grid. 0 means empty. */
const GIVENS: readonly (readonly number[])[] = [
  [8, 0, 0, 0, 1, 0, 0, 0, 9],
  [0, 5, 0, 8, 0, 7, 0, 1, 0],
  [0, 0, 4, 0, 0, 0, 6, 0, 0],
  [0, 1, 0, 0, 8, 0, 0, 9, 0],
  [7, 0, 0, 2, 0, 9, 0, 0, 3],
  [0, 6, 0, 0, 7, 0, 0, 5, 0],
  [0, 0, 5, 0, 0, 0, 8, 0, 0],
  [0, 8, 0, 6, 0, 1, 0, 3, 0],
  [2, 0, 0, 0, 3, 0, 0, 0, 4],
];

function cloneBoard(source: readonly (readonly number[])[]): number[][] {
  return source.map((row) => [...row]);
}

export function App() {
  const [board, setBoard] = useState(() => cloneBoard(GIVENS));

  return (
    <main className="sudoku-shell">
      <h1>Sudoku</h1>
      <p>Nine-by-nine board fixture for Studio Playwright and edit-stress tests.</p>
      <div className="sudoku-board" role="grid" aria-label="Sudoku board">
        {board.map((row, rowIndex) => (
          <div className="sudoku-row" role="row" key={`r${rowIndex}`}>
            {row.map((value, colIndex) => {
              const given = GIVENS[rowIndex]![colIndex]! !== 0;
              return (
                <input
                  key={`c${rowIndex}-${colIndex}`}
                  className={given ? "sudoku-cell given" : "sudoku-cell"}
                  role="gridcell"
                  inputMode="numeric"
                  maxLength={1}
                  aria-label={`Row ${rowIndex + 1} column ${colIndex + 1}`}
                  readOnly={given}
                  value={value === 0 ? "" : String(value)}
                  onChange={(event) => {
                    const digit = event.target.value.replace(/\D/g, "").slice(0, 1);
                    const next = Number.parseInt(digit, 10);
                    setBoard((current) => {
                      const copy = cloneBoard(current);
                      copy[rowIndex]![colIndex] = Number.isNaN(next) ? 0 : next;
                      return copy;
                    });
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </main>
  );
}
