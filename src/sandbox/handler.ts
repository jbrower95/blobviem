import { ExportKey, Login, Logout, Register, SessionGet, SignTransaction } from "./message";
import { Session } from '../webauthn';
import * as Webauthn from '../webauthn';
import {sha256, isValidSession} from './utils';

const clearSessionForDomain = async (domain: string) => {
    const storeVal = await sha256(domain);
    window.localStorage.removeItem(storeVal);
}

const assertSession = async (domain: string) => {
    const session = getSessionForDomain(domain);
    if (!session) {
        throw new Error('not logged in.');
    }
    return session;
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

    const res = await Webauthn.Login({sessionType: input.sessionType})

    return {
        success: true,
        sessionId: res.sessionId,
        credentialId: res.credential.id,
        address: res.account!.address
    }
}

export const LogoutHandler: (from: string, input: Logout['Request']) => Promise<Logout['Response']> = async (from, input) => {
    await clearSessionForDomain(from);
    await Webauthn.Logout()

    return {
        success: true
    }
}

export const RegisterHandler: (from: string, input: Register['Request']) => Promise<Register['Response']> = async (from, input) => {
    await clearSessionForDomain(from);

    const res = await Webauthn.Register({
        appName: 'Wallet',
        displayName: from,
        name: from, /* the display name will be the domain used. */
        id: new TextEncoder().encode(from)
    })

    // TODO: this needs to actually be a stateful web app. we can't do this all in one call
    const final = await Webauthn.GenerateWallet(input, {credentialId: res.credential.rawId})

    return {
        success: true,
        sessionId: final.sessionId,
        credentialId: final.credential.id,
        address: final.account!.address
    }
}

export const SignHandler: (from: string, input: SignTransaction['Request']) => Promise<SignTransaction['Response']> = (from, input) => {
    const session = assertSession(from);
    throw new Error('not implemented.');
}

export const ExportKeyHandler: (from: string, input: ExportKey['Request']) => Promise<ExportKey['Response']> = (from, input) => {
    const session = assertSession(from);
    throw new Error('not implemented.');
}