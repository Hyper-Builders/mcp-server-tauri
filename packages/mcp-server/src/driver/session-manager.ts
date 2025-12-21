import { z } from 'zod';

import { getDefaultHost, getDefaultPort } from '../config.js';
import { AppDiscovery } from './app-discovery.js';
import { resetPluginClient, getExistingPluginClient, connectPlugin } from './plugin-client.js';
import { getBackendState } from './plugin-commands.js';
import { resetInitialization } from './webview-executor.js';

/**
 * Session Manager - Native IPC-based session management
 *
 * This module provides lightweight native session management using Tauri IPC.
 * The "session" concept is maintained for API compatibility.
 *
 * Connection Strategy:
 * 1. Try localhost first (most reliable for simulators/emulators/desktop)
 * 2. If localhost fails and a remote host is configured, try that host
 * 3. Return error if all connection attempts fail
 */

// ============================================================================
// Schemas
// ============================================================================

export const ManageDriverSessionSchema = z.object({
   action: z.enum([ 'start', 'stop', 'status' ]).describe('Action to perform: start or stop the session, or check status'),
   host: z.string().optional().describe(
      'Host address to connect to (e.g., 192.168.1.100). Falls back to MCP_BRIDGE_HOST or TAURI_DEV_HOST env vars'
   ),
   port: z.number().optional().describe('Port to connect to (default: 9223)'),
});

// ============================================================================
// Module State
// ============================================================================

// AppDiscovery instance - recreated when host changes
// Track current session info including app identifier for session reuse
let appDiscovery: AppDiscovery | null = null,
    currentSession: { name: string; identifier: string | null; host: string; port: number } | null = null;

/**
 * Check if a session is currently active.
 * @returns true if a session has been started and not stopped
 */
export function hasActiveSession(): boolean {
   return currentSession !== null;
}

/**
 * Get the current session info, or null if no session is active.
 */
export function getCurrentSession(): { name: string; identifier: string | null; host: string; port: number } | null {
   return currentSession;
}

