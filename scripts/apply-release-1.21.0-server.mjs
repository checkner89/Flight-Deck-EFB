import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.21.0') throw new Error(`1.21.0 server materializer requires package version 1.21.0, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}
function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`1.21.0 server anchor missing: ${label}`);
  return source.replace(from, to);
}

await update('src/server.mjs', (source) => {
  let next = source;
  if (!next.includes("import { FlightMediaService } from './flight-media-service.mjs';")) {
    next = replaceRequired(next,
      "import { FlightRecorder } from './flight-recorder.mjs';",
      "import { FlightRecorder } from './flight-recorder.mjs';\nimport { FlightMediaService } from './flight-media-service.mjs';",
      'media import');
  }
  if (!next.includes('async function readBinaryBody(request')) {
    const helper = `async function readBinaryBody(request, { maxBytes = 16 * 1024 * 1024 } = {}) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

`;
    next = replaceRequired(next, 'function localIpv4Addresses() {', helper + 'function localIpv4Addresses() {', 'binary body reader');
  }
  next = next.replace(
    "'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',",
    "'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), display-capture=(self)',",
  );
  if (!next.includes('const media = new FlightMediaService')) {
    next = replaceRequired(next,
      "  const recorder = flightRecorder ?? new FlightRecorder(engine, { storageDirectory: flightStorageDirectory });\n  await recorder.start();",
      "  const recorder = flightRecorder ?? new FlightRecorder(engine, { storageDirectory: flightStorageDirectory });\n  await recorder.start();\n  const media = new FlightMediaService({ storageDirectory: flightStorageDirectory ? path.join(flightStorageDirectory, 'media') : undefined });\n  await media.start();",
      'media initialization');
  }

  if (!next.includes("pathname === '/api/media/screenshot'")) {
    const routes = [
      "      if (pathname === '/api/media' && request.method === 'GET') {",
      "        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });",
      "        const current = await recorder.current({ includeTrack: false });",
      "        const flightId = requestUrl.searchParams.get('flightId') || current?.id || 'unassigned';",
      "        return json(response, 200, { items: await media.list({ flightId }) });",
      "      }",
      "",
      "      if (pathname === '/api/media/screenshot' && request.method === 'POST') {",
      "        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });",
      "        try {",
      "          const current = await recorder.current({ includeTrack: false });",
      "          const body = await readBinaryBody(request, { maxBytes: 24 * 1024 * 1024 });",
      "          const item = await media.saveScreenshot(body, {",
      "            flightId: requestUrl.searchParams.get('flightId') || current?.id || 'unassigned',",
      "            callsign: requestUrl.searchParams.get('callsign') || current?.flight?.callsign || 'flight',",
      "            contentType: request.headers['content-type'] || 'image/png',",
      "          });",
      "          return json(response, 201, { item });",
      "        } catch (error) { return json(response, 400, { error: error.message }); }",
      "      }",
      "",
      "      if (pathname === '/api/media/recordings/start' && request.method === 'POST') {",
      "        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });",
      "        try {",
      "          const current = await recorder.current({ includeTrack: false });",
      "          const body = await readJsonBody(request);",
      "          const recording = await media.beginRecording({",
      "            flightId: body.flightId || current?.id || 'unassigned',",
      "            callsign: body.callsign || current?.flight?.callsign || 'flight',",
      "            contentType: body.contentType || 'video/webm',",
      "          });",
      "          return json(response, 201, { recording });",
      "        } catch (error) { return json(response, 400, { error: error.message }); }",
      "      }",
      "",
      "      const mediaChunkMatch = pathname.match(/^\\/api\\/media\\/recordings\\/([a-z0-9-]+)\\/chunk$/i);",
      "      if (mediaChunkMatch && request.method === 'POST') {",
      "        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });",
      "        try {",
      "          const body = await readBinaryBody(request, { maxBytes: 16 * 1024 * 1024 });",
      "          return json(response, 200, await media.appendRecordingChunk(mediaChunkMatch[1], body));",
      "        } catch (error) { return json(response, 400, { error: error.message }); }",
      "      }",
      "",
      "      const mediaFinishMatch = pathname.match(/^\\/api\\/media\\/recordings\\/([a-z0-9-]+)\\/finish$/i);",
      "      if (mediaFinishMatch && request.method === 'POST') {",
      "        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });",
      "        try { return json(response, 200, { item: await media.finishRecording(mediaFinishMatch[1]) }); }",
      "        catch (error) { return json(response, 400, { error: error.message }); }",
      "      }",
      "",
      "      if (pathname.startsWith('/api/media/file/') && request.method === 'GET') {",
      "        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });",
      "        try {",
      "          const item = await media.read(pathname.slice('/api/media/file/'.length));",
      "          response.writeHead(200, {",
      "            'Content-Type': item.contentType,",
      "            'Content-Length': item.body.length,",
      "            'Cache-Control': 'private, max-age=60',",
      "            'Content-Disposition': 'inline; filename=\"' + item.filename.replace(/[^A-Za-z0-9_.-]/g, '-') + '\"',",
      "            'X-Content-Type-Options': 'nosniff',",
      "          });",
      "          response.end(item.body);",
      "          return;",
      "        } catch (error) { return json(response, 404, { error: error.message }); }",
      "      }",
      "",
      "      if (pathname.startsWith('/api/media/') && request.method === 'DELETE') {",
      "        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });",
      "        try {",
      "          await media.delete(pathname.slice('/api/media/'.length));",
      "          return json(response, 200, { deleted: true });",
      "        } catch (error) { return json(response, 404, { error: error.message }); }",
      "      }",
      "",
      "",
    ].join('\n');
    next = replaceRequired(next,
      "      if (pathname === '/api/flights' && request.method === 'GET') {",
      routes + "      if (pathname === '/api/flights' && request.method === 'GET') {",
      'media routes');
  }

  next = next.replace(/^const APP_VERSION = '[^']+';/m, "const APP_VERSION = '1.21.0';");
  return next;
});

console.log('Flight Deck EFB 1.21.0 media/server materialized.');
