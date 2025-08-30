import { fetchHandler } from '../dist/server/handler.js';

export default (req: Request) => {
  return fetchHandler(req, null as any);
};