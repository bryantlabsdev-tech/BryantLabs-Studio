import { useState } from "react";
import { History } from "./components/History";
import { compute } from "./math";

export function App() {
  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [entries, setEntries] = useState<string[]>([]);

  function inputDigit(d: string) {
    setDisplay((prev) => (prev === "0" ? d : prev + d));
  }

  function applyOp(next: string) {
    const value = Number(display);
    if (stored !== null && op) {
      const result = compute(stored, value, op);
      setStored(result);
      setDisplay(String(result));
    } else {
      setStored(value);
    }
    setOp(next);
  }

  function equals() {
    if (stored === null || op === null) return;
    const result = compute(stored, Number(display), op);
    setEntries((prev) => [...prev, `${stored} ${op} ${display} = ${result}`]);
    setDisplay(String(result));
    setStored(null);
    setOp(null);
  }

  function clear() {
    setDisplay("0");
    setStored(null);
    setOp(null);
  }

  return (
    <main>
      <h1>Calculator</h1>
      <output aria-label="display">{display}</output>
      <div>
        {"0123456789".split("").map((d) => (
          <button key={d} type="button" onClick={() => inputDigit(d)}>
            {d}
          </button>
        ))}
        {["+", "-", "*", "/"].map((symbol) => (
          <button key={symbol} type="button" onClick={() => applyOp(symbol)}>
            {symbol}
          </button>
        ))}
        <button type="button" onClick={equals}>
          =
        </button>
        <button type="button" onClick={clear}>
          C
        </button>
      </div>
      <History entries={entries} />
    </main>
  );
}