function getAppDiscovery(host: string): AppDiscovery {
   if (!appDiscovery || appDiscovery.host !== host) {
      appDiscovery = new AppDiscovery(host);
   }

   return appDiscovery;
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Try to connect to a specific host and port.
 * Returns session info on success, throws on failure.
 */
async function tryConnect(host: string, port: number): Promise<{ name: string; host: string; port: number }> {
   const discovery = getAppDiscovery(host);

   const session = await discovery.connectToPort(port, undefined, host);

   return {
      name: session.name,
      host: session.host,
      port: session.port,
   };
}

/**
 * Fetch the app identifier from the backend state.
 * Must be called after the singleton pluginClient is connected.
 *
 * @returns The app identifier (bundle ID) or null if not available. Returns null when:
 *          - The plugin doesn't support the identifier field (older versions)
 *          - The backend state request fails
 *          - The identifier field is missing from the response
 */
async function fetchAppIdentifier(): Promise<string | null> {
   try {
      // Use existing client - called during session setup before currentSession is set
      const stateJson = await getBackendState(true);

      const state = JSON.parse(stateJson);

      // Return null if identifier is not present (backward compat with older plugins)
      return state.app?.identifier ?? null;
   } catch{
      // Return null on any error (e.g., older plugin version that doesn't support this)
      return null;
   }
}

/**
 * Manage session lifecycle (start, stop, or status).
 *
 * Connection strategy for 'start':
 * 1. Try localhost:{port} first (most reliable for simulators/emulators/desktop)
 * 2. If localhost fails AND a different host is configured, try {host}:{port}
 * 3. If both fail, try auto-discovery on localhost
 * 4. Return error if all attempts fail
 *
 * @param action - 'start', 'stop', or 'status'
 * @param host - Optional host address (defaults to env var or localhost)
 * @param port - Optional port number (defaults to 9223)
 * @returns For 'start'/'stop': A message string describing the result.
 *          For 'status': A JSON string with connection details including:
 *          - `connected`: boolean indicating if connected
 *          - `app`: app name (or null if not connected)
 *          - `identifier`: app bundle ID (e.g., "com.example.app"), or null
 *          - `host`: connected host (or null)
 *          - `port`: connected port (or null)
 */
export async function manageDriverSession(
   action: 'start' | 'stop' | 'status',
   host?: string,
   port?: number
): Promise<string> {
   // Handle status action
   if (action === 'status') {
      const client = getExistingPluginClient();

      if (client?.isConnected() && currentSession) {
         return JSON.stringify({
            connected: true,
            app: currentSession.name,
            identifier: currentSession.identifier,
            host: currentSession.host,
            port: currentSession.port,
         });
      }
      return JSON.stringify({
         connected: false,
         app: null,
         identifier: null,
         host: null,
         port: null,
      });
   }

   if (action === 'start') {
      // Reset any existing connections to ensure fresh connection
      if (appDiscovery) {
         await appDiscovery.disconnectAll();
      }
      resetPluginClient();

      const configuredHost = host ?? getDefaultHost();

      const configuredPort = port ?? getDefaultPort();

      // Strategy 1: Try localhost first (most reliable)
      if (configuredHost !== 'localhost' && configuredHost !== '127.0.0.1') {
         try {
            const session = await tryConnect('localhost', configuredPort);

            // Connect the singleton pluginClient so status checks work
            await connectPlugin(session.host, session.port);
            // Fetch app identifier after singleton is connected
            const identifier = await fetchAppIdentifier();

            currentSession = { ...session, identifier };
            return `Session started with app: ${session.name} (localhost:${session.port})`;
         } catch{
            // Localhost failed, will try configured host next
         }
      }

      // Strategy 2: Try the configured/provided host
      try {
         const session = await tryConnect(configuredHost, configuredPort);

         // Connect the singleton pluginClient so status checks work
         await connectPlugin(session.host, session.port);
         // Fetch app identifier after singleton is connected
         const identifier = await fetchAppIdentifier();

         currentSession = { ...session, identifier };
         return `Session started with app: ${session.name} (${session.host}:${session.port})`;
      } catch{
         // Configured host failed
      }

      // Strategy 3: Auto-discover on localhost (scan port range)

      const localhostDiscovery = getAppDiscovery('localhost');

      const firstApp = await localhostDiscovery.getFirstAvailableApp();

      if (firstApp) {
         try {
            // Reset client again to connect to discovered port
            resetPluginClient();

            const session = await tryConnect('localhost', firstApp.port);

            // Connect the singleton pluginClient so status checks work
            await connectPlugin(session.host, session.port);
            // Fetch app identifier after singleton is connected
            const identifier = await fetchAppIdentifier();

            currentSession = { ...session, identifier };
            return `Session started with app: ${session.name} (localhost:${session.port})`;
         } catch{
            // Discovery found app but connection failed
         }
      }

      // Strategy 4: Try default port on configured host as last resort
      try {
         resetPluginClient();

         const session = await tryConnect(configuredHost, configuredPort);

         // Connect the singleton pluginClient so status checks work
         await connectPlugin(session.host, session.port);
         // Fetch app identifier after singleton is connected
         const identifier = await fetchAppIdentifier();

         currentSession = { ...session, identifier };
         return `Session started with app: ${session.name} (${session.host}:${session.port})`;
      } catch{
         // All attempts failed
         currentSession = null;
         return `Session started (native IPC mode - no Tauri app found at localhost or ${configuredHost}:${configuredPort})`;
      }
   }

   // Stop action - disconnect all apps and reset initialization state
   if (appDiscovery) {
      await appDiscovery.disconnectAll();
   }

   resetPluginClient();
   resetInitialization();
   currentSession = null;

   return 'Session stopped';
}
