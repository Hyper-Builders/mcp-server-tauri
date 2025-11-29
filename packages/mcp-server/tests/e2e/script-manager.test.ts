import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { manageDriverSession } from '../../src/driver/session-manager.js';
import {
   registerScript,
   removeScript,
   clearScripts,
   getScripts,
   isScriptRegistered,
} from '../../src/driver/script-manager.js';
import { executeInWebview } from '../../src/driver/webview-executor.js';

/**
 * E2E tests for script manager.
 * Tests the persistent script injection system.
 */
describe('Script Manager E2E Tests', () => {
   const TIMEOUT = 15000;

   beforeAll(async () => {
      // App is already started globally - just init the session
      await manageDriverSession('start');
   }, TIMEOUT);

   afterAll(async () => {
      // Clean up any registered scripts
      await clearScripts();

      // Don't stop the app - it's managed globally
      await manageDriverSession('stop');
   }, TIMEOUT);

   beforeEach(async () => {
      // Clear scripts before each test
      await clearScripts();
   });

   describe('Script Registration', () => {
      it('should register an inline script', async () => {
         const result = await registerScript(
            'test-inline-script',
            'inline',
            'window.__TEST_SCRIPT_LOADED__ = true;'
         );

         expect(result.registered).toBe(true);
         expect(result.scriptId).toBe('test-inline-script');
      }, TIMEOUT);

      it('should register a URL script', async () => {
         const result = await registerScript(
            'test-url-script',
            'url',
            'https://example.com/script.js'
         );

         expect(result.registered).toBe(true);
         expect(result.scriptId).toBe('test-url-script');
      }, TIMEOUT);

      it('should inject inline script into DOM', async () => {
         await registerScript(
            'test-dom-script',
            'inline',
            'window.__DOM_TEST__ = "injected";'
         );

         // Wait a moment for injection
         await new Promise((r) => { return setTimeout(r, 100); });

         // Verify the script was executed
         const result = await executeInWebview('return window.__DOM_TEST__');

         expect(result).toBe('injected');
      }, TIMEOUT);

      it('should add script tag to document head', async () => {
         await registerScript(
            'test-tag-script',
            'inline',
            'console.log("test");'
         );

         // Wait a moment for injection
         await new Promise((r) => { return setTimeout(r, 100); });

         // Verify the script tag exists with the correct attribute
         const result = await executeInWebview(
            'return !!document.querySelector(\'script[data-mcp-script-id="test-tag-script"]\')'
         );

         expect(result).toBe('true');
      }, TIMEOUT);
   });

   describe('Script Removal', () => {
      it('should remove a registered script', async () => {
         await registerScript('to-remove', 'inline', 'window.__TO_REMOVE__ = true;');

         const removeResult = await removeScript('to-remove');

         expect(removeResult.removed).toBe(true);
         expect(removeResult.scriptId).toBe('to-remove');
      }, TIMEOUT);

      it('should remove script tag from DOM', async () => {
         await registerScript('dom-remove', 'inline', 'console.log("remove me");');

         // Wait a moment for injection
         await new Promise((r) => { return setTimeout(r, 100); });

         // Verify script exists
         const selector = 'script[data-mcp-script-id="dom-remove"]';

         let exists = await executeInWebview(`return !!document.querySelector('${selector}')`);

         expect(exists).toBe('true');

         // Remove the script
         await removeScript('dom-remove');

         // Wait a moment for removal
         await new Promise((r) => { return setTimeout(r, 100); });

         // Verify script is gone
         exists = await executeInWebview(`return !!document.querySelector('${selector}')`);

         expect(exists).toBe('false');
      }, TIMEOUT);

      it('should handle removing non-existent script', async () => {
         const result = await removeScript('non-existent');

         expect(result.removed).toBe(false);
      }, TIMEOUT);
   });

   describe('Script Listing', () => {
      it('should list all registered scripts', async () => {
         await registerScript('script-a', 'inline', 'a');
         await registerScript('script-b', 'url', 'https://example.com/b.js');

         const { scripts } = await getScripts();

         expect(scripts.length).toBe(2);

         const ids = scripts.map((s) => { return s.id; });

         expect(ids).toContain('script-a');
         expect(ids).toContain('script-b');
      }, TIMEOUT);

      it('should return empty array when no scripts registered', async () => {
         const { scripts } = await getScripts();

         expect(scripts).toEqual([]);
      }, TIMEOUT);
   });

   describe('Clear Scripts', () => {
      it('should clear all registered scripts', async () => {
         await registerScript('clear-1', 'inline', '1');
         await registerScript('clear-2', 'inline', '2');
         await registerScript('clear-3', 'inline', '3');

         const clearResult = await clearScripts();

         expect(clearResult.cleared).toBe(3);

         const { scripts } = await getScripts();

         expect(scripts.length).toBe(0);
      }, TIMEOUT);

      it('should remove all script tags from DOM', async () => {
         await registerScript('clear-dom-1', 'inline', 'console.log(1);');
         await registerScript('clear-dom-2', 'inline', 'console.log(2);');

         // Wait a moment for injection
         await new Promise((r) => { return setTimeout(r, 100); });

         // Verify scripts exist
         const countSelector = 'script[data-mcp-script-id]';

         let count = await executeInWebview(`return document.querySelectorAll('${countSelector}').length`);

         expect(parseInt(count, 10)).toBeGreaterThanOrEqual(2);

         // Clear all scripts
         await clearScripts();

         // Wait a moment for removal
         await new Promise((r) => { return setTimeout(r, 100); });

         // Verify all MCP scripts are gone
         count = await executeInWebview(`return document.querySelectorAll('${countSelector}').length`);

         expect(count).toBe('0');
      }, TIMEOUT);
   });

   describe('Script Registration Check', () => {
      it('should return true for registered script', async () => {
         await registerScript('check-exists', 'inline', 'exists');

         const exists = await isScriptRegistered('check-exists');

         expect(exists).toBe(true);
      }, TIMEOUT);

      it('should return false for non-registered script', async () => {
         const exists = await isScriptRegistered('does-not-exist');

         expect(exists).toBe(false);
      }, TIMEOUT);
   });

   describe('Script Replacement', () => {
      it('should replace script with same ID', async () => {
         await registerScript('replace-me', 'inline', 'window.__REPLACE_VALUE__ = "original";');

         // Wait a moment for injection
         await new Promise((r) => { return setTimeout(r, 100); });

         let value = await executeInWebview('return window.__REPLACE_VALUE__');

         expect(value).toBe('original');

         // Register again with same ID but different content
         await registerScript('replace-me', 'inline', 'window.__REPLACE_VALUE__ = "replaced";');

         // Wait a moment for injection
         await new Promise((r) => { return setTimeout(r, 100); });

         value = await executeInWebview('return window.__REPLACE_VALUE__');

         expect(value).toBe('replaced');

         // Should still only have one script in registry

         const { scripts } = await getScripts();

         const replaceScripts = scripts.filter((s) => { return s.id === 'replace-me'; });

         expect(replaceScripts.length).toBe(1);
      }, TIMEOUT);
   });
});
