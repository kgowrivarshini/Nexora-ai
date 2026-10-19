# Nexora AI

Nexora AI is a responsive college-assistant web app with a browser UI and a small Node.js API server. The server uses Node.js built-ins plus the Firebase Admin SDK for verified sessions.

## Run locally

1. Install Node.js 18 or newer.
2. Open this project folder in VS Code.
3. In the integrated terminal, install dependencies and start the server:

   ```powershell
   npm install
   npm start
   ```

4. Open <http://localhost:3000>.

To enable actual AI answers, set `OPENAI_API_KEY` in the server's environment before starting it. For example, in PowerShell:

```powershell
$env:OPENAI_API_KEY = "your-server-side-provider-key"
$env:OPENAI_MODEL = "gpt-4o-mini"
npm start
```

The key stays on the server and must never be added to browser code or committed to source control. The default integration uses the OpenAI-compatible Chat Completions API. Set `OPENAI_API_URL` only when connecting a trusted, compatible provider endpoint. Restart the server after changing environment variables.

## Current capabilities

- Login, account-creation, password-reset, and email-verification flows backed by Firebase Email/Password when configured. Optional Google sign-in uses Google Identity Services and Firebase when its OAuth client is configured. The server forwards credentials to Firebase over HTTPS and does not store them. Firebase email verification is checked before a server-side session cookie is issued.
- Login, account-creation, email-verification, and BVC-connection screens styled for the supplied references. With Firebase unset, the forms refuse to send credentials. BVC verification is not connected, so student details are never fabricated and the dashboard/API remain locked.
- New chats, suggestions, chat submission with Enter or the send button, loading/error states, and browser-local chat history.
- Responsive navigation to chat, results, downloads, and notifications.
- File selection and removal are interactive; file contents are intentionally not uploaded or analyzed until a secure document-processing service is connected.
- Chat uses a server-side AI provider integration when configured. Without `OPENAI_API_KEY`, it displays a clear configuration error instead of returning a fabricated answer.
- Results are unavailable until an authenticated college results integration exists. The current API never returns or stores student result data.
- Downloads displays an explicit empty state until the approved college document library is connected.

## College data and production security

The UI and API are integration scaffolding, not a connected college knowledge base. No college records, student results, BVC verification service, or database are included. The Firebase integration requires the project configuration below before authentication is available. Before production use:

1. Connect a college-approved database and document store. Index only approved regulations, placements, faculty details, syllabi, schedules, and study materials; retrieve relevant sources server-side and cite them in AI answers.
2. In Firebase Console, enable **Authentication → Email/Password**, add the app's domain to **Authorized domains**, and configure Firebase's email verification and password-reset templates. To enable Google sign-in, also enable the Google provider and configure a Web OAuth client in Firebase/Google Cloud; add its authorized JavaScript origin.
3. Configure the server environment. `FIREBASE_API_KEY` is the Firebase project's Web API key, `FIREBASE_PROJECT_ID` is the project ID, `GOOGLE_APPLICATION_CREDENTIALS` points to a Firebase Admin service-account JSON file kept outside this repository, and `APP_BASE_URL` is the exact public app origin (HTTPS in production). For Google OAuth, additionally set `GOOGLE_OAUTH_CLIENT_ID` to the OAuth Web client ID configured in Firebase. The service account needs Firebase Authentication administration permission. For local PowerShell:

   ```powershell
   $env:FIREBASE_API_KEY = "<Firebase Web API key>"
   $env:FIREBASE_PROJECT_ID = "<Firebase project ID>"
   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\secure\firebase-admin.json"
   $env:APP_BASE_URL = "http://localhost:3000"
   $env:GOOGLE_OAUTH_CLIENT_ID = "<optional Google OAuth Web client ID>"
   npm start
   ```

   For production, use the deployed HTTPS origin for `APP_BASE_URL` and set `NODE_ENV=production` so the session cookie is marked `Secure`.    Do not paste service-account credentials into chat or commit them. The project ignores common Firebase service-account JSON filenames as an extra safeguard.
4. Obtain BVC's written approval and official student-verification API/SSO documentation, including its endpoint, authentication method, permitted fields, and test credentials. The current code deliberately does not submit roll numbers or return sample student data. Do not collect BVC portal passwords or treat a roll number as authentication. Until this integration is implemented and configured, verified Firebase users stop at Connect to BVC and dashboard APIs return `BVC_NOT_CONFIGURED`.
5. Implement access-controlled `/api/results`, `/api/downloads`, and notification endpoints; use HTTPS, CSRF protections for cookie-authenticated state changes, rate limits, retention limits, and secrets management.
6. Implement a secure upload pipeline before enabling attachments: validate file type and size, scan files, store them privately, and enforce per-user access controls.
7. Set provider keys in the deployment environment or a secrets manager. Keep them out of the repository and all frontend assets.

The Google sign-in button becomes active only when its OAuth client is configured. The dashboard UI remains unchanged, but its APIs require a verified Firebase session and an approved BVC verification integration before they return data.

The profile name shown in the design is presentational only and is not an authenticated identity. Chat history is stored in the current browser's local storage and should not be used for confidential conversations.
