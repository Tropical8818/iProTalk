/**
 * iProTalk E2EE Utility using Web Crypto API
 */

// Generate an ECDH Key Pair for key exchange
export async function generateKeyPair(): Promise<CryptoKeyPair> {
    return await window.crypto.subtle.generateKey(
        {
            name: "ECDH",
            namedCurve: "P-256",
        },
        true, // extractable
        ["deriveKey", "deriveBits"]
    );
}

// Export the Public Key to Base64 (JWK format preferred for easy transmission)
export async function exportPublicKey(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey("jwk", key);
    // Convert to a base64 string for storage/transmission
    return btoa(JSON.stringify(exported));
}

// Export the Private Key to Base64 (for local storage ONLY)
export async function exportPrivateKey(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey("jwk", key);
    return btoa(JSON.stringify(exported));
}

// Import Public Key from Base64
export async function importPublicKey(base64Key: string): Promise<CryptoKey> {
    const jwk = JSON.parse(atob(base64Key));
    return await window.crypto.subtle.importKey(
        "jwk",
        jwk,
        {
            name: "ECDH",
            namedCurve: "P-256",
        },
        true,
        []
    );
}

// Import Private Key from Base64
export async function importPrivateKey(base64Key: string): Promise<CryptoKey> {
    const jwk = JSON.parse(atob(base64Key));
    return await window.crypto.subtle.importKey(
        "jwk",
        jwk,
        {
            name: "ECDH",
            namedCurve: "P-256",
        },
        true,
        ["deriveKey", "deriveBits"]
    );
}

// Derive a Shared Secret Key using my Private Key and their Public Key
export async function deriveSharedSecret(myPrivateKey: CryptoKey, theirPublicKey: CryptoKey): Promise<CryptoKey> {
    return await window.crypto.subtle.deriveKey(
        {
            name: "ECDH",
            public: theirPublicKey,
        },
        myPrivateKey,
        {
            name: "AES-GCM",
            length: 256,
        },
        false, // the derived key doesn't need to be extractable
        ["encrypt", "decrypt"]
    );
}

// Generate a random Session Key for AES-GCM
export async function generateSessionKey(): Promise<CryptoKey> {
    return await window.crypto.subtle.generateKey(
        {
            name: "AES-GCM",
            length: 256,
        },
        true, // extractable so we can encrypt it and send it
        ["encrypt", "decrypt"]
    );
}

// Encrypt the message with the Session Key
export async function encryptMessage(sessionKey: CryptoKey, plainText: string): Promise<{ encryptedBlob: string, nonce: string }> {
    const encodedText = new TextEncoder().encode(plainText);
    const nonce = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedData = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: nonce,
        },
        sessionKey,
        encodedText
    );

    // Convert ArrayBuffers to Base64
    const encryptedBlob = btoa(String.fromCharCode(...new Uint8Array(encryptedData)));
    const nonceBase64 = btoa(String.fromCharCode(...nonce));

    return { encryptedBlob, nonce: nonceBase64 };
}

// Encrypt the Session Key with the Shared Secret 
// We export the Session Key (raw bytes), then encrypt it with the AES-GCM Shared Secret
export async function encryptSessionKey(sessionKey: CryptoKey, sharedSecret: CryptoKey): Promise<{ encryptedSessionKey: string, sessionIv: string }> {
    const rawSessionKey = await window.crypto.subtle.exportKey("raw", sessionKey);
    const sessionIv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedData = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: sessionIv,
        },
        sharedSecret,
        rawSessionKey
    );

    const encryptedSessionKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedData)));
    const sessionIvBase64 = btoa(String.fromCharCode(...sessionIv));

    // Combine them as "IV:EncryptedSessionKey" for simplicity
    return {
        encryptedSessionKey: sessionIvBase64 + ":" + encryptedSessionKeyBase64,
        sessionIv: sessionIvBase64
    };
}

// Decrypt the Session Key using the Shared Secret
export async function decryptSessionKey(encryptedSessionKeyString: string, sharedSecret: CryptoKey): Promise<CryptoKey> {
    const parts = encryptedSessionKeyString.split(":");
    if (parts.length !== 2) throw new Error("Invalid encrypted session key format");

    const sessionIv = new Uint8Array(atob(parts[0]).split('').map(c => c.charCodeAt(0)));
    const encryptedRawSessionKey = new Uint8Array(atob(parts[1]).split('').map(c => c.charCodeAt(0)));

    const rawSessionKey = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: sessionIv,
        },
        sharedSecret,
        encryptedRawSessionKey
    );

    return await window.crypto.subtle.importKey(
        "raw",
        rawSessionKey,
        {
            name: "AES-GCM",
            length: 256,
        },
        true,
        ["encrypt", "decrypt"]
    );
}

// Decrypt the Message using the Session Key
export async function decryptMessage(sessionKey: CryptoKey, encryptedBlob: string, nonceBase64: string): Promise<string> {
    const encryptedData = new Uint8Array(atob(encryptedBlob).split('').map(c => c.charCodeAt(0)));
    const nonce = new Uint8Array(atob(nonceBase64).split('').map(c => c.charCodeAt(0)));

    const decryptedData = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: nonce,
        },
        sessionKey,
        encryptedData
    );

    return new TextDecoder().decode(decryptedData);
}
