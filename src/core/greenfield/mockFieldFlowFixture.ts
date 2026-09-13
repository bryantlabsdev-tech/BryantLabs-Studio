/** Test-only selector for the deterministic FieldFlow multi-page mock fixture. */
export const MOCK_FIELDFLOW_MULTIPAGE_FIXTURE_TOKEN =
  "BRYANTLABS_E2E_FIXTURE:fieldflow-multipage";

export const MOCK_FIELDFLOW_MULTIPAGE_FIXTURE_ENV_VALUE = "fieldflow-multipage";

export function isMockFieldFlowMultipageFixturePrompt(text: string): boolean {
  return text.includes(MOCK_FIELDFLOW_MULTIPAGE_FIXTURE_TOKEN);
}
