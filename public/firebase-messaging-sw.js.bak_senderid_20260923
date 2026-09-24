importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyA2Nnu6CYVauecQZQhvr4mud3aYJbdDVx0",
  projectId: "cortex-74a4e",
  messagingSenderId: "330752495374",
  appId: "1:330752495374:web:0f4ee108a9fdaa5e30773d"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[FCM SW] Received background message:', payload);
  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'cortex-reminder',
    renotify: true
  });
});
