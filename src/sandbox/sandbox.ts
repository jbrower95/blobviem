

// any tab will only accept an individual request from the opener domain, 

import { BaseRequest, BaseResponse, Method, SessionGet, Register, Login, SignTransaction, ExportKey, Logout } from "./message";
import { ExportKeyHandler, LoginHandler, LogoutHandler, RegisterHandler, SessionGetHandler, SignHandler } from "./handler";

const getReferredOrigin = () => {
    const queryString = window.location.search;
    const params = new URLSearchParams(queryString);
    const targetOrigin = params.get('ref')

    if (!targetOrigin) {
        throw new Error(`Received no ref.`);
    }
    return targetOrigin;
}

const handle: <TRequest extends BaseRequest, TResponse extends BaseResponse>(data: TRequest, handler: (from: string, val: TRequest) => Promise<TResponse>) => Promise<TResponse> = async (data, handler) => {
    return handler(getReferredOrigin(), data)
}

// and then it will auto-close
const handleRequest = async (data: BaseRequest, reply: (val: any) => Promise<void>) => {
    try {
        const getValue = async () => {
            switch (data.type) {
                case "get":
                    return handle(data as SessionGet['Request'], SessionGetHandler);
                case "register":
                    return handle(data as Register['Request'], RegisterHandler);
                case "login":
                    return handle(data as Login['Request'], LoginHandler);
                case "logout":
                    return handle(data as Logout['Request'], LogoutHandler);
                case "sign":
                    return handle(data as SignTransaction['Request'], SignHandler);
                case "export":
                    return handle(data as ExportKey['Request'], ExportKeyHandler);
                default: 
                    throw new Error("unknown message.");
            }
        }

        await reply(await getValue());
    } catch (exc) {
        // catch-all for uncaught exc
        await reply({
            success: false,
            error: JSON.stringify(exc)
        } as BaseResponse)
    } finally {
        // always close the window.
        window.close();
    }
}

const main = async () => {
    const targetOrigin = getReferredOrigin();
    let didProcess = false;

    const reply = async (obj: any) => {
        window.postMessage(obj, targetOrigin);
    } 

    const listener = function (event: MessageEvent<any>) {
        if (event.origin !== targetOrigin || didProcess) return;
        didProcess = true; // only allow one command per pop-up.

        handleRequest(event.data as BaseRequest, reply);
    }

    window.addEventListener(
        "message",
        listener,
        false,
    );
};

main();



