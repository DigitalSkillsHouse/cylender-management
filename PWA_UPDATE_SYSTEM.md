# PWA Update System Documentation

## Overview

The PWA update system automatically detects when a new version of the app is available and prompts users to update. This eliminates the need for users to manually logout/login to see new changes.

## How It Works

### 1. **Service Worker Version Detection**
- The service worker (`public/sw.js`) has a `CACHE_VERSION` constant
- When you deploy new features, update this version number
- The browser compares the installed version with the server version

### 2. **Automatic Update Checking**
- The app checks for updates:
  - Immediately on page load
  - Every 5 minutes while the app is open
  - When the service worker detects a new version

### 3. **Update Prompt**
- When a new version is detected, a notification appears in the bottom-right corner
- Users can:
  - Click "Update Now" to immediately reload and get the new version
  - Click "Later" to dismiss (prompt will show again after 1 hour)

### 4. **Hard Refresh on Update**
- When user clicks "Update Now", the app:
  - Activates the new service worker
  - Performs a hard reload (clears cache, loads fresh content)
  - User sees the new version immediately

## How to Deploy Updates

### Step 1: Update Service Worker Version

Edit `public/sw.js` and increment the `CACHE_VERSION`:

```javascript
const CACHE_VERSION = 'v1.0.2' // Change from v1.0.1 to v1.0.2
```

**Version Numbering:**
- Patch updates: `v1.0.1` → `v1.0.2` (bug fixes, small changes)
- Minor updates: `v1.0.1` → `v1.1.0` (new features)
- Major updates: `v1.0.1` → `v2.0.0` (breaking changes)

### Step 2: Deploy Your Changes

Deploy your code changes to production as usual.

### Step 3: Users Get Notified

- Users with the app open will see the update prompt within 5 minutes
- Users who open the app after deployment will see the prompt immediately
- The prompt appears in the bottom-right corner with a blue alert

## Technical Details

### Files Involved

1. **`public/sw.js`** - Service worker with version tracking
2. **`components/pwa/ServiceWorkerRegister.tsx`** - Registers SW and detects updates
3. **`components/pwa/UpdatePrompt.tsx`** - UI component for update notification
4. **`next.config.mjs`** - Cache control headers for service worker

### Update Flow

```
1. New version deployed → Service worker file changes
2. Browser detects new SW → Downloads new SW in background
3. New SW installed → Enters "waiting" state
4. App detects waiting SW → Shows update prompt
5. User clicks "Update Now" → SW activates → Page reloads
6. User sees new version → Old cache cleared
```

### Cache Control

- Service worker file (`/sw.js`) has `no-cache` headers
- Ensures browser always checks for new version
- API routes also have no-cache headers

## User Experience

### Update Prompt Appearance

- **Location**: Bottom-right corner
- **Style**: Blue alert with icon
- **Message**: "New Version Available - Please update to see the latest changes and features"
- **Actions**: 
  - "Update Now" (blue button) - Immediately updates
  - "Later" (outline button) - Dismisses for 1 hour

### Update Process

1. User sees notification
2. Clicks "Update Now"
3. Page reloads automatically
4. New version loads (hard refresh)
5. User continues with updated app

## Testing

### Test Update Detection

1. Deploy current version
2. Install PWA on device
3. Make changes to code
4. Update `CACHE_VERSION` in `sw.js`
5. Deploy new version
6. Open app → Should see update prompt within 5 minutes

### Manual Testing

1. Open browser DevTools → Application → Service Workers
2. Check "Update on reload" to test immediately
3. Or wait for automatic check (every 5 minutes)

## Notes

- Update checks happen every 5 minutes (configurable in `ServiceWorkerRegister.tsx`)
- Dismissed prompts reappear after 1 hour
- Update is automatic - no user action needed except clicking "Update Now"
- Works in both browser and installed PWA mode
- Compatible with all modern browsers that support service workers

## Troubleshooting

### Update Prompt Not Showing

1. Check service worker is registered (DevTools → Application → Service Workers)
2. Verify `CACHE_VERSION` was updated in `sw.js`
3. Check browser console for service worker errors
4. Ensure cache headers are set correctly in `next.config.mjs`

### Update Not Working

1. Clear browser cache and service workers
2. Unregister old service worker (DevTools → Application → Service Workers → Unregister)
3. Reload page and re-register
4. Check network tab to ensure `sw.js` is not cached

