import { z } from 'zod';
import { ensureSessionAndConnect, getExistingPluginClient } from './plugin-client.js';

export const ExecuteIPCCommandSchema = z.object({
   command: z.string(),
   args: z.unknown().optional(),
});

export async function executeIPCCommand(command: string, args: unknown = {}): Promise<string> {
   try {
      // Ensure we have an active session and are connected
      const client = await ensureSessionAndConnect();

      // Send IPC command via WebSocket to the mcp-bridge plugin
      const response = await client.sendCommand({
         command: 'invoke_tauri',
         args: { command, args },
      });

      if (!response.success) {
         return JSON.stringify({ success: false, error: response.error || 'Unknown error' });
      }

      return JSON.stringify({ success: true, result: response.data });
   } catch(error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      return JSON.stringify({ success: false, error: message });
   }
}

// Combined schema for managing IPC monitoring
export const ManageIPCMonitoringSchema = z.object({
   action: z.enum([ 'start', 'stop' ]).describe('Action to perform: start or stop IPC monitoring'),
});

// Keep individual schemas for backward compatibility if needed
export const StartIPCMonitoringSchema = z.object({});
export const StopIPCMonitoringSchema = z.object({});

export async function manageIPCMonitoring(action: 'start' | 'stop'): Promise<string> {
   if (action === 'start') {
      return startIPCMonitoring();
   }
   return stopIPCMonitoring();
}

export async function startIPCMonitoring(): Promise<string> {
   try {
      const result = await executeIPCCommand('plugin:mcp-bridge|start_ipc_monitor');

      const parsed = JSON.parse(result);

      if (!parsed.success) {
         throw new Error(parsed.error || 'Unknown error');
      }

      return JSON.stringify(parsed.result);
   } catch(error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(`Failed to start IPC monitoring: ${message}`);
   }
}

export async function stopIPCMonitoring(): Promise<string> {
   try {
      const result = await executeIPCCommand('plugin:mcp-bridge|stop_ipc_monitor');

      const parsed = JSON.parse(result);

      if (!parsed.success) {
         throw new Error(parsed.error || 'Unknown error');
      }

      return JSON.stringify(parsed.result);
   } catch(error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(`Failed to stop IPC monitoring: ${message}`);
   }
}

export const GetIPCEventsSchema = z.object({
   filter: z.string().optional().describe('Filter events by command name'),
});

export async function getIPCEvents(filter?: string): Promise<string> {
   try {
      const result = await executeIPCCommand('plugin:mcp-bridge|get_ipc_events');

      const parsed = JSON.parse(result);

      if (!parsed.success) {
         throw new Error(parsed.error || 'Unknown error');
      }

      let events = parsed.result;

      if (filter && Array.isArray(events)) {
         events = events.filter((e: unknown) => {
            const event = e as { command?: string };

            return event.command && event.command.includes(filter);
         });
      }

      return JSON.stringify(events);
   } catch(error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(`Failed to get IPC events: ${message}`);
   }
}

export const EmitTestEventSchema = z.object({
   eventName: z.string(),
   payload: z.unknown(),
});

export async function emitTestEvent(eventName: string, payload: unknown): Promise<string> {
   try {
      const result = await executeIPCCommand('plugin:mcp-bridge|emit_event', {
         eventName,
         payload,
      });

      const parsed = JSON.parse(result);

      if (!parsed.success) {
         throw new Error(parsed.error || 'Unknown error');
      }

      return JSON.stringify(parsed.result);
   } catch(error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(`Failed to emit event: ${message}`);
   }
}

export const GetWindowInfoSchema = z.object({});

export async function getWindowInfo(): Promise<string> {
   try {
      const result = await executeIPCCommand('plugin:mcp-bridge|get_window_info');

      const parsed = JSON.parse(result);

      if (!parsed.success) {
         throw new Error(parsed.error || 'Unknown error');
      }

      return JSON.stringify(parsed.result);
   } catch(error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(`Failed to get window info: ${message}`);
   }
}

export const GetBackendStateSchema = z.object({});

/**
 * Get backend state from the connected Tauri app.
 *
 * This function can work in two modes:
 * 1. Normal mode: Requires an active session (for MCP tool calls)
 * 2. Setup mode: Uses existing connected client (for session setup)
 *
 * @param useExistingClient If true, uses the existing connected client without
 *        session validation. Used during session setup before currentSession is set.
 */
