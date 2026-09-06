/**
 * Google Identity Services (GIS) OAuth2 token client — shape matches
 * https://developers.google.com/identity/oauth2/web/reference/js-reference#google.accounts.oauth2.initTokenClient
 * Shared between src/lib/exportUtils.ts (Drive/Sheets export) and
 * src/pages/calendar/CalendarPage.tsx (Google Calendar sync).
 */

interface GoogleTokenResponse {
  access_token: string
  expires_in?: number
  error?: string
}

interface GoogleTokenClient {
  requestAccessToken(overrideConfig?: { prompt?: string }): void
}

interface GoogleIdentityServices {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string
        scope: string
        prompt?: string
        callback: (resp: GoogleTokenResponse) => void
      }): GoogleTokenClient
    }
  }
}

interface Window {
  google?: GoogleIdentityServices
}
