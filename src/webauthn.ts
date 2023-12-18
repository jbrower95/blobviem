
import { bytesToHex, hexToBytes } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { b64ToBytes, bytesToBase64 } from "./utils";
import {AllAccounts, AlwaysRefetchPasskeyAccount} from './account';
import {v4 as uuidv4} from 'uuid';

const Keys = {
    Address: "_address",
    Credential: "_credential",
    PrivateKey: "_privateKey",
    Expires: "_expires",
    Session: "_session"
}

const DEFAULT_ID = new TextEncoder().encode("anonymous_user").buffer;
const EMPTY_CHALLENGE = new TextEncoder().encode("challenge").buffer;
const THREE_HOURS_MS = (3 * 60 * 60 * 1000);

export type TRegisterArgs = {
    displayName?: string
    id?: ArrayBuffer
    name?: string
    appName?: string
}

export type Session = {
    sessionId: string,
    credentialId: string,
    address: `0x${string}`,
    expires: number,
    account?: AllAccounts
}

export type TOptions = {
    /**
     * session: <least secure, best ux>
     *  - persist the private key in session storage during the duration of the session.
     *    e.g if you open a new tab, you will need to re-auth.
     *  - does not prompt for webauthn approvals on signatures or export.
     * 
     * passkey: <most secure, worst ux>
     *  - does not persist the private key anywhere besides the authenticator.
     *  - private key is only held momentarily in memory, while signature is performed.
     *  - always prompts for webauthn approvals.
     */
    sessionType: 'session' | 'passkey'

    /**
     * Default amount of time before requiring the user to log back-in.
     * 
     * Default is 3 hours.
     */
    sessionTimeoutMs?: number
}

const clearStorage = () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
};

const BeginSession = (options: TOptions, privateKey: `0x${string}`, credRaw: ArrayBuffer) => {
    const account = privateKeyToAccount(privateKey);
    window.sessionStorage.clear();

    let sessionId = uuidv4();

    window.localStorage.setItem(Keys.Address, account.address);
    window.localStorage.setItem(Keys.Credential, bytesToBase64(credRaw));
    window.localStorage.setItem(Keys.Expires, `${Date.now() + THREE_HOURS_MS}`)
    window.localStorage.setItem(Keys.Session, sessionId)

    // if we're using session, this is needed.
    if (options.sessionType === 'session') {
        window.sessionStorage.setItem(Keys.PrivateKey, privateKey);
    }

    return sessionId;
}

export const loadSessionStorageSession = () => {
    const privKey = window.sessionStorage.getItem(Keys.PrivateKey) as `0x${string}`;
    const credentialId = window.localStorage.getItem(Keys.Credential);
    const expires = window.localStorage.getItem(Keys.Expires);
    const address = window.localStorage.getItem(Keys.Address) as `0x${string}`;
    const sessionId = window.localStorage.getItem(Keys.Session);

    if (privKey && credentialId && expires && sessionId) {
        return {
            account: privateKeyToAccount(privKey),
            address,
            expires: parseInt(expires!),
            credentialId,
            sessionId
        } as Session;
    }

    return null;
}

export const loadPasskeySession = (options: TOptions) => {
    const address = window.localStorage.getItem(Keys.Address) as `0x${string}`;
    const expires = window.localStorage.getItem(Keys.Expires);
    const credentialId = window.localStorage.getItem(Keys.Credential);
    const sessionId = window.localStorage.getItem(Keys.Session);

    if (credentialId && address && expires && sessionId) {
        window.sessionStorage.removeItem(Keys.PrivateKey); // clear `privkey` if it was previously set.

        const account = AlwaysRefetchPasskeyAccount({
            address: address,
            credentialId: b64ToBytes(credentialId)
        });
        
        return {
            account,
            address,
            expires: parseInt(expires!),
            credentialId,
            sessionId
        } as Session
    }

    return null;
}

export const Initialize: (options: TOptions) => Session | null = (options: TOptions) => {
    if (options.sessionType === 'session') {
        return loadSessionStorageSession();
    } else if (options.sessionType === 'passkey') {
        return loadPasskeySession(options);
    }

    return null;
};

export const Logout = () => {
    clearStorage();
}

export const FetchPrivateKeyUsingPasskey = async ({credentialId}: {credentialId?: BufferSource}) => {
    const credential = await navigator.credentials.get({
        mediation: 'required',
        publicKey: {
            allowCredentials: !credentialId ? undefined : [{
                id: credentialId,
                type: "public-key"
            }], /* any account, or `credentialId`'s account if set. */
            extensions: {
                largeBlob: {
                    read: true
                },
            },
            challenge: EMPTY_CHALLENGE, /* we do not care about the challenge */
            userVerification: 'preferred',
        }
    }) as PublicKeyCredential;

    if (credential.getClientExtensionResults().largeBlob === undefined) {
        throw new Error("Unsupported Authenticator.")
    }

    if (!credential.getClientExtensionResults().largeBlob!.blob) {
        throw new Error("Invalid passkey.")
    }
    const key = bytesToHex(new Uint8Array(credential.getClientExtensionResults().largeBlob!.blob!));
    const account = privateKeyToAccount(key);

    return {
        credential,
        key,
        address: account.address,
        privateKeyAccount: account
    }
}

export const StorePrivateKey = async ({credentialId, privateKey}: {credentialId: BufferSource, privateKey: `0x${string}`}) => {
    if (!credentialId) {
        throw new Error("Not logged in.");
    }

    const credential = await navigator.credentials.get({
        publicKey: {
            allowCredentials: [{
                id: credentialId!,
                type: "public-key",
              }], /* any account */
            extensions: {
                largeBlob: {
                    write: hexToBytes(privateKey)
                },
            },
            challenge: EMPTY_CHALLENGE, /* we do not care about the challenge */
            userVerification: 'preferred',
        }
    }) as PublicKeyCredential;

    if (!credential.getClientExtensionResults().largeBlob?.written) {
        throw new Error("Failed to save account.");
    }

    return credential;
}

export const Login = async (options: TOptions) => {
    const {key, credential} = await FetchPrivateKeyUsingPasskey({});
    const sessionId = BeginSession(options, key, credential.rawId);
    let {account} = await Initialize(options)!
    
    return {
        key,
        credential,
        account,
        sessionId
    }
};

export const Register = async ({
    displayName = "anonymous_user",
    id = DEFAULT_ID,
    name = "anonymous_user",
    appName = "app"
}: TRegisterArgs) => {
    const credential = await navigator.credentials.create({
        publicKey: {
            extensions: {
                largeBlob: {
                    support: 'required',
                },
            },
            rp: {
                name: appName
            },
            challenge: new TextEncoder().encode("test"),
            user: {
                displayName,
                id,
                name
            },
            pubKeyCredParams: [
                { alg: -8, type: 'public-key' },
                { alg: -7, type: 'public-key' },
                { alg: -257, type: 'public-key' }]
        },
    }) as PublicKeyCredential;
    return {credential: credential as PublicKeyCredential};
};

export const GenerateWallet = async (options: TOptions, {credentialId}: {credentialId: BufferSource}) => {
    const key = generatePrivateKey();
    const credential = await StorePrivateKey({credentialId, privateKey: key});
    const sessionId = BeginSession(options, key, credential.rawId);

    let {account} = await Initialize(options)!
    
    return {
        credential,
        account,
        sessionId
    }
}