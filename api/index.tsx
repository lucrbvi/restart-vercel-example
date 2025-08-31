import { fetchHandler } from '../server/handler.tsx';

export default (req: Request) => {
  return fetchHandler(req, null as any);
};