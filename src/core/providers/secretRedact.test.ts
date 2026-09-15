import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { redactProviderSecrets } from "./secretRedact";

describe("canonical provider secret redaction", () => {
  it("covers listed fake-key, header, and query formats", () => {
    const input = [
      "sk-ant-fakeunittest0001",
      "sk-or-fakeunittest0001",
      "sk-genericfakekey99",
      "gsk_fakeunittest0001",
      "AIzaSyFakeUnitTestKey0001",
      "Bearer tok_fake_value",
      "x-api-key: header-secret",
      '{"x-api-key":"json-secret"}',
      "https://example.test/v1?key=query-secret",
    ].join(" ");
    const redacted = redactProviderSecrets(input);
    assert.equal(redacted.includes("fakeunittest0001"), false);
    assert.equal(redacted.includes("genericfakekey99"), false);
    assert.equal(redacted.includes("AIzaSyFake"), false);
    assert.equal(redacted.includes("tok_fake_value"), false);
    assert.equal(redacted.includes("header-secret"), false);
    assert.equal(redacted.includes("json-secret"), false);
    assert.equal(redacted.includes("query-secret"), false);
    assert.match(redacted, /sk-ant-••••/);
    assert.match(redacted, /sk-or-••••/);
    assert.match(redacted, /gsk_••••/);
    assert.match(redacted, /AIza••••/);
    assert.match(redacted, /Bearer ••••/);
    assert.match(redacted, /x-api-key: ••••/);
    assert.match(redacted, /key=••••/);
  });
});
