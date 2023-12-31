
export const b64ToBytes = (base64: string) => {
    const binString = atob(base64);
    return Uint8Array.from(binString, (m) => m.codePointAt(0)!);
} 

export const bytesToBase64 = (bytes: ArrayBuffer) => {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}