# Authentication System

The CloudConstruct VSCode extension uses **session-based authentication** with cookies to secure access to the whiteboard and backend services.

## Architecture

### Components

1. **AuthManager** (`src/auth/AuthManager.ts`)
   - Core authentication logic
   - Manages session cookies and user state
   - Uses VSCode SecretStorage for secure credential storage

2. **LoginViewProvider** (`src/ui/LoginViewProvider.ts`)
   - UI for login and signup
   - Embeds Next.js app in webview
   - Handles user input and authentication flow

3. **Worker Backend** (Kotlin/Ktor)
   - REST API endpoints for auth
   - MongoDB for user storage
   - Session management with cookies

## Authentication Flow

### Registration

```
User → VSCode Input Box → AuthManager.register()
  ↓
POST /auth/register {username, password}
  ↓
Backend → MongoDB (create user)
  ↓
Response: {userId}
  ↓
Auto-login → Session established
```

### Login

```
User → VSCode Input Box → AuthManager.login()
  ↓
POST /auth/login {username, password}
  ↓
Backend → Verify credentials
  ↓
Response: {userId} + Set-Cookie: USER_SESSION=xxx
  ↓
AuthManager → Store cookie in SecretStorage
  ↓
Update UI state (authenticated)
```

### Logout

```
User → Command/UI → AuthManager.logout()
  ↓
POST /auth/logout (with Cookie header)
  ↓
Backend → Clear session
  ↓
AuthManager → Delete from SecretStorage
  ↓
Update UI state (unauthenticated)
```

## Secure Storage

### VSCode SecretStorage

The extension uses VSCode's built-in `SecretStorage` API to store sensitive data:

```typescript
// Store session cookie (encrypted by VSCode)
await context.secrets.store('cloudconstruct.session.cookie', cookie);

// Retrieve session cookie
const cookie = await context.secrets.get('cloudconstruct.session.cookie');

// Delete session cookie
await context.secrets.delete('cloudconstruct.session.cookie');
```

