import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultStaticRoot = path.join(projectRoot, 'outputs');
const apiVersion = '0.1.0';

const overviewPayload = {
  apiVersion,
  workspace: {
    id: 'apex-motion-plant-04',
    name: 'Apex Motion · Plant 04',
    mode: 'fixture-backed',
    state: 'browser-local'
  },
  metrics: {
    activeSignals: 14,
    escalatedInvestigations: 2,
    firstPassYield: 94.8,
    supplierActionsDue: 3
  },
  contracts: {
    overview: 'read-only migration contract',
    mutations: 'not enabled',
    persistence: 'not enabled'
  }
};

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  response.end(body);
}

function sendText(response, status, message) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8'
  });
  response.end(message);
}

function isInsideDirectory(candidate, directory) {
  const resolvedDirectory = path.resolve(directory);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedCandidate === resolvedDirectory || resolvedCandidate.startsWith(`${resolvedDirectory}${path.sep}`);
}

async function serveStatic(request, response, staticRoot, pathname) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    sendText(response, 405, 'Method Not Allowed');
    return;
  }

  let relativePath;
  try {
    relativePath = decodeURIComponent(pathname === '/' ? 'index.html' : pathname.slice(1));
  } catch {
    sendText(response, 400, 'Bad Request');
    return;
  }

  const candidate = path.join(staticRoot, relativePath);
  if (!isInsideDirectory(candidate, staticRoot)) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  try {
    const file = await fs.readFile(candidate);
    const contentType = contentTypes[path.extname(candidate).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, {
      'Cache-Control': pathname === '/' ? 'no-cache' : 'public, max-age=60',
      'Content-Type': contentType,
      'Content-Length': file.byteLength
    });
    response.end(request.method === 'HEAD' ? undefined : file);
  } catch (error) {
    if (error.code === 'ENOENT') {
      sendText(response, 404, 'Not Found');
      return;
    }
    sendText(response, 500, 'Static file could not be read');
  }
}

export function createServer({ staticRoot = defaultStaticRoot } = {}) {
  return http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', 'http://localhost');

      if (requestUrl.pathname === '/api/health' && request.method === 'GET') {
        sendJson(response, 200, {
          service: 'qualityos-api',
          status: 'ok',
          apiVersion,
          environment: process.env.NODE_ENV || 'development',
          commit: process.env.RENDER_GIT_COMMIT || null
        });
        return;
      }

      if (['/api/quality/overview', '/api/workspace/overview'].includes(requestUrl.pathname) && request.method === 'GET') {
        sendJson(response, 200, { ...overviewPayload, generatedAt: new Date().toISOString() });
        return;
      }

      if (requestUrl.pathname.startsWith('/api/')) {
        response.setHeader('Allow', 'GET');
        sendJson(response, 404, { error: 'Route not found', path: requestUrl.pathname });
        return;
      }

      await serveStatic(request, response, staticRoot, requestUrl.pathname);
    } catch {
      sendJson(response, 500, { error: 'QualityOS server error' });
    }
  });
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`QualityOS server listening on port ${port}`);
  });
}
