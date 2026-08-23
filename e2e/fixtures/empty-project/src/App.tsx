export default function App() {
  return (
    <main className="task-manager">
      <h1>Tasks</h1>
      <ul>
        <li>Sample task</li>
      </ul>
      <form>
        <input aria-label="New task" placeholder="Add a task" />
        <button type="submit">Add</button>
      </form>
    </main>
  );
}