**Benefits:**
- ✅ Encrypted at rest
- ✅ OS-level keychain integration (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- ✅ Per-workspace isolation
- ✅ Automatic syncing with Settings Sync (if enabled)

### User Info Storage

Non-sensitive user info (id, username) is stored in `globalState`:

```typescript
await context.globalState.update('cloudconstruct.user.info', userInfo);
```

## API Endpoints

### POST /auth/register

**Request:**
```json
{
  "username": "string",
  "password": "string",
  "profilePictureBase64": "string?" // optional
}
```

**Response (201 Created):**
```json
{
  "userId": "string"
}
```

**Response (409 Conflict):**
```json
{
  "error": "Username already exists"
}
```

### POST /auth/login

**Request:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response (200 OK):**
```json
{
  "userId": "string"
}
```

**Headers:**
```
Set-Cookie: USER_SESSION=xxx; Path=/; SameSite=lax
```

**Response (401 Unauthorized):**
Empty body

### POST /auth/logout

**Request Headers:**
```
Cookie: USER_SESSION=xxx
```

**Response (200 OK):**
Empty body

### GET /user/me

**Request Headers:**
```
Cookie: USER_SESSION=xxx
```

**Response (200 OK):**
```json
{
  "id": "string",
  "user": {
    "username": "string",
    // ... other user fields
  }
}
```

**Response (401 Unauthorized):**
Empty body

## Session Management

### Cookie Format

The backend uses Ktor Sessions with cookie storage:

```
Cookie Name: USER_SESSION
Format: Encoded session data
Attributes: Path=/; SameSite=lax
```

### Session Validation

The `AuthManager` provides session validation:

```typescript
const isValid = await authManager.validateSession();
```

This calls `GET /user/me` to verify the session is still active on the backend.

## Usage in Extension

### Initialize AuthManager

```typescript
const authManager = new AuthManager(context, workerUrl);
```

### Check Authentication

```typescript
if (authManager.isAuthenticated()) {
  // User is logged in
  const userInfo = authManager.getUserInfo();
  console.log(`Logged in as: ${userInfo.username}`);
}
```

### Make Authenticated Requests

```typescript
// Option 1: Get session cookie directly
const cookie = authManager.getSessionCookie();
const response = await axios.get(`${workerUrl}/user/me`, {
  headers: { Cookie: cookie }
});

// Option 2: Use authenticated client
const client = authManager.createAuthenticatedClient();
const response = await client.get('/user/me');
```

### Listen for Auth Changes

To react to authentication changes, you can:

1. Subscribe to SecretStorage changes (VSCode API)
2. Implement event emitters in AuthManager
3. Manually check `isAuthenticated()` before operations

## Security Considerations

### ✅ Implemented

- ✅ Secure credential storage (VSCode SecretStorage)
- ✅ Password input masked in UI
- ✅ Session-based authentication (no tokens in local storage)
- ✅ HTTPS support (configure in settings)
- ✅ Password validation (minimum 6 characters)

### 🔒 Recommended for Production

- Add password complexity requirements
- Implement rate limiting on backend
- Add CAPTCHA for registration
- Use HTTPS for all communications
- Implement session timeouts
- Add 2FA/MFA support
- Implement refresh tokens
- Add account recovery flow
- Log authentication attempts

## Configuration

### VSCode Settings

```json
{
  "cloudconstruct.workerUrl": "http://localhost:3000"
}
```

### Environment Variables (Backend)

```bash
# MongoDB connection
MONGODB_URI=mongodb://localhost:27017
DATABASE_NAME=cloudconstruct-live

# Server
PORT=3000
```

## Troubleshooting

### "Cannot connect to server"

**Cause:** Worker backend is not running

**Solution:**
```bash
cd worker
./gradlew run
```

### "Invalid username or password"

**Cause:** Credentials don't match database

**Solution:**
- Verify username is correct
- Try registering again if account doesn't exist
- Check backend logs for errors

### "Failed to save authentication session"

**Cause:** VSCode SecretStorage API error

**Solution:**
- Restart VSCode
- Check OS keychain permissions
- Clear extension storage: `Developer: Clear Extension Host Storage`

### Session expires unexpectedly

**Cause:** Backend session timeout or restart

**Solution:**
- Login again
- Configure session timeout on backend
- Implement token refresh

## Future Enhancements

1. **OAuth Integration**
   - GitHub, Google, Microsoft
   - OIDC/SAML support

2. **Token-based Auth**
   - JWT tokens
   - Refresh tokens
   - Token rotation

3. **Biometric Auth**
   - TouchID/FaceID
   - Windows Hello
   - Hardware keys (WebAuthn)

4. **Multi-factor Authentication**
   - TOTP (Google Authenticator)
   - SMS codes
   - Email verification

5. **Session Management**
   - View active sessions
   - Revoke sessions
   - Session activity logs

## Testing

### Manual Testing

1. **Registration:**
   - Open Command Palette
   - Run "CloudConstruct: Sign Up"
   - Enter username and password
   - Verify success message

2. **Login:**
   - Run "CloudConstruct: Login"
   - Enter credentials
   - Verify "Welcome back" message

3. **Authenticated Requests:**
   - Run "CloudConstruct: Show Status"
   - Verify data loads without auth errors

4. **Logout:**
   - Run "CloudConstruct: Logout"
   - Confirm logout
   - Verify session cleared

### Automated Testing

```typescript
// TODO: Add unit tests
describe('AuthManager', () => {
  it('should register new user', async () => {
    const result = await authManager.register('testuser', 'password123');
    expect(result.success).toBe(true);
  });

  it('should login existing user', async () => {
    const result = await authManager.login('testuser', 'password123');
    expect(result.success).toBe(true);
  });

  it('should validate session', async () => {
    const isValid = await authManager.validateSession();
    expect(isValid).toBe(true);
  });
});
```

## Related Files

- `src/auth/AuthManager.ts` - Core authentication logic
- `src/ui/LoginViewProvider.ts` - Login UI
- `src/extension.ts` - Extension initialization
- `worker/src/main/kotlin/.../Security.kt` - Backend auth
- `worker/src/main/kotlin/.../Databases.kt` - Auth endpoints

