# Authentication Data Sharing Issue - Deep Analysis

## 🔴 CRITICAL ISSUE IDENTIFIED

### Problem Summary
**Admin and employee panels are sharing user data through `sessionStorage`, causing data leakage when both types of users login on the same browser/device.**

---

## 📋 Current Authentication Flow

### 1. Login Process (`app/api/auth/login/route.js`)
- User submits email, password, and userType (admin/employee)
- Server validates credentials and user role
- Server creates JWT token with user data
- Server sets HTTP-only cookie with token (24h expiry)
- Server returns user data in response

### 2. Client-Side Login Handling (`app/page.tsx` - `handleLogin`)
```typescript
const handleLogin = async (email: string, password: string, userType: string) => {
  const response = await authAPI.login(email, password, userType)
  const userData = response.data.user
  setUser(userData)
  
  // ❌ PROBLEM: Saving to sessionStorage
  sessionStorage.setItem("user", JSON.stringify(userData))
}
```

### 3. Session Check on Page Load (`app/page.tsx` - `checkAuthStatus`)
```typescript
const checkAuthStatus = async () => {
  // ❌ PROBLEM: Checks sessionStorage FIRST before server validation
  const savedUser = sessionStorage.getItem("user")
  if (savedUser) {
    setUser(JSON.parse(savedUser))
    setLoading(false)
    return  // Exits early, never validates with server!
  }

  // Only reaches here if sessionStorage is empty
  const response = await fetch('/api/auth/validate', {
    credentials: 'include',
  })
  if (response.ok) {
    const data = await response.json()
    if (data.user) {
      setUser(data.user)
      sessionStorage.setItem("user", JSON.stringify(data.user))
    }
  }
}
```

---

## 🔍 Root Cause Analysis

### The Core Problem

**`sessionStorage` is shared across ALL tabs/windows of the same browser origin:**

1. **Scenario 1: Admin logs in first**
   - Admin logs in → `sessionStorage.setItem("user", adminUserData)`
   - Employee logs in (new tab) → `sessionStorage.setItem("user", employeeUserData)` 
   - **sessionStorage is overwritten with employee data**
   - Admin refreshes their tab → `sessionStorage.getItem("user")` returns **employee data**
   - **Admin sees employee panel with employee data!**

2. **Scenario 2: Employee logs in first**
   - Employee logs in → `sessionStorage.setItem("user", employeeUserData)`
   - Admin logs in (new tab) → `sessionStorage.setItem("user", adminUserData)`
   - **sessionStorage is overwritten with admin data**
   - Employee refreshes their tab → `sessionStorage.getItem("user")` returns **admin data**
   - **Employee sees admin panel with admin privileges!**

### Why This Happens

1. **sessionStorage is shared**: All tabs from the same origin (domain) share the same sessionStorage
2. **No isolation between users**: The key `"user"` is the same for both admin and employee
3. **Client-side check first**: The code checks sessionStorage BEFORE validating with the server cookie
4. **Early exit**: If sessionStorage has data, it never validates with the server, so stale/wrong data is used

---

## 🎯 Affected Files

1. **`app/page.tsx`** - Main entry point
   - Line 30: `sessionStorage.getItem("user")` - Reads shared storage
   - Line 32: `setUser(JSON.parse(savedUser))` - Uses potentially wrong user
   - Line 48: `sessionStorage.setItem("user", JSON.stringify(data.user))` - Writes shared storage
   - Line 65: `sessionStorage.setItem("user", JSON.stringify(userData))` - Writes shared storage
   - Line 80: `sessionStorage.removeItem("user")` - Only clears current tab's view

2. **Other files using sessionStorage** (for other purposes, but should be aware):
   - `components/receipt-dialog.tsx` - Uses sessionStorage for print data (different purpose)
   - `app/print/receipt/[id]/page.tsx` - Uses sessionStorage for print data
   - `components/delivery-note-dialog.tsx` - Uses sessionStorage for print data
   - `components/pages/purchase-emp-management.tsx` - Checks sessionStorage for user

---

## ✅ Correct Authentication Flow (What Should Happen)

### Current Server-Side Flow (CORRECT)
- ✅ JWT token stored in HTTP-only cookie (secure, not accessible via JavaScript)
- ✅ Cookie is tied to specific user session
- ✅ Server validates token on each request via `verifyToken()` in `lib/auth.js`
- ✅ Each browser tab has its own cookie state (cookies are per-tab in some browsers, but properly scoped)

### What Should Happen Client-Side
1. User logs in → Server sets HTTP-only cookie
2. On page load/refresh → **ALWAYS validate with server first** (`/api/auth/validate`)
3. Server reads cookie → Validates JWT → Returns current user data
4. Client uses server response → No sessionStorage for user data

---

## 🔧 Recommended Solution

### Option 1: Remove sessionStorage for User Data (RECOMMENDED)
**Completely rely on HTTP-only cookie and server-side validation**

Pros:
- ✅ No data leakage between users
- ✅ Single source of truth (server)
- ✅ More secure (cannot be manipulated via JavaScript)
- ✅ Works correctly across tabs

Cons:
- ❌ Slight delay on page load (needs server round-trip)
- ❌ Need to handle loading state

### Option 2: Use localStorage with User-Specific Key (NOT RECOMMENDED)
Use key like `user-${userId}` or `user-${role}-${userId}`

Pros:
- ✅ Persists across browser sessions
- ✅ Isolated per user

