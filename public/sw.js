/* Service worker with update detection for PWA 
 * 
 * IMPORTANT: Update CACHE_VERSION when deploying new features/changes
 * This ensures the browser detects the new version and prompts users to update
 * Format: 'v1.0.0' - increment as needed (e.g., 'v1.0.1', 'v1.1.0', 'v2.0.0')
 */

const CACHE_VERSION = 'v1.0.1'
const CACHE_NAME = `cylender-management-${CACHE_VERSION}`

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...', CACHE_VERSION)
  // Don't skip waiting - let the new worker wait so we can prompt user
  // self.skipWaiting() // Commented out to allow update prompts
})

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...', CACHE_VERSION)
  event.waitUntil(
    Promise.all([
      // Claim clients so SW controls pages right away
      self.clients.claim(),
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[Service Worker] Deleting old cache:', name)
              return caches.delete(name)
            })
        )
      })
    ])
  )
})

// Listen for skip waiting message from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[Service Worker] Received SKIP_WAITING message')
    self.skipWaiting()
  }
})

// Provide a no-op fetch handler to satisfy PWA install criteria
self.addEventListener('fetch', (event) => {
  // Do not intercept; let the browser handle network as usual
  return
})
