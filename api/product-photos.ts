import type {IncomingMessage, ServerResponse} from 'node:http';
import {findProductPhotos} from '../server/product-photos.js';

export default async function productPhotos(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.writeHead(405);
    response.end(JSON.stringify({error: 'Use GET to find product photos.'}));
    return;
  }
  const params = new URL(request.url ?? '/', 'https://pos.local').searchParams;
  try {
    const photos = await findProductPhotos({query: params.get('q') ?? '', barcode: params.get('barcode') ?? ''});
    response.end(JSON.stringify({photos}));
  } catch {
    response.writeHead(503);
    response.end(JSON.stringify({error: 'Online photo catalogs are temporarily unavailable.'}));
  }
}
