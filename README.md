# Nexora AI

Nexora AI is a responsive college-assistant web app with a browser UI and a small Node.js API server. It uses only Node.js built-ins and browser APIs; no dependency install is needed.

## Run locally

1. Install Node.js 18 or newer.
2. Open this project folder in VS Code.
3. In the integrated terminal, run:

   ```powershell
   npm start
   ```

4. Open <http://127.0.0.1:3000>.

To enable actual AI answers, set `OPENAI_API_KEY` in the server's environment before starting it. For example, in PowerShell:

```powershell
$env:OPENAI_API_KEY = "your-server-side-provider-key"
$env:OPENAI_MODEL = "gpt-4o-mini"
npm start
```

The key stays on the server and must never be added to browser code or committed to source control. The default integration uses the OpenAI-compatible Chat Completions API. Set `OPENAI_API_URL` only when connecting a trusted, compatible provider endpoint. Restart the server after changing environment variables.

## Current capabilities

- New chats, suggestions, chat submission with Enter or the send button, loading/error states, and browser-local chat history.
- Responsive navigation to chat, results, downloads, and notifications.
- File selection and removal are interactive; file contents are intentionally not uploaded or analyzed until a secure document-processing service is connected.
- Chat uses a server-side AI provider integration when configured. Without `OPENAI_API_KEY`, it displays a clear configuration error instead of returning a fabricated answer.
- Results are unavailable until an authenticated college results integration exists. The current API never returns or stores student result data.
- Downloads displays an explicit empty state until the approved college document library is connected.

## College data and production security

The UI and API are integration scaffolding, not a connected college knowledge base. No college records, student results, documents, authentication, or database are included. Before production use:

1. Connect a college-approved database and document store. Index only approved regulations, placements, faculty details, syllabi, schedules, and study materials; retrieve relevant sources server-side and cite them in AI answers.
2. Add institutional sign-in (for example, OIDC/SAML), server-side session validation, role/ownership checks, and audit logging. Enforce authorization before any student-result or private-record query. Do not treat a roll number as authentication.
3. Implement access-controlled `/api/results`, `/api/downloads`, and notification endpoints; use HTTPS, CSRF protections for cookie-authenticated state changes, rate limits, retention limits, and secrets management.
4. Implement a secure upload pipeline before enabling attachments: validate file type and size, scan files, store them privately, and enforce per-user access controls.
5. Set provider keys in the deployment environment or a secrets manager. Keep them out of the repository and all frontend assets.

The profile name shown in the design is presentational only and is not an authenticated identity. Chat history is stored in the current browser's local storage and should not be used for confidential conversations.
