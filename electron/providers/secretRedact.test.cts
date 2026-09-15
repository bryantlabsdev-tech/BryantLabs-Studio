import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { redactProviderSecrets } from "./secretRedact.cjs";

const SAMPLES = [
  ["sk-ant-fakeunittest0001", "sk-ant-••••"],
  ["sk-or-fakeunittest0001", "sk-or-••••"],
  ["sk-genericfakekey99", "sk-••••"],
  ["gsk_fakeunittest0001", "gsk_••••"],
  ["AIzaSyFakeUnitTestKey0001", "AIza••••"],
  ["Bearer tok_fake_value", "Bearer ••••"],
  ["x-api-key: sk-ant-headerfake0001", "x-api-key: ••••"],
  ['{"x-api-key":"sk-ant-jsonfake0001"}', '"x-api-key":"••••"'],
  ["https://example.test/v1?key=AIzaSyFakeQueryKey0001", "key=••••"],
];

describe("provider secret redaction", () => {
  for (const [input, expected] of SAMPLES) {
    it(`redacts ${expected}`, () => {
      const redacted = redactProviderSecrets(input);
      assert.equal(redacted.includes("fake"), false);
      assert.equal(redacted.includes("AIzaSy"), false);
      assert.match(redacted, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    });
  }
});
