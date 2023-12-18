import { ExportKey, Login, Logout, Register, SessionGet, SignTransaction } from "./message";
import { Session } from '../webauthn';

export const isValidSession = (session: Session) => {
    return (
        !!session.sessionId &&
        !!session.credentialId && 
        !!session.address &&
        !!session.expires &&
        new Date() < new Date(session.expires)
    )
}

export const sha256: (message: string) => Promise<string> = async (message) => {
    const msgUint8 = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return hashHex;
}