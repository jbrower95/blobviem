import { PrivateKeyAccount } from "viem"

export type TRegisterArgs = {
    displayName?: string,
    id?: ArrayBuffer,
    name?: string
    appName: string
}

export type TPasskeyContext = {
    /**
     * The viem account.
     */
    account?: PrivateKeyAccount, 

    /**
     * Allows the user to select from any existing profiles
     * they have made on your site.
     * 
     * This brings up the webauthn "passkey" flow, potentially multiple times.
     * 
     * @param id - If you want, you can pass in what you think the ID of the login should be. By default, 
     * we'll call it "profile".
     * 
     * @returns 
     */
    login: (id?: string) => Promise<void>,

    /**
     * Removes the account from memory, zeroing it out for all users of your app.
     */
    logout: () => void

    /**
     * Allows the user to register a new account with some id.
     * 
     * This brings up the webauthn "passkey" flow, potentially multiple times.
     * 
     * @returns 
     */
    register: (args: TRegisterArgs) => Promise<void>,

    reset: () => Promise<void>;

    /**
     * whether or not largeBlob passkeys are supported in this browser.
     * 
     * safari (desktop/mobile): 
     *  largeBlob passkeys are available in iOS 17+, as well as Safari 17+
     *  on desktop.
     * 
     * chrome:
     *  largeBlobs are behind a feature flag on chrome. 
     *  Enable them by launching with: --enable-features=WebAuthenticationLargeBlobExtension
     */
    isAvailable: boolean
}
