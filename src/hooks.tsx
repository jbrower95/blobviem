import {createContext, useContext, useState, useEffect} from "react";
import { LocalAccount, PrivateKeyAccount } from "viem";
import { TPasskeyContext } from "./types";
import { FetchPrivateKeyUsingPasskey, Initialize, Login, TOptions, TRegisterArgs, Register, GenerateWallet, Logout } from "./webauthn";
import { b64ToBytes } from "./utils";

const IS_AVAILABLE = navigator.credentials !== undefined

const PasskeyContext = createContext<TPasskeyContext>({
    account: undefined,
    login: async () => {throw new Error('Unimplemented.')},
    export: undefined,
    register: async () => {throw new Error('Unimplemented.')},
    logout: () => {},
    generateWallet: async () => {throw new Error('Unimplemented')},
    isAvailable: IS_AVAILABLE
})

type TProps = TOptions & {
    children: JSX.Element,
}

export const PasskeyContextProvider = (opts: TProps) => {
    const [account, setAccount] = useState<PrivateKeyAccount | LocalAccount>();
    const [credentialId, setCredentialId] = useState<ArrayBuffer>();

    useEffect(() => {
        const session = Initialize(opts);
        if (session) {
            setAccount(session.account);
            setCredentialId(b64ToBytes(session.credentialId));
        }
    }, []);

    const login = async () => {
        const {credential, account, sessionId} = await Login(opts);
        setCredentialId(credential.rawId);
        setAccount(account);

        return {
            account,
            credential,
            sessionId
        }
    };

    const register = async (args: TRegisterArgs) => {
        const {credential} = await Register(args);
        setCredentialId(credential.rawId);
        return credential as PublicKeyCredential;
    };

    const generateWallet = async () => {
        const res = await GenerateWallet(opts, {credentialId: credentialId!})
        setAccount(res.account);
        return res;
    }

    const logout = () => {
        Logout();
        setAccount(undefined);
        setCredentialId(undefined);
    }

    return <PasskeyContext.Provider value={{
        account,
        login,
        logout,
        export: credentialId ? (async () => (await FetchPrivateKeyUsingPasskey({credentialId})).key) : undefined,
        generateWallet,
        register,
        isAvailable: IS_AVAILABLE
    }}>
        {opts.children}
    </PasskeyContext.Provider>
}

export const usePasskey = () => {
    return useContext(PasskeyContext);
}

