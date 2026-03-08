// Browser Notification utility for iProTalk
// Handles permission request and sending desktop notifications

let permissionGranted = false;

export async function requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') {
        permissionGranted = true;
        return true;
    }
    if (Notification.permission === 'denied') return false;

    const result = await Notification.requestPermission();
    permissionGranted = result === 'granted';
    return permissionGranted;
}

export function sendDesktopNotification(title: string, body: string, onClick?: () => void) {
    if (!permissionGranted || !('Notification' in window)) return;
    if (document.hasFocus()) return; // Don't notify if window is focused

    const notification = new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'iprotalk-msg', // Collapse duplicate notifications
        silent: false,
    });

    notification.onclick = () => {
        window.focus();
        notification.close();
        onClick?.();
    };

    // Auto close after 5 seconds
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
