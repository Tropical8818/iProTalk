// Browser Notification utility for iProTalk
// Handles permission request and sending desktop notifications

let permissionGranted = false;
let swRegistration: ServiceWorkerRegistration | null = null;

export async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        swRegistration = registration;
        console.log('Service Worker registered');
        return registration;
    } catch (e) {
        console.error('Service Worker registration failed:', e);
        return null;
    }
}

export async function requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    
    if (Notification.permission === 'granted') {
        permissionGranted = true;
    } else if (Notification.permission !== 'denied') {
        const result = await Notification.requestPermission();
        permissionGranted = result === 'granted';
    }

    if (permissionGranted) {
        await registerServiceWorker();
    }

    return permissionGranted;
}

export async function subscribeUserToPush(vapidPublicKey: string) {
    if (!swRegistration) {
        swRegistration = await registerServiceWorker();
    }
    if (!swRegistration) throw new Error('Service Worker not supported');

    const subscribeOptions = {
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    };

    return await swRegistration.pushManager.subscribe(subscribeOptions);
}

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function sendDesktopNotification(title: string, body: string, onClick?: () => void) {
    if (!permissionGranted || !('Notification' in window)) return;
    if (document.hasFocus()) return; 

    const notification = new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'iprotalk-msg', 
        silent: false,
    });

    notification.onclick = () => {
        window.focus();
        notification.close();
        onClick?.();
    };

    setTimeout(() => notification.close(), 5000);
}

// Update favicon badge with unread count
const originalTitle = document.title;

export function setUnreadBadge(count: number) {
    if (count > 0) {
        document.title = `(${count > 99 ? '99+' : count}) ${originalTitle}`;
    } else {
        document.title = originalTitle;
    }
}

export function resetTitle() {
    document.title = originalTitle;
}
