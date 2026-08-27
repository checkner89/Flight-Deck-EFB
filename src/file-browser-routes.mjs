import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { mimeFor } from './file-browser-service.mjs';

const JSON_LIMIT = 10 * 1024 * 1024;

function sendJson(response, statusCode, value) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

async function readJson(request, maxBytes = JSON_LIMIT) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('Request body too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

async function streamFile(request, response, filename, { disposition = 'inline' } = {}) {
  const stats = await fs.stat(filename);
  if (!stats.isFile()) throw new Error('Der Pfad ist keine Datei.');
  const total = stats.size;
  const range = String(request.headers.range || '').match(/^bytes=(\d*)-(\d*)$/i);
  const contentType = mimeFor(filename);
  const safeName = path.basename(filename).replace(/["\r\n]/g, '_');
  const headers = {
    'Accept-Ranges': 'bytes',
    'Content-Type': contentType,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${disposition}; filename="${safeName}"`,
  };
  if (!range) {
    response.writeHead(200, { ...headers, 'Content-Length': total });
    createReadStream(filename).pipe(response);
    return;
  }
  let start = range[1] ? Number(range[1]) : 0;
  let end = range[2] ? Number(range[2]) : total - 1;
  if (!range[1] && range[2]) {
    const suffixLength = Number(range[2]);
    start = Math.max(0, total - suffixLength);
    end = total - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= total) {
    response.writeHead(416, { 'Content-Range': `bytes */${total}` });
    response.end();
    return;
  }
  end = Math.min(end, total - 1);
  response.writeHead(206, {
    ...headers,
    'Content-Length': end - start + 1,
    'Content-Range': `bytes ${start}-${end}/${total}`,
  });
  createReadStream(filename, { start, end }).pipe(response);
}

function apiError(response, error, statusCode = 422) {
  const message = error?.code === 'ENOENT' ? 'Datei oder Ordner wurde nicht gefunden.'
    : error?.code === 'EACCES' || error?.code === 'EPERM' ? 'Zugriff auf diesen Pfad wurde vom Betriebssystem verweigert.'
      : error?.message || 'File browser request failed.';
  sendJson(response, statusCode, { error: message, code: error?.code || null });
}

export async function handleFileBrowserRequest({ request, response, requestUrl, pathname, authenticated, hostAuthenticated, service }) {
  if (!pathname.startsWith('/api/files/')) return false;
  if (!authenticated) {
    sendJson(response, 401, { error: 'Pairing erforderlich.' });
    return true;
  }

  const host = Boolean(hostAuthenticated);
  try {
    if (pathname === '/api/files/roots' && request.method === 'GET') {
      sendJson(response, 200, await service.roots({ host }));
      return true;
    }

    if (pathname === '/api/files/list' && request.method === 'GET') {
      const target = requestUrl.searchParams.get('path');
      const showHidden = requestUrl.searchParams.get('hidden') === '1';
      sendJson(response, 200, await service.list(target, { host, showHidden }));
      return true;
    }

    if (pathname === '/api/files/meta' && request.method === 'GET') {
      sendJson(response, 200, await service.metadata(requestUrl.searchParams.get('path'), { host }));
      return true;
    }

    if (pathname === '/api/files/search' && request.method === 'GET') {
      const target = requestUrl.searchParams.get('path');
      const query = requestUrl.searchParams.get('q') || '';
      const showHidden = requestUrl.searchParams.get('hidden') === '1';
      const limit = integer(requestUrl.searchParams.get('limit'), 250, 1, 500);
      sendJson(response, 200, await service.search(target, query, { host, showHidden, limit }));
      return true;
    }

    if (pathname === '/api/files/preview' && request.method === 'GET') {
      sendJson(response, 200, await service.preview(requestUrl.searchParams.get('path'), { host }));
      return true;
    }

    if (pathname === '/api/files/content' && request.method === 'GET') {
      const target = await service.assertReadable(requestUrl.searchParams.get('path'), { host });
      await streamFile(request, response, target, { disposition: requestUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline' });
      return true;
    }

    if (!host) {
      sendJson(response, 403, { error: 'Dateiänderungen sind nur in der Windows-App erlaubt.' });
      return true;
    }

    if (pathname === '/api/files/folder' && request.method === 'POST') {
      const body = await readJson(request);
      sendJson(response, 201, { item: await service.mkdir(body.path, body.name, { host: true }) });
      return true;
    }

    if (pathname === '/api/files/new-file' && request.method === 'POST') {
      const body = await readJson(request);
      sendJson(response, 201, { item: await service.createFile(body.path, body.name, { host: true }) });
      return true;
    }

    if (pathname === '/api/files/text' && request.method === 'PUT') {
      const body = await readJson(request, 9 * 1024 * 1024);
      sendJson(response, 200, { item: await service.writeText(body.path, body.content, { host: true }) });
      return true;
    }

    if (pathname === '/api/files/rename' && request.method === 'POST') {
      const body = await readJson(request);
      sendJson(response, 200, { item: await service.rename(body.path, body.name, { host: true }) });
      return true;
    }

    if (pathname === '/api/files/copy' && request.method === 'POST') {
      const body = await readJson(request);
      sendJson(response, 201, { item: await service.copyInto(body.source, body.destination, { host: true }) });
      return true;
    }

    if (pathname === '/api/files/move' && request.method === 'POST') {
      const body = await readJson(request);
      sendJson(response, 200, { item: await service.moveInto(body.source, body.destination, { host: true }) });
      return true;
    }

    if (pathname === '/api/files/item' && request.method === 'DELETE') {
      sendJson(response, 200, await service.remove(requestUrl.searchParams.get('path'), { host: true }));
      return true;
    }

    if (pathname === '/api/files/upload' && request.method === 'POST') {
      const directory = requestUrl.searchParams.get('path');
      const name = requestUrl.searchParams.get('name');
      const overwrite = requestUrl.searchParams.get('overwrite') === '1';
      const contentLength = Number(request.headers['content-length'] || 0);
      if (contentLength > service.maxUploadBytes) {
        sendJson(response, 413, { error: 'Upload überschreitet das 2-GB-Limit.' });
        return true;
      }
      const item = await service.receiveUpload(directory, name, request, { host: true, overwrite });
      sendJson(response, 201, { item });
      return true;
    }

    sendJson(response, 404, { error: 'File browser endpoint not found.' });
    return true;
  } catch (error) {
    apiError(response, error, error?.code === 'ENOENT' ? 404 : error?.code === 'EACCES' || error?.code === 'EPERM' ? 403 : 422);
    return true;
  }
}
