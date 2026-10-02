import { createHash, webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex, sha256HexOfBytes } from "./sha256";

const reference = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("sha256Hex", () => {
  it("matches node:crypto for boundary lengths", () => {
    for (const length of [0, 1, 55, 56, 63, 64, 65, 1000]) {
      const bytes = new Uint8Array(length).map((_, index) => (index * 31 + 7) & 0xff);
      expect(sha256Hex(bytes)).toBe(reference(bytes));
    }
  });

  it("matches node:crypto for known vectors", () => {
    expect(sha256Hex(new TextEncoder().encode(""))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("matches node:crypto for a multi-block buffer", () => {
    const bytes = new Uint8Array(1_048_576).map((_, index) => (index * 131 + 17) & 0xff);
    expect(sha256Hex(bytes)).toBe(reference(bytes));
  });
});

describe("sha256HexOfBytes", () => {
  it("agrees with the fallback when WebCrypto is unavailable", async () => {
    const bytes = new TextEncoder().encode("plain http deployment");
    const original = globalThis.crypto;
    // Simulate a non-secure context, where `crypto.subtle` is not defined.
    Object.defineProperty(globalThis, "crypto", { value: { getRandomValues: original.getRandomValues.bind(original) }, configurable: true });
    try {
      await expect(sha256HexOfBytes(bytes)).resolves.toBe(sha256Hex(bytes));
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
    }
  });

  it("uses WebCrypto when it is available", async () => {
    const bytes = new TextEncoder().encode("secure context");
    const expected = Buffer.from(await webcrypto.subtle.digest("SHA-256", bytes)).toString("hex");
    await expect(sha256HexOfBytes(bytes)).resolves.toBe(expected);
  });
});
