import handler from '../server/handler.tsx';

export default async (req: Request) => {
  try {
    return await handler(req);
  } catch (error) {
    console.error('Handler error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};