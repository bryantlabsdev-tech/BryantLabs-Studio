export default function App() {
  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0"];
  return (
    <main className="calculator mock-greenfield">
      <div className="calculator-display" aria-label="display">
        0
      </div>
      <div className="number-pad">
        {keys.map((key) => (
          <button key={key} type="button">
            {key}
          </button>
        ))}
      </div>
    </main>
  );
}