Cons:
- ❌ Still accessible via JavaScript (security risk)
- ❌ Can be manipulated
- ❌ More complex key management
- ❌ Doesn't solve the core issue if both users login with same ID (impossible but shows design flaw)

### Option 3: Use IndexedDB with User Isolation (OVERKILL)
Similar to Option 2 but with IndexedDB

Pros:
- ✅ Can store more data
- ✅ Isolated per user

Cons:
- ❌ Overly complex for this use case
- ❌ Still has security concerns
- ❌ Same issues as localStorage

---

## 🛠️ Implementation Plan (Option 1 - RECOMMENDED)

### Step 1: Remove sessionStorage Usage for User Data
- Remove `sessionStorage.setItem("user", ...)` from `handleLogin`
- Remove `sessionStorage.getItem("user")` from `checkAuthStatus`
- Remove `sessionStorage.removeItem("user")` from `handleLogout`
- Always validate with server first

### Step 2: Always Validate with Server
- `checkAuthStatus` should ALWAYS call `/api/auth/validate` first
- Only use the server response
- Handle loading states properly

### Step 3: Optional: Add React State Persistence
- If needed, use React state management (Context API, Zustand, etc.)
- State is per-tab instance, not shared
- Still validate with server on mount

### Step 4: Test the Fix
1. Login as admin in Tab 1
2. Login as employee in Tab 2
3. Refresh Tab 1 → Should still show admin (validates via cookie)
4. Refresh Tab 2 → Should still show employee (validates via cookie)

---

## 📝 Code Changes Required

### File: `app/page.tsx`

**Current (BROKEN):**
```typescript
const checkAuthStatus = async () => {
  // ❌ Checks sessionStorage first
  const savedUser = sessionStorage.getItem("user")
  if (savedUser) {
    setUser(JSON.parse(savedUser))
    setLoading(false)
    return  // Never validates with server!
  }

  // Only if sessionStorage is empty
  const response = await fetch('/api/auth/validate', {
    credentials: 'include',
  })
  // ...
}
```

**Fixed (CORRECT):**
```typescript
const checkAuthStatus = async () => {
  try {
    // ✅ Always validate with server first
    const response = await fetch('/api/auth/validate', {
      method: 'GET',
      credentials: 'include',
    })
    
    if (response.ok) {
      const data = await response.json()
      if (data.user) {
        setUser(data.user)
        // ✅ No sessionStorage - rely on cookie
      }
    }
  } catch (error) {
    console.log("No valid user session")
  } finally {
    setLoading(false)
  }
}
```

**Current (BROKEN):**
```typescript
const handleLogin = async (email: string, password: string, userType: string) => {
  const response = await authAPI.login(email, password, userType)
  const userData = response.data.user
  setUser(userData)
  // ❌ Saves to shared sessionStorage
  sessionStorage.setItem("user", JSON.stringify(userData))
}
```

**Fixed (CORRECT):**
```typescript
const handleLogin = async (email: string, password: string, userType: string) => {
  const response = await authAPI.login(email, password, userType)
  const userData = response.data.user
  setUser(userData)
  // ✅ No sessionStorage - cookie is already set by server
}
```

**Current (BROKEN):**
```typescript
const handleLogout = async () => {
  try {
    await authAPI.logout()
  } catch (error) {
    console.error("Logout error:", error)
  } finally {
    setUser(null)
    // ❌ Only clears in current tab
    sessionStorage.removeItem("user")
  }
}
```

**Fixed (CORRECT):**
```typescript
const handleLogout = async () => {
  try {
    await authAPI.logout()
  } catch (error) {
    console.error("Logout error:", error)
  } finally {
    setUser(null)
    // ✅ No sessionStorage to clear - cookie cleared by server
  }
}
```

---

## 🧪 Testing Checklist

- [ ] Login as admin → Verify admin panel shows
- [ ] Open new tab → Login as employee → Verify employee panel shows
- [ ] Refresh admin tab → Should still show admin panel (not employee)
- [ ] Refresh employee tab → Should still show employee panel (not admin)
- [ ] Logout from admin tab → Admin tab should show login
- [ ] Employee tab should still be logged in (independent sessions)
- [ ] Clear cookies → Both tabs should show login
- [ ] Login as admin → Close tab → Open new tab → Should show login (cookie still valid, but needs validation)

---

## 🔒 Security Considerations

1. **HTTP-only cookies**: ✅ Already implemented correctly
2. **JWT token validation**: ✅ Already implemented correctly
3. **Client-side storage**: ❌ Currently storing user data in sessionStorage (should be removed)
4. **SameSite cookie**: ✅ Already set to "strict"
5. **Secure flag**: ✅ Set in production

---

## 📊 Impact Assessment

### Current Impact
- **CRITICAL**: Admin and employee data can leak between sessions
- **HIGH**: Users can see wrong panels/data
- **MEDIUM**: Security risk if user data is manipulated
- **LOW**: Performance impact (minimal)

### After Fix
- ✅ No data leakage
- ✅ Proper session isolation
- ✅ More secure
- ✅ Single source of truth (server)

---

## 🎓 Key Learnings

1. **sessionStorage is shared across tabs** - Not suitable for multi-user scenarios
2. **Client-side storage for auth data is risky** - Should rely on HTTP-only cookies
3. **Always validate with server** - Don't trust client-side storage for authentication
4. **Single source of truth** - Server should be the authoritative source

---

## 📚 References

- [MDN: sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)
- [OWASP: Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Next.js: Authentication Patterns](https://nextjs.org/docs/authentication)

