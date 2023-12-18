import {PrivateKeyAccount, Hash} from 'viem';
import { LocalAccount, privateKeyToAccount, toAccount } from 'viem/accounts';
import { FetchPrivateKeyUsingPasskey } from './webauthn';
/**
 * If the key is held in session storage, we can hold in-mem as well (and refresh if needed.)
 */
export type SessionStoragePasskeyAccount = PrivateKeyAccount;

export type PasskeyAccount = LocalAccount<'custom'>;

type TMakePasskeyAccountArgs = {
    address: `0x${string}`, 
    credentialId: BufferSource
};

export const AlwaysRefetchPasskeyAccount = ({address, credentialId}: TMakePasskeyAccountArgs) => {
    const retrieveAccount = async () => {
        const {key} = await FetchPrivateKeyUsingPasskey({credentialId})
        return privateKeyToAccount(key);
    }
    
    return toAccount({
        address,
        async signMessage(...args) {
          const account = await retrieveAccount();
          return account.signMessage(...args);
        },
        async signTransaction(...args) {
          const account = await retrieveAccount();
          return account.signTransaction(...args);
        },
        async signTypedData(...args) {          
          const account = await retrieveAccount();
          return account.signTypedData(...args);
        },
      })
}

export type AllAccounts = SessionStoragePasskeyAccount | PasskeyAccount;