import { getPosts, type Post } from "app/server/index";
import { Link } from "wouter";

function PostLink({ post, to }: { post: Post, to: string }) {
  "use client";
  return (
    <Link to={to} className="text-blue-400 hover:text-blue-300 text-xl font-semibold">
      {post.title}
    </Link>
  )
}

export default async function Index() {
  const posts = await getPosts();

  return (
    <div className="bg-neutral-900 text-white flex flex-col items-center justify-center h-screen">
      <div>
        <h1 className="text-4xl font-bold">Welcome to my blog!</h1>
      </div>
      <br />
      <div>
        {posts?.map((post) => (
          <div key={post.id} className="mb-4">
            <PostLink post={post} to={`/posts/${post.id}`} />
            <br />
          </div>
        ))}
      </div>
    </div>
  )
}