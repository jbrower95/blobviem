export {};

declare global {
    interface PublicKeyCredential {
        extension?: {
            largeBlob?: {
                supported?: boolean;
                blob?: ArrayBuffer
            }
        }
    }

    interface PublicKeyCredentialCreationOptions {

    }

    interface AuthenticationExtensionsClientOutputs {
        largeBlob?: {
            written?: boolean
            blob?: ArrayBuffer
        }
    }

    interface AuthenticationExtensionsClientInputs {
        largeBlob?: {
            support?: "required" | "preferred",
            write?: ArrayBuffer,
            read?: boolean
        }
    }
}