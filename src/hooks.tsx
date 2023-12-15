import {createContext, useContext, useState, useEffect} from "react";
import { PrivateKeyAccount, bytesToHex, hexToBytes } from "viem";
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { TPasskeyContext } from "./types";

const IS_AVAILABLE = navigator.credentials !== undefined
const DEFAULT_ID = new TextEncoder().encode("anonymous_user").buffer;
const EMPTY_CHALLENGE = new TextEncoder().encode("challenge").buffer;

const PasskeyContext = createContext<TPasskeyContext>({
    account: undefined,
    login: async () => {throw new Error('Unimplemented.')},
    export: undefined,
    register: async () => {throw new Error('Unimplemented.')},
    logout: () => {},
    generateWallet: async () => {throw new Error('Unimplemented')},
    isAvailable: IS_AVAILABLE
})

type TProps = {
    children: JSX.Element,

    /**
     * Persist the full-account in session storage (kinda sketchy) between page reloads.
     */
    useSessionStorage?: boolean
}

const clearSessionStorage = () => {
    window.sessionStorage.clear();
};

const Keys = {
    Address: "_address",
    Credential: "_credential",
    PrivateKey: "_privateKey"
}

const b64ToBytes = (base64: string) => {
    const binString = atob(base64);
    return Uint8Array.from(binString, (m) => m.codePointAt(0)!);
} 

export const PasskeyContextProvider = ({children, useSessionStorage}: TProps) => {
    const [account, setAccount] = useState<PrivateKeyAccount>();
    const [credentialId, setCredentialId] = useState<ArrayBuffer>();

    const updatePrivateKey = (privateKey: `0x${string}`, credentialId: string, credentialIdRaw: ArrayBuffer) => {
        const account = privateKeyToAccount(privateKey);

        window.sessionStorage.setItem(Keys.Address, account.address);
        window.sessionStorage.setItem(Keys.Credential, credentialId);

        if (useSessionStorage) {
            window.sessionStorage.setItem(Keys.PrivateKey, privateKey);
        }
        setAccount(account);
        setCredentialId(credentialIdRaw);
        return account;
    }
    
    useEffect(() => {
        if (useSessionStorage) {
            const privKey = window.sessionStorage.getItem(Keys.PrivateKey) as `0x${string}`;
            const credential = window.sessionStorage.getItem(Keys.Credential);

            // reload the account from session storage if it exists.
            if (privKey && credential) {
                updatePrivateKey(privKey, credential, b64ToBytes(credential).buffer);
            }
        }
    }, []);

    const fetchPrivateKeyUsingPasskey = async (credentialId?: BufferSource) => {
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
        }) as PublicKeyCredential

        if (credential.getClientExtensionResults().largeBlob === undefined) {
            throw new Error("Unsupported Authenticator.")
        }

        if (!credential.getClientExtensionResults().largeBlob!.blob) {
            console.log(credential);
            console.log(credential.getClientExtensionResults());
            throw new Error("Invalid passkey.")
        }
        setCredentialId(credential.rawId);
        return {
            credential,
            key: bytesToHex(new Uint8Array(credential.getClientExtensionResults().largeBlob!.blob!))
        }
    }

    const setPrivateKeyUsingPasskey = async (to: `0x${string}`) => {
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
                        write: hexToBytes(to)
                    },
                },
                challenge: EMPTY_CHALLENGE, /* we do not care about the challenge */
                userVerification: 'preferred',
            }
        }) as PublicKeyCredential;

        if (!credential.getClientExtensionResults().largeBlob?.written) {
            console.log(credential.getClientExtensionResults());
            throw new Error("Failed to save account.");
        }

        updatePrivateKey(to, credential.id, credential.rawId);

        return credential;
    }

    const login = async () => {
        const {key, credential} = await fetchPrivateKeyUsingPasskey();
        return {
            account: updatePrivateKey(key, credential.id, credential.rawId),
            credential
        }
    };

    const register = async ({
        displayName = "anonymous_user",
        id = DEFAULT_ID,
        name = "anonymous_user",
        appName = "app"
    }) => {
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
        setCredentialId(credential.rawId);
        return credential as PublicKeyCredential;
    };

    const generateWallet = async () => {
        const key = generatePrivateKey();
        const credential = await setPrivateKeyUsingPasskey(key);
        return {
            account: updatePrivateKey(key, credential.id, credential.rawId),
            credential
        }
    }

    const logout = () => {
        setAccount(undefined);
        clearSessionStorage();
    }

    return <PasskeyContext.Provider value={{
        account,
        login,
        logout,
        export: credentialId ? (async () => (await fetchPrivateKeyUsingPasskey(credentialId)).key) : undefined,
        generateWallet,
        register,
        isAvailable: IS_AVAILABLE
    }}>
        {children}
    </PasskeyContext.Provider>
}

export const usePasskey = () => {
    return useContext(PasskeyContext);
}

