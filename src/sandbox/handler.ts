import { ExportKey, Login, Logout, Register, SessionGet, SignTransaction } from "./message";
import { Session } from '../webauthn';

const isValidSession = (session: Session) => {
    return (
        !!session.sessionId &&
        !!session.credentialId && 
        !!session.address &&
        !!session.expires &&
        new Date() < new Date(session.expires)
    )
}

const sha256: (message: string) => Promise<string> = async (message) => {
    const msgUint8 = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return hashHex;
}

const clearSessionForDomain = async (domain: string) => {
    const storeVal = await sha256(domain);
    window.localStorage.removeItem(storeVal);
}

const getSessionForDomain = async (domain: string) => {
    const storeVal = await sha256(domain);
    try {
        const sessionJSON = window.localStorage.getItem(storeVal);
        const session = JSON.parse(sessionJSON!) as Session;
        
        // assert all field, too.
        if (!isValidSession(session)) {
            throw new Error('invalid session.');
        }

        return session;
    } catch (exc) {
        // maybe invalid data or something, clear localStorage. (all data is stored in passkeys anyways.)
        clearSessionForDomain(domain);
    }
}

export const SessionGetHandler: (from: string, input: SessionGet['Request']) => Promise<SessionGet['Response']> = async (from, input) => {
    const session = await getSessionForDomain(from);
    if (!session || session.sessionId !== input.sessionId){
        throw new Error('invalid session.')
    }

    return {
        success: true,
        ...session,
        account: undefined
    }
}

export const LoginHandler: (from: string, input: Login['Request']) => Promise<Login['Response']> = async (from, input) => {
    await clearSessionForDomain(from);
    throw new Error('Unimplemented.')
}

export const LogoutHandler: (from: string, input: Logout['Request']) => Promise<Logout['Response']> = (from, input) => {
    throw new Error("Unimplemented.");
}

export const RegisterHandler: (from: string, input: Register['Request']) => Promise<Register['Response']> = (from, input) => {
    throw new Error("Unimplemented.");
}

export const SignHandler: (from: string, input: SignTransaction['Request']) => Promise<SignTransaction['Response']> = (from, input) => {
    throw new Error("Unimplemented.");
}

export const ExportKeyHandler: (from: string, input: ExportKey['Request']) => Promise<ExportKey['Response']> = (from, input) => {
    throw new Error("Unimplemented.");
}