export async function getBackendState(useExistingClient = false): Promise<string> {
   try {
      if (useExistingClient) {
         // During session setup, use the already-connected client directly
         const client = getExistingPluginClient();

         if (!client || !client.isConnected()) {
            throw new Error('No connected client available');
         }

         const response = await client.sendCommand({
            command: 'invoke_tauri',
            args: { command: 'plugin:mcp-bridge|get_backend_state', args: {} },
         });

         if (!response.success) {
            throw new Error(response.error || 'Unknown error');
         }

         return JSON.stringify(response.data);
      }

      // Normal mode: use executeIPCCommand which validates session
      const result = await executeIPCCommand('plugin:mcp-bridge|get_backend_state');

      const parsed = JSON.parse(result);

      if (!parsed.success) {
         throw new Error(parsed.error || 'Unknown error');
      }

      return JSON.stringify(parsed.result);
   } catch(error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(`Failed to get backend state: ${message}`);
   }
}

// ============================================================================
// Window Management
// ============================================================================

export const ListWindowsSchema = z.object({});

/**
 * Lists all open webview windows in the Tauri application.
 */
export async function listWindows(): Promise<string> {
   try {
      const client = await ensureSessionAndConnect();

      const response = await client.sendCommand({
         command: 'list_windows',
      });

      if (!response.success) {
         throw new Error(response.error || 'Unknown error');
      }

      const windows = response.data as unknown[];

      return JSON.stringify({
         windows,
         defaultWindow: 'main',
         totalCount: windows.length,
      });
   } catch(error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(`Failed to list windows: ${message}`);
   }
}

export const ResizeWindowSchema = z.object({
   width: z.number().int().positive().describe('Width in pixels'),
   height: z.number().int().positive().describe('Height in pixels'),
   windowId: z.string().optional().describe('Window label to resize (defaults to "main")'),
   logical: z.boolean().optional().default(true)
      .describe('Use logical pixels (true, default) or physical pixels (false)'),
});

/**
 * Resizes a window to the specified dimensions.
 *
 * @param options - Resize options including width, height, and optional windowId
 * @returns JSON string with the result of the resize operation
 */
export async function resizeWindow(options: {
   width: number;
   height: number;
   windowId?: string;
   logical?: boolean;
}): Promise<string> {
   try {
      const client = await ensureSessionAndConnect();

      const response = await client.sendCommand({
         command: 'resize_window',
         args: {
            width: options.width,
            height: options.height,
            windowId: options.windowId,
            logical: options.logical ?? true,
         },
      });

      if (!response.success) {
         throw new Error(response.error || 'Unknown error');
      }

      return JSON.stringify(response.data);
   } catch(error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(`Failed to resize window: ${message}`);
   }
}

export const ManageWindowSchema = z.object({
   action: z.enum([ 'list', 'info', 'resize' ])
      .describe('Action: "list" all windows, get "info" for one window, or "resize" a window'),
   windowId: z.string().optional()
      .describe('Window label to target (defaults to "main"). Required for "info", optional for "resize"'),
   width: z.number().int().positive().optional()
      .describe('Width in pixels (required for "resize" action)'),
   height: z.number().int().positive().optional()
      .describe('Height in pixels (required for "resize" action)'),
   logical: z.boolean().optional().default(true)
      .describe('Use logical pixels (true, default) or physical pixels (false). Only for "resize"'),
});

/**
 * Unified window management function.
 *
 * Actions:
 * - `list`: List all open webview windows with their labels, titles, URLs, and state
 * - `info`: Get detailed info for a window (size, position, title, focus, visibility)
 * - `resize`: Resize a window to specified dimensions
 *
 * @param options - Action and parameters
 * @returns JSON string with the result
 */
export async function manageWindow(options: {
   action: 'list' | 'info' | 'resize';
   windowId?: string;
   width?: number;
   height?: number;
   logical?: boolean;
}): Promise<string> {
   const { action, windowId, width, height, logical } = options;

   switch (action) {
      case 'list': {
         return listWindows();
      }

      case 'info': {
         try {
            const client = await ensureSessionAndConnect();

            const response = await client.sendCommand({
               command: 'get_window_info',
               args: { windowId },
            });

            if (!response.success) {
               throw new Error(response.error || 'Unknown error');
            }

            return JSON.stringify(response.data);
         } catch(error: unknown) {
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Failed to get window info: ${message}`);
         }
      }

      case 'resize': {
         if (width === undefined || height === undefined) {
            throw new Error('width and height are required for resize action');
         }

         return resizeWindow({ width, height, windowId, logical });
      }

      default: {
         throw new Error(`Unknown action: ${action}`);
      }
   }
}
