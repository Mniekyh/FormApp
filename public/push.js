// PUBLIC VAPID KEY (Ten sam który masz na serwerze)
const publicVapidKey = 'BLht_0mpJxGjR9mG0a_CUNflW0gEaAE0Qy59jyBoC-sqAM3jLDpdEaImHQYXbZZL7PqNWj9MEtQOJg43hcneiN8';

// Rejestracja service workera + subskrypcja
async function registerPush() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js', {
                scope: '/'
            });

            console.log('✅ Service Worker zarejestrowany');

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
            });

            await fetch('/subscribe', {
                method: 'POST',
                body: JSON.stringify(subscription),
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log('✅ Subskrypcja push zapisana!');
        } catch (error) {
            console.error('❌ Błąd podczas rejestracji push:', error);
        }
    } else {
        console.warn('Push notifications nie są wspierane w Twojej przeglądarce.');
    }
}

// Funkcja pomocnicza do konwersji klucza
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}