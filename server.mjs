import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createPostgresWorkspaceStore } from './db/postgres-store.mjs';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultStaticRoot = path.join(projectRoot, 'outputs');
const defaultWorkspaceFile = path.join(process.env.QUALITYOS_DATA_DIR || path.join(projectRoot, 'data'), 'workspace.json');
const apiVersion = '0.1.0';
const maxWorkspaceBytes = 8 * 1024 * 1024;
const maxRecordBytes = 1024 * 1024;
const defaultDatabaseWorkspaceId = '00000000-0000-4000-8000-000000000001';
const supportedRoles = new Set(['admin', 'quality_manager', 'quality_engineer', 'operator', 'supplier']);
const mutationRoles = new Set(['admin', 'quality_manager', 'quality_engineer', 'operator']);

const recordCollections = {
  actions: 'actions',
  evidence: 'evidenceRequests',
  inspections: 'inspectionRecords',
  capas: 'capas'
};

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
    mutations: 'authenticated workspace and record endpoints',
    persistence: 'file-backed prototype'
  }
};

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendJson(response, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...headers
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

function defaultWorkspace() {
  return {
    format: 'QualityOS server workspace',
    version: 1,
    updatedAt: null,
    data: {}
  };
}

async function readWorkspace(workspaceFile) {
  try {
    const stored = JSON.parse(await fs.readFile(workspaceFile, 'utf8'));
    if (stored?.format === 'QualityOS server workspace' && stored?.version === 1 && stored?.data && typeof stored.data === 'object') return stored;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return defaultWorkspace();
}

function validateWorkspacePayload(payload) {
  return payload && typeof payload === 'object' && payload.version === 1 && ['QualityOS browser workspace', 'QualityOS server workspace'].includes(payload.format) && payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data);
}

async function writeWorkspace(workspaceFile, payload) {
  const next = { format: 'QualityOS server workspace', version: 1, updatedAt: new Date().toISOString(), data: payload.data };
  await fs.mkdir(path.dirname(workspaceFile), { recursive: true });
  const temporaryFile = `${workspaceFile}.${process.pid}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(next, null, 2), 'utf8');
  await fs.rename(temporaryFile, workspaceFile);
  return next;
}

function workspaceEtag(workspace) {
  const digest = createHash('sha256').update(JSON.stringify(workspace)).digest('hex');
  return `"${digest}"`;
}

function hasMatchingIfMatch(request, currentEtag) {
  const expected = String(request.headers['if-match'] || '').trim();
  return !expected || expected === '*' || expected === currentEtag;
}

function sendWorkspaceConflict(response, currentEtag) {
  sendJson(response, 409, { error: 'Workspace changed since this client last read it. Pull the latest state before retrying.', etag: currentEtag }, { ETag: currentEtag });
}

function parseApiTokens(value) {
  let entries = value;
  if (typeof entries === 'string') {
    try { entries = JSON.parse(entries); } catch { return []; }
  }
  if (!Array.isArray(entries)) return [];
  return entries.filter(entry => entry && typeof entry.token === 'string' && entry.token.length > 0 && supportedRoles.has(entry.role)).map(entry => ({
    token: entry.token,
    subject: typeof entry.subject === 'string' && entry.subject.length > 0 ? entry.subject.slice(0, 80) : 'api-user',
    role: entry.role,
    workspaceId: typeof entry.workspaceId === 'string' && entry.workspaceId.length > 0 ? entry.workspaceId.slice(0, 120) : null
  }));
}

function authenticate(request, authConfig) {
  const candidates = [];
  if (authConfig.apiToken) candidates.push({ token: authConfig.apiToken, subject: 'legacy-api-token', role: 'admin', workspaceId: null });
  candidates.push(...authConfig.apiTokens);
  if (!candidates.length) return { ok: false, status: 503, error: 'Workspace API authentication is not configured.' };
  const authorization = String(request.headers.authorization || '');
  const receivedToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const received = Buffer.from(receivedToken);
  for (const candidate of candidates) {
    const expected = Buffer.from(candidate.token);
    if (expected.length === received.length && timingSafeEqual(expected, received)) return { ok: true, subject: candidate.subject, role: candidate.role, workspaceId: candidate.workspaceId };
  }
  return { ok: false, status: 401, error: 'A valid Bearer token is required.' };
}

function hasWorkspaceAccess(authentication, workspaceIdentifiers) {
  return !authentication.workspaceId || workspaceIdentifiers.has(String(authentication.workspaceId));
}

function sendWorkspaceForbidden(response, workspaceId) {
  sendJson(response, 403, { error: 'This API identity is not assigned to the requested workspace.', workspaceId });
}

function readRequestBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let tooLarge = false;
    request.setEncoding('utf8');
    request.on('data', chunk => {
      if (tooLarge) return;
      totalBytes += Buffer.byteLength(chunk);
      if (totalBytes > limit) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => tooLarge ? reject(Object.assign(new Error('Payload too large'), { code: 'PAYLOAD_TOO_LARGE' })) : resolve(chunks.join('')));
    request.on('error', reject);
  });
}

function collectionField(collection) {
  return recordCollections[collection] || null;
}

function normalizeRecordPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = { ...payload };
  if (record.id !== undefined && (typeof record.id !== 'string' || record.id.length < 1 || record.id.length > 80)) return null;
  record.id = record.id || `API-${randomUUID().slice(0, 8).toUpperCase()}`;
  return record;
}

function findRecord(records, id) {
  return records.find(record => String(record?.id || '') === id) || null;
}

async function readJsonPayload(request, limit) {
  const declaredLength = Number(request.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > limit) throw Object.assign(new Error('Payload too large'), { code: 'PAYLOAD_TOO_LARGE' });
  if (!String(request.headers['content-type'] || '').toLowerCase().includes('application/json')) throw Object.assign(new Error('JSON required'), { code: 'UNSUPPORTED_MEDIA_TYPE' });
  let body;
  try {
    body = await readRequestBody(request, limit);
  } catch (error) {
    throw error;
  }
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { code: 'INVALID_JSON' });
  }
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

export function createServer({ staticRoot = defaultStaticRoot, workspaceFile = defaultWorkspaceFile, workspaceId = process.env.QUALITYOS_WORKSPACE_ID || overviewPayload.workspace.id, apiToken = process.env.QUALITYOS_API_TOKEN, apiTokens = process.env.QUALITYOS_API_TOKENS, allowedOrigin = process.env.QUALITYOS_ALLOWED_ORIGIN, databaseUrl = process.env.DATABASE_URL, databaseWorkspaceId = process.env.QUALITYOS_DATABASE_WORKSPACE_ID || defaultDatabaseWorkspaceId, databaseWorkspaceSlug = process.env.QUALITYOS_DATABASE_WORKSPACE_SLUG || 'qualityos-default', databaseWorkspaceName = process.env.QUALITYOS_DATABASE_WORKSPACE_NAME || 'QualityOS' } = {}) {
  const authConfig = { apiToken, apiTokens: parseApiTokens(apiTokens) };
  const workspaceIdentifiers = new Set([workspaceId, databaseWorkspaceId, databaseWorkspaceSlug].filter(Boolean).map(String));
  const postgresStore = databaseUrl ? createPostgresWorkspaceStore({ databaseUrl, workspaceId: databaseWorkspaceId, workspaceSlug: databaseWorkspaceSlug, workspaceName: databaseWorkspaceName }) : null;
  let fileWriteQueue = Promise.resolve();
  const readStoredWorkspace = () => postgresStore ? postgresStore.read() : readWorkspace(workspaceFile);
  const writeStoredWorkspace = async (payload, expectedEtag) => {
    if (postgresStore) return postgresStore.write(payload, expectedEtag);
    const pendingWrite = fileWriteQueue.then(async () => {
      const current = await readWorkspace(workspaceFile);
      const currentEtag = workspaceEtag(current);
      if (!hasMatchingIfMatch({ headers: { 'if-match': expectedEtag } }, currentEtag)) return { conflict: true, workspace: current, etag: currentEtag };
      const workspace = await writeWorkspace(workspaceFile, payload);
      return { workspace, etag: workspaceEtag(workspace) };
    });
    fileWriteQueue = pendingWrite.then(() => undefined, () => undefined);
    return pendingWrite;
  };
  return http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', 'http://localhost');
      const isApiRequest = requestUrl.pathname.startsWith('/api/');
      const requestOrigin = String(request.headers.origin || '');
      if (isApiRequest && allowedOrigin && (allowedOrigin === '*' || requestOrigin === allowedOrigin)) {
        response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, OPTIONS');
        response.setHeader('Vary', 'Origin');
      }
      if (isApiRequest && request.method === 'OPTIONS') {
        response.writeHead(204);
        response.end();
        return;
      }

      if (requestUrl.pathname === '/api/health' && request.method === 'GET') {
        sendJson(response, 200, {
          service: 'qualityos-api',
          status: 'ok',
          apiVersion,
          persistence: postgresStore ? 'postgres' : 'file',
          environment: process.env.NODE_ENV || 'development',
          commit: process.env.RENDER_GIT_COMMIT || null
        });
        return;
      }

      if (['/api/quality/overview', '/api/workspace/overview'].includes(requestUrl.pathname) && request.method === 'GET') {
        sendJson(response, 200, { ...overviewPayload, generatedAt: new Date().toISOString() });
        return;
      }

      if (requestUrl.pathname === '/api/session' && request.method === 'GET') {
        const authentication = authenticate(request, authConfig);
        if (!authentication.ok) {
          response.setHeader('WWW-Authenticate', 'Bearer');
          sendJson(response, authentication.status, { error: authentication.error });
          return;
        }
        if (!hasWorkspaceAccess(authentication, workspaceIdentifiers)) {
          sendWorkspaceForbidden(response, authentication.workspaceId);
          return;
        }
        sendJson(response, 200, {
          authenticated: true,
          subject: authentication.subject,
          role: authentication.role,
          workspaceId: authentication.workspaceId,
          permissions: { read: true, mutate: mutationRoles.has(authentication.role) },
          apiVersion
        });
        return;
      }

      if (requestUrl.pathname === '/api/workspace' && ['GET', 'PUT'].includes(request.method)) {
        const authentication = authenticate(request, authConfig);
        if (!authentication.ok) {
          response.setHeader('WWW-Authenticate', 'Bearer');
          sendJson(response, authentication.status, { error: authentication.error });
          return;
        }
        if (!hasWorkspaceAccess(authentication, workspaceIdentifiers)) {
          sendWorkspaceForbidden(response, authentication.workspaceId);
          return;
        }
        if (request.method === 'PUT' && !mutationRoles.has(authentication.role)) {
          sendJson(response, 403, { error: 'This API identity has read-only access.' });
          return;
        }
        if (request.method === 'GET') {
          const workspace = await readStoredWorkspace();
          const etag = workspaceEtag(workspace);
          sendJson(response, 200, { ...workspace, etag }, { ETag: etag });
          return;
        }
        const currentWorkspace = await readStoredWorkspace();
        const currentEtag = workspaceEtag(currentWorkspace);
        if (!hasMatchingIfMatch(request, currentEtag)) {
          sendWorkspaceConflict(response, currentEtag);
          return;
        }
        const declaredLength = Number(request.headers['content-length']);
        if (Number.isFinite(declaredLength) && declaredLength > maxWorkspaceBytes) {
          sendJson(response, 413, { error: 'Workspace payload exceeds the 8 MB limit.' });
          return;
        }
        if (!String(request.headers['content-type'] || '').toLowerCase().includes('application/json')) {
          sendJson(response, 415, { error: 'Workspace mutations require application/json.' });
          return;
        }
        let payload;
        try {
          payload = JSON.parse(await readRequestBody(request, maxWorkspaceBytes));
        } catch (error) {
          sendJson(response, error.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, { error: error.code === 'PAYLOAD_TOO_LARGE' ? 'Workspace payload exceeds the 8 MB limit.' : 'Workspace payload must be valid JSON.' });
          return;
        }
        if (!validateWorkspacePayload(payload)) {
          sendJson(response, 400, { error: 'Workspace payload must use a supported QualityOS format and version 1.' });
          return;
        }
        const result = await writeStoredWorkspace(payload, currentEtag);
        if (result.conflict) {
          sendWorkspaceConflict(response, result.etag);
          return;
        }
        sendJson(response, 200, { ...result.workspace, etag: result.etag }, { ETag: result.etag });
        return;
      }

      const recordRoute = /^\/api\/records\/([^/]+)(?:\/([^/]+))?$/.exec(requestUrl.pathname);
      if (recordRoute && ['GET', 'POST', 'PATCH'].includes(request.method)) {
        const collection = decodeURIComponent(recordRoute[1]);
        const field = collectionField(collection);
        if (!field) {
          sendJson(response, 404, { error: 'Unsupported record collection.', collection });
          return;
        }
        const authentication = authenticate(request, authConfig);
        if (!authentication.ok) {
          response.setHeader('WWW-Authenticate', 'Bearer');
          sendJson(response, authentication.status, { error: authentication.error });
          return;
        }
        if (!hasWorkspaceAccess(authentication, workspaceIdentifiers)) {
          sendWorkspaceForbidden(response, authentication.workspaceId);
          return;
        }
        if (request.method !== 'GET' && !mutationRoles.has(authentication.role)) {
          sendJson(response, 403, { error: 'This API identity has read-only access.' });
          return;
        }
        const workspace = await readStoredWorkspace();
        const etag = workspaceEtag(workspace);
        const records = Array.isArray(workspace.data[field]) ? workspace.data[field] : [];
        const recordId = recordRoute[2] ? decodeURIComponent(recordRoute[2]) : null;
        if (request.method === 'GET') {
          if (recordId) {
            const record = findRecord(records, recordId);
            if (!record) { sendJson(response, 404, { error: 'Record not found.', collection, id: recordId }); return; }
            sendJson(response, 200, { collection, record, updatedAt: workspace.updatedAt, etag }, { ETag: etag });
          } else {
            sendJson(response, 200, { collection, items: records, updatedAt: workspace.updatedAt, etag }, { ETag: etag });
          }
          return;
        }
        if (!hasMatchingIfMatch(request, etag)) {
          sendWorkspaceConflict(response, etag);
          return;
        }
        if (request.method === 'POST' && recordId) {
          sendJson(response, 400, { error: 'POST creates a record collection item and cannot include an id in the path.' });
          return;
        }
        if (request.method === 'PATCH' && !recordId) {
          sendJson(response, 400, { error: 'PATCH requires a record id in the path.' });
          return;
        }
        let payload;
        try {
          payload = await readJsonPayload(request, maxRecordBytes);
        } catch (error) {
          const status = error.code === 'PAYLOAD_TOO_LARGE' ? 413 : error.code === 'UNSUPPORTED_MEDIA_TYPE' ? 415 : 400;
          sendJson(response, status, { error: status === 413 ? 'Record payload exceeds the 1 MB limit.' : status === 415 ? 'Record mutations require application/json.' : 'Record payload must be valid JSON.' });
          return;
        }
        if (request.method === 'POST') {
          const record = normalizeRecordPayload(payload);
          if (!record) { sendJson(response, 400, { error: 'Record must be a JSON object with an optional id up to 80 characters.' }); return; }
          if (findRecord(records, record.id)) { sendJson(response, 409, { error: 'A record with that id already exists.', collection, id: record.id }); return; }
          const result = await writeStoredWorkspace({ data: { ...workspace.data, [field]: [record, ...records] } }, etag);
          if (result.conflict) { sendWorkspaceConflict(response, result.etag); return; }
          sendJson(response, 201, { collection, record, updatedAt: result.workspace.updatedAt, etag: result.etag }, { ETag: result.etag });
          return;
        }
        const existing = findRecord(records, recordId);
        if (!existing) { sendJson(response, 404, { error: 'Record not found.', collection, id: recordId }); return; }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || (payload.id !== undefined && payload.id !== recordId)) { sendJson(response, 400, { error: 'Patch must be an object and cannot change the record id.' }); return; }
        const updated = { ...existing, ...payload, id: recordId };
        const result = await writeStoredWorkspace({ data: { ...workspace.data, [field]: records.map(record => record.id === recordId ? updated : record) } }, etag);
        if (result.conflict) { sendWorkspaceConflict(response, result.etag); return; }
        sendJson(response, 200, { collection, record: updated, updatedAt: result.workspace.updatedAt, etag: result.etag }, { ETag: result.etag });
        return;
      }

      if (requestUrl.pathname.startsWith('/api/')) {
        response.setHeader('Allow', 'GET, POST, PATCH, PUT, OPTIONS');
        sendJson(response, 404, { error: 'Route not found', path: requestUrl.pathname });
        return;
      }

      await serveStatic(request, response, staticRoot, requestUrl.pathname);
    } catch (error) {
      if (response.headersSent) return;
      sendJson(response, error.code === 'PAYLOAD_TOO_LARGE' ? 413 : 500, { error: error.code === 'PAYLOAD_TOO_LARGE' ? 'Workspace payload exceeds the 8 MB limit.' : 'QualityOS server error' });
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
