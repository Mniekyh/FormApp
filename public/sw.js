self.addEventListener('push', function(event) {
    console.log('[Service Worker] Push odebrany.');

    let data = {};

    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            console.error('❌ Push payload nie jest JSON-em:', e);
            // Jeśli nie jest JSON-em, spróbuj potraktować to jako zwykły tekst
            data = {
                title: "Push Notification",
                body: event.data.text()
            };
        }
    } else {
        console.warn('⚠️ Brak danych w push.');
        data = {
            title: "Push Notification",
            body: "Nowe powiadomienie (brak danych)"
        };
    }

    const title = data.title || 'Powiadomienie';
    const options = {
        body: data.body || 'Masz nowe powiadomienie!',
        icon: '/images/icon.png',
        badge: '/images/badge.png'
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});