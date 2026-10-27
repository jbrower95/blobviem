const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ed25519 } = require("@noble/curves/ed25519");
const { base58, base64urlnopad } = require("@scure/base");
const {
  registerSolanaPasskey,
  initializeSolanaWallet,
  discardSolanaEnrollment,
  recoverSolanaWallet,
  signSolanaMessage,
} = require("../dist/solana.js");
const challenge = () => crypto.getRandomValues(new Uint8Array(32));
const options = () => ({
  challenge: challenge(),
  rpId: "calledit.sillyventures.co",
});
function authenticator() {
  const rawId = crypto.getRandomValues(new Uint8Array(16));
  const id = base64urlnopad.encode(rawId);
  let stored = null,
    writes = 0,
    failNext = false;
  const calls = [];
  const make = (largeBlob) => ({
    type: "public-key",
    id,
    rawId: rawId.slice().buffer,
    authenticatorAttachment: "platform",
    response: {
      authenticatorData: new Uint8Array(37).buffer,
      clientDataJSON: new TextEncoder().encode("{}").buffer,
      signature: new Uint8Array(64).buffer,
      userHandle: new Uint8Array([1]).buffer,
    },
    getClientExtensionResults: () => ({ largeBlob }),
  });
  return {
    calls,
    get writes() {
      return writes;
    },
    get stored() {
      return stored?.slice();
    },
    fail() {
      failNext = true;
    },
    port: {
      create: async (args) => {
        calls.push(args);
        return make({ supported: true });
      },
      get: async (args) => {
        calls.push(args);
        if (failNext) {
          failNext = false;
          throw new Error("User cancelled");
        }
        const blob = args.publicKey.extensions.largeBlob;
        if (blob.write) {
          stored = new Uint8Array(blob.write).slice();
          writes++;
          return make({ written: true });
        }
        return make({ blob: stored?.slice().buffer });
      },
    },
  };
}
async function enroll(a, xUserId = "x:123") {
  return registerSolanaPasskey(
    {
      xUserId,
      options: {
        challenge: challenge(),
        rp: { id: "calledit.sillyventures.co", name: "CalledIt" },
        user: { id: new Uint8Array([1]), name: "alice", displayName: "Alice" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      },
    },
    a.port,
  );
}
test("Solana seed is stored once, signs real Ed25519 bytes, and never appears in returned assertion", async () => {
  const a = authenticator();
  const { enrollment } = await enroll(a);
  const { binding } = await initializeSolanaWallet(
    enrollment,
    options(),
    a.port,
  );
  assert.equal(a.writes, 1);
  assert.equal(binding.credentialId.length, 22);
  assert.ok(!binding.credentialId.includes("="));
  const message = new TextEncoder().encode("calledit authentication challenge");
  const result = await signSolanaMessage(binding, message, options(), a.port);
  assert.ok(
    ed25519.verify(result.signature, message, base58.decode(binding.address)),
  );
  assert.deepEqual(result.assertion.clientExtensionResults, {});
  assert.ok(!JSON.stringify(result.assertion).includes("seed"));
  assert.ok(
    a.calls.every(
      (c) =>
        c.publicKey.authenticatorSelection?.userVerification === "required" ||
        c.publicKey.userVerification === "required",
    ),
  );
  await assert.rejects(
    initializeSolanaWallet(enrollment, options(), a.port),
    /cannot be regenerated/,
  );
  assert.equal(a.writes, 1);
});
test("cancelled initialization retries with the same seed; replay cannot overwrite it", async () => {
  const a = authenticator();
  const { enrollment } = await enroll(a);
  a.fail();
  await assert.rejects(
    initializeSolanaWallet(enrollment, options(), a.port),
    /cancelled/,
  );
  const result = await initializeSolanaWallet(enrollment, options(), a.port);
  const stored = a.stored;
  await assert.rejects(initializeSolanaWallet(enrollment, options(), a.port));
  assert.deepEqual(a.stored, stored);
  assert.equal(a.writes, 1);
  const recovered = await recoverSolanaWallet(enrollment, options(), a.port);
  assert.equal(recovered.binding.address, result.binding.address);
});
test("recovery is read-only and an X account cannot read another account’s wallet", async () => {
  const a = authenticator();
  const { enrollment } = await enroll(a);
  const { binding } = await initializeSolanaWallet(
    enrollment,
    options(),
    a.port,
  );
  await assert.rejects(
    recoverSolanaWallet(
      { ...enrollment, xUserId: "x:attacker" },
      options(),
      a.port,
    ),
    /not bound/,
  );
  await assert.rejects(
    signSolanaMessage(
      { ...binding, address: base58.encode(new Uint8Array(32)) },
      new Uint8Array([1]),
      options(),
      a.port,
    ),
    /does not match/,
  );
  assert.equal(a.writes, 1);
});
test("short challenges, wrong RP, forged enrollment and discarded enrollment are rejected", async () => {
  const a = authenticator();
  const { enrollment } = await enroll(a);
  await assert.rejects(
    initializeSolanaWallet(
      enrollment,
      { ...options(), challenge: new Uint8Array(1) },
      a.port,
    ),
    /fresh server challenge/,
  );
  await assert.rejects(
    initializeSolanaWallet(
      enrollment,
      { ...options(), rpId: "evil.example" },
      a.port,
    ),
    /scope/,
  );
  await assert.rejects(
    initializeSolanaWallet({ ...enrollment }, options(), a.port),
    /cannot be regenerated/,
  );
  discardSolanaEnrollment(enrollment);
  await assert.rejects(initializeSolanaWallet(enrollment, options(), a.port));
  assert.equal(a.writes, 0);
});
test("missing wallet data fails without generating a replacement", async () => {
  const a = authenticator();
  const { enrollment } = await enroll(a);
  await assert.rejects(
    recoverSolanaWallet(enrollment, options(), a.port),
    /original authenticator/,
  );
  assert.equal(a.writes, 0);
});
test("message is snapshotted before waiting for the authenticator", async () => {
  const a = authenticator();
  const { enrollment } = await enroll(a);
  const { binding } = await initializeSolanaWallet(
    enrollment,
    options(),
    a.port,
  );
  const message = new Uint8Array([1, 2, 3]);
  const original = message.slice();
  const pending = signSolanaMessage(binding, message, options(), a.port);
  message.fill(9);
  const { signature } = await pending;
  assert.ok(
    ed25519.verify(signature, original, base58.decode(binding.address)),
  );
  assert.ok(
    !ed25519.verify(signature, message, base58.decode(binding.address)),
  );
});
