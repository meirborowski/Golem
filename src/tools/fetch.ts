import { tool } from 'ai';
import { z } from 'zod';

const DEFAULT_TIMEOUT = 15_000; // 15 seconds
const MAX_RESPONSE_SIZE = 512 * 1024; // 512KB

export const fetchUrl = () =>
  tool({
    description:
      'Make an HTTP request to a URL. Supports GET and POST methods. Useful for checking API endpoints, fetching documentation, downloading JSON data, or testing webhooks. Returns the response status, headers, and body.',
    inputSchema: z.object({
      url: z.string().describe('The URL to fetch'),
      method: z
        .union([z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']), z.null()])
        .describe('HTTP method. Null defaults to GET.'),
      headers: z
        .union([z.record(z.string()), z.null()])
        .describe('Request headers as key-value pairs. Null for no custom headers.'),
      body: z
        .union([z.string(), z.null()])
        .describe('Request body (for POST/PUT/PATCH). Null for no body.'),
      timeout: z
        .union([z.number(), z.null()])
        .describe('Timeout in milliseconds. Null defaults to 15000.'),
    }),
    execute: async ({ url, method: rawMethod, headers: rawHeaders, body, timeout: rawTimeout }) => {
      const method = rawMethod ?? 'GET';
      const timeout = rawTimeout ?? DEFAULT_TIMEOUT;
      const headers: Record<string, string> = rawHeaders ?? {};

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method,
          headers,
          body: body ?? undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const contentType = response.headers.get('content-type') ?? '';
        let responseBody: string;

        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_RESPONSE_SIZE) {
          responseBody = `[Response too large: ${(buffer.byteLength / 1024).toFixed(0)}KB. Max: ${MAX_RESPONSE_SIZE / 1024}KB]`;
        } else {
          responseBody = new TextDecoder().decode(buffer);
        }

        // Collect response headers
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        return {
          success: response.ok,
          status: response.status,
          statusText: response.statusText,
          contentType,
          headers: responseHeaders,
          body: responseBody,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.name === 'AbortError'
              ? `Request timed out after ${timeout}ms`
              : error.message
            : String(error);

        return {
          success: false,
          error: message,
        };
      }
    },
  });
