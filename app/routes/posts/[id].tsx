import { getPost } from "app/server/index";

export default async function PostPage() {
  const path = (globalThis as any).__SSR_PATH__ || '/';
  const pathParts = path.split('/');
  const id = parseInt(pathParts[pathParts.length - 1] || "0");
  
  if (isNaN(id) || id < 0) {
    return (
      <div className="bg-neutral-900 text-white flex flex-col items-center justify-center h-screen">
        <h1 className="text-4xl font-bold">Post not found</h1>
      </div>
    );
  }

  const post = await getPost(id);
  
  if (!post) {
    return (
      <div className="bg-neutral-900 text-white flex flex-col items-center justify-center h-screen">
        <h1 className="text-4xl font-bold">Post not found</h1>
      </div>
    );
  }

  return (
    <div className="bg-neutral-900 text-white flex flex-col items-center justify-center h-screen">
      <div className="max-w-4xl mx-auto p-8">
        <h1 className="text-4xl font-bold mb-4">{post.title}</h1>
        <br />
        <div className="text-lg mb-4">{post.content}</div>
        <br />
        <a href="/" className="text-blue-400 hover:text-blue-300 mt-4 inline-block">
          ← Back to home
        </a>
      </div>
    </div>
  );
}
