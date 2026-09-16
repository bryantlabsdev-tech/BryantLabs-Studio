export function History({ entries }: { entries: string[] }) {
  return (
    <section aria-label="calculation history">
      <h2>History</h2>
      <ul>
        {entries.slice(-10).map((entry, i) => {
          const label = entry.trim();
          const formatted = label.length > 0 ? label : "(empty)";
          return (
            <li key={i}>
              <span>{formatted}</span>
              <span>{formatted}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
