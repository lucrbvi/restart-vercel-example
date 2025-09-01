import { getPosts } from "app/server/index";

export default async function Index() {
  const posts = await getPosts();

  return (
    <div className="bg-neutral-900 text-white flex flex-col items-center justify-center h-screen">
      <div className="mb-8">
        <h1 className="text-4xl font-bold flex items-center gap-4">Welcome to my blog!</h1>
      </div>
      <div>
        {posts?.map((post) => (
          <div key={post.id} className="mb-8">
            <a href={`/posts/${post.id}`} className="text-blue-400 hover:text-blue-300 text-xl font-semibold">
              {post.title}
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}