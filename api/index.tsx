import { fetchHandler } from "../dist/api/handler.js";
export default function handler(req: Request) {
  return fetchHandler(req, null as any);
}