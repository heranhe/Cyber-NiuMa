import { requestHandler } from '../server.mjs';

export default async function handler(req, res) {
  return requestHandler(req, res);
}
