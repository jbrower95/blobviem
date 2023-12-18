# blobviem

Need a self custodial, embedded wallet that gives TPM security and requires no backend setup?

`blobviem` gives you an ETH wallet that is stored inside of a passkey, and can be locked/unlocked during your app!

Support is mostly limited to Safari now, but largeBlob passkeys are in Chrome experimentally, and are gaining popularity.

## Changelog

1.10.0:
- Introduced `sessionType` of `passkey` or `session`. (see Quick Start)
    - `passkey` session: will prompt the user upon all signatures. Does not store the
    private key in browser storage, only in-memory during signatures.

    - `session` session: stores the key in sessionStorage, and does not prompt for
    future signatures.

    NOTE: Both session types persist data in localStorage, and will require your user to log back in if localStorage is cleared.


## Quick Start

```bash
npm install blobviem
```

At your `index.js` / top level component, wrap everything in the provider:
```javascript
    return 
        <PasskeyContextProvider sessionType='passkey'>
            <App />
        </PasskeyContextProvider>
```

Next,

In your component, just `usePasskey()` 
```javascript
    const {account, login, logout, register, generateWallet} = usePasskey();

    return <>
        <h1>{account?.address}</h1> {/* if you're logged in, `account` is a viem account. */}
        <button onClick={() => {
          login();
        }}>Log in</button> {/* shows a passkey login prompt */}

        <button onClick={() => {
          register({appName: "Example"});
        }}>Register</button> {/* shows a new passkey prompt */}

        <button onClick={() => {
          generateWallet();
        }}>Create new wallet</button>  {/* shows a passkey login prompt, specifically for the one made in register() */}
    </>
```

*login*
- Login() will prompt an already set-up user to use their existing passkey.

*register*
- For registration, you should:
    - call `register` for your user, as the result of some user interaction (button press), and wait for it to finish.
    - after registration completes, call `generateWallet` from some other user interaction.

## Embedded wallets

Embedded wallets are mostly going two routes today:
    - MPC, with some keyshare carefully stored in the browser, or
    - AA, with a throwaway EOA held in-browser for signing user operations (relayed to a bundler).

One of the big value-drivers for AA wallets is the support of [EIP-7212](https://eips.ethereum.org/EIPS/eip-7212), a precompile that allows for cheap validation of signatures produced by passkeys.

What if you could provide a passkey wallet without AA?

## largeBlob

Authenticators are now starting to support largeBlob storage.

LargeBlob grants a small data-store that can be associated with a passkey. Under the webauthn APIs, the data is guarded by the strongest means available -- on iOS/Mac the secure enclave, on Windows a motherboard TPM, etc.

## largeBlob references 

- [The glitch demo](https://webauthn-large-blob.glitch.me/) is often linked to as an authoritative demo of the API.
- A [specification](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions) exists, though most out-of-the-box installations of TypeScript (at time of writing) do not support the types required to interface with largeBlob. This is likely because largeBlob storage support is pretty fragmented.

## Supported Platforms

- This stuff works best on Webkit right now. 
    - Safari 17+
    - Mobile Safari / iOS 17+
- Experimental support is available via a special launch flag for Chrome.

## Caveats

- *Support*: There is no way to tell, staticaly / ahead-of-time, that a platform doesn't support largeBlob. While we can limit certain browsers that we know don't support this,
you really have to perform a runtime credential request to tell authoritatively.

- *2 step registration*: `generateWallet` and `register` cannot be the same step today, because:
    - You cannot update a largeBlob passkey while creating the passkey, and
    - You cannot show two sequential passkey interactions without two explicit userInteractions.

- *Data loss*: If you call `generateWallet` on an existing wallet (i.e sometime after your registration), you will lose the wallet. **Only call this one time per wallet, ever**.