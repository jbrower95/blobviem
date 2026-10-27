/** Solana largeBlob wallet. The application must verify WebAuthn on its server. */
import { ed25519 } from "@noble/curves/ed25519";
import { base58, base64urlnopad } from "@scure/base";

type LargeBlobOutput = {
  supported?: boolean;
  written?: boolean;
  blob?: ArrayBuffer;
};
type ExtensionOutput = AuthenticationExtensionsClientOutputs & {
  largeBlob?: LargeBlobOutput;
};
export type PublicAssertion = {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle?: string;
  };
  clientExtensionResults: Record<string, never>;
  authenticatorAttachment?: string;
};
export type WalletBinding = {
  credentialId: string;
  address: string;
  xUserId: string;
  rpId: string;
};
export type Enrollment = {
  credentialId: string;
  xUserId: string;
  rpId: string;
};
export type CredentialPort = Pick<CredentialsContainer, "create" | "get">;
type Pending = {
  seed: Uint8Array;
  binding: Enrollment;
  state: "new" | "writing" | "written";
};
const enrollments = new WeakMap<Enrollment, Pending>();
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const b64 = (value: ArrayBuffer) => base64urlnopad.encode(new Uint8Array(value));
function bytes(value: BufferSource): Uint8Array {
  return value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}
function assertChallenge(challenge: BufferSource) {
  if (bytes(challenge).byteLength < 32)
    throw new Error(
      "A fresh server challenge of at least 32 bytes is required.",
    );
}
function port(provided?: CredentialPort): CredentialPort {
  const value = provided ?? globalThis.navigator?.credentials;
  if (!value) throw new Error("WebAuthn is unavailable in this browser.");
  return value;
}
function isCredential(
  value: Credential | null,
): asserts value is PublicKeyCredential {
  if (!value || value.type !== "public-key")
    throw new Error("Passkey operation was cancelled.");
}
function assertion(credential: PublicKeyCredential): PublicAssertion {
  const response = credential.response as AuthenticatorAssertionResponse;
  if (!response.authenticatorData || !response.signature)
    throw new Error("Expected a WebAuthn assertion.");
  // Never return client extensions: a largeBlob read contains the private seed.
  return {
    id: credential.id,
    rawId: b64(credential.rawId),
    type: "public-key",
    response: {
      authenticatorData: b64(response.authenticatorData),
      clientDataJSON: b64(response.clientDataJSON),
      signature: b64(response.signature),
      ...(response.userHandle ? { userHandle: b64(response.userHandle) } : {}),
    },
    clientExtensionResults: {},
    ...(credential.authenticatorAttachment
      ? { authenticatorAttachment: credential.authenticatorAttachment }
      : {}),
  };
}
function boundRequest(
  binding: Enrollment,
  options: PublicKeyCredentialRequestOptions,
) {
  assertChallenge(options.challenge);
  if (options.rpId !== binding.rpId)
    throw new Error("Passkey relying-party scope does not match.");
  return {
    ...options,
    userVerification: "required" as const,
    allowCredentials: [
      {
        id: Uint8Array.from(base64urlnopad.decode(binding.credentialId)).buffer,
        type: "public-key" as const,
      },
    ],
  };
}
function verifyCredentialId(credential: PublicKeyCredential, expected: string) {
  if (credential.id !== expected || b64(credential.rawId) !== expected)
    throw new Error("Unexpected credential returned by authenticator.");
}
/** First user gesture. Send the returned credential to your server for verification. */
export async function registerSolanaPasskey(
  input: { xUserId: string; options: PublicKeyCredentialCreationOptions },
  credentials?: CredentialPort,
) {
  if (!input.xUserId || input.xUserId.length > 128)
    throw new Error("A verified X user ID is required.");
  assertChallenge(input.options.challenge);
  if (!input.options.rp.id)
    throw new Error("An explicit relying-party ID is required.");
  const credential = await port(credentials).create({
    publicKey: {
      ...input.options,
      authenticatorSelection: {
        ...input.options.authenticatorSelection,
        residentKey: "required",
        userVerification: "required",
      },
      extensions: {
        ...input.options.extensions,
        largeBlob: { support: "required" },
      } as AuthenticationExtensionsClientInputs,
    },
  });
  isCredential(credential);
  if (
    !(credential.getClientExtensionResults() as ExtensionOutput).largeBlob
      ?.supported
  )
    throw new Error(
      "This authenticator does not support largeBlob. Connect an external wallet instead.",
    );
  const enrollment: Enrollment = Object.freeze({
    credentialId: b64(credential.rawId),
    xUserId: input.xUserId,
    rpId: input.options.rp.id,
  });
  enrollments.set(enrollment, {
    seed: crypto.getRandomValues(new Uint8Array(32)),
    binding: enrollment,
    state: "new",
  });
  return { enrollment, credential };
}
/** Second user gesture, after server verified registration. Retries reuse the same seed. */
export async function initializeSolanaWallet(
  enrollment: Enrollment,
  options: PublicKeyCredentialRequestOptions,
  credentials?: CredentialPort,
) {
  const pending = enrollments.get(enrollment);
  if (!pending || pending.state !== "new")
    throw new Error(
      "Wallet cannot be regenerated. Unlock the existing passkey instead.",
    );
  const publicKey = ed25519.getPublicKey(pending.seed);
  const address = base58.encode(publicKey);
  const blob = encoder.encode(
    JSON.stringify({
      version: 1,
      chain: "solana",
      xUserId: enrollment.xUserId,
      seed: base64urlnopad.encode(pending.seed),
    }),
  );
  const request = boundRequest(enrollment, options);
  pending.state = "writing";
  try {
    const credential = await port(credentials).get({
      publicKey: {
        ...request,
        extensions: {
          largeBlob: { write: blob },
        } as AuthenticationExtensionsClientInputs,
      },
    });
    isCredential(credential);
    verifyCredentialId(credential, enrollment.credentialId);
    if (
      !(credential.getClientExtensionResults() as ExtensionOutput).largeBlob
        ?.written
    )
      throw new Error(
        "Authenticator did not confirm the wallet was saved. Retry with this enrollment.",
      );
    pending.state = "written";
    pending.seed.fill(0);
    return {
      binding: { ...enrollment, address } as WalletBinding,
      assertion: assertion(credential),
    };
  } catch (error) {
    if (pending.state === "writing") pending.state = "new";
    throw error;
  } finally {
    blob.fill(0);
  }
}
/** Abandon only an unfinished enrollment. Never deletes or overwrites a saved wallet. */
export function discardSolanaEnrollment(enrollment: Enrollment) {
  const pending = enrollments.get(enrollment);
  if (pending?.state === "writing")
    throw new Error("Wait for the current authenticator request.");
  pending?.seed.fill(0);
  enrollments.delete(enrollment);
}
async function readSeed(
  binding: Enrollment,
  options: PublicKeyCredentialRequestOptions,
  credentials?: CredentialPort,
) {
  const request = boundRequest(binding, options);
  const credential = await port(credentials).get({
    mediation: "required",
    publicKey: {
      ...request,
      extensions: {
        largeBlob: { read: true },
      } as AuthenticationExtensionsClientInputs,
    },
  });
  isCredential(credential);
  verifyCredentialId(credential, binding.credentialId);
  const blob = (credential.getClientExtensionResults() as ExtensionOutput)
    .largeBlob?.blob;
  if (!blob)
    throw new Error(
      "Wallet data is unavailable. Do not create a replacement wallet; use the original authenticator or your recovery key.",
    );
  let seed: Uint8Array | undefined;
  try {
    if (blob.byteLength > 1024) throw new Error("Invalid wallet data.");
    const payload = JSON.parse(decoder.decode(blob));
    if (
      payload.version !== 1 ||
      payload.chain !== "solana" ||
      payload.xUserId !== binding.xUserId ||
      typeof payload.seed !== "string"
    )
      throw new Error("Wallet is not bound to this X account.");
    seed = base64urlnopad.decode(payload.seed.replace(/=+$/, ""));
    if (seed.byteLength !== 32) throw new Error("Invalid Solana seed.");
    return { seed, assertion: assertion(credential) };
  } catch (error) {
    seed?.fill(0);
    throw error;
  } finally {
    new Uint8Array(blob).fill(0);
  }
}
/** Returns public identity only; does not replace missing data or store a secret. */
export async function recoverSolanaWallet(
  binding: Enrollment,
  options: PublicKeyCredentialRequestOptions,
  credentials?: CredentialPort,
) {
  const result = await readSeed(binding, options, credentials);
  try {
    return {
      binding: {
        ...binding,
        address: base58.encode(ed25519.getPublicKey(result.seed)),
      } as WalletBinding,
      assertion: result.assertion,
    };
  } finally {
    result.seed.fill(0);
  }
}
/** Sign exact Solana transaction message bytes or an authentication message. */
export async function signSolanaMessage(
  binding: WalletBinding,
  message: Uint8Array,
  options: PublicKeyCredentialRequestOptions,
  credentials?: CredentialPort,
) {
  if (
    !(message instanceof Uint8Array) ||
    message.byteLength === 0 ||
    message.byteLength > 65536
  )
    throw new Error("Invalid signing message.");
  // Snapshot before an async user prompt so caller mutation cannot change what gets signed.
  const approved = message.slice();
  const result = await readSeed(binding, options, credentials);
  try {
    if (base58.encode(ed25519.getPublicKey(result.seed)) !== binding.address)
      throw new Error("Wallet address does not match the registered account.");
    return {
      signature: ed25519.sign(approved, result.seed),
      assertion: result.assertion,
    };
  } finally {
    result.seed.fill(0);
    approved.fill(0);
  }
}
