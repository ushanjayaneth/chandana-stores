import type {IncomingMessage, ServerResponse} from 'node:http';
import {downloadCataloguePhoto, findProductPhotos} from '../server/product-photos.js';

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
    const image = params.get('image');
    if (image !== null) {
      const photo = await downloadCataloguePhoto(image);
      if (!photo) { response.writeHead(404); response.end(JSON.stringify({error: 'Photo unavailable'})); return; }
      response.setHeader('Content-Type', photo.mime);
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.end(photo.bytes);
      return;
    }
    const photos = await findProductPhotos({query: params.get('q') ?? '', barcode: params.get('barcode') ?? ''});
    response.end(JSON.stringify({photos}));
  } catch {
    response.writeHead(503);
    response.end(JSON.stringify({error: 'Online photo catalogs are temporarily unavailable.'}));
  }
}
