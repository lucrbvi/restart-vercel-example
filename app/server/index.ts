import { createClient } from "@libsql/client";

const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

export type Post = {
    id: number,
    title: string,
    content: string,
    metadata: JSON,
}

export async function getPosts(): Promise<Post[]> {
    const result = await db.execute("SELECT * FROM posts");
    
    return result.rows.map((row) => ({
        id: row.id as number,
        title: row.title as string,
        content: row.content as string,
        metadata: JSON.parse(row.metadata as string),
    }));
}

export async function getPost(id: number): Promise<Post | null> {
    const result = await db.execute("SELECT * FROM posts WHERE id = ?", [id]);
    
    if (result.rows.length === 0) {
        return null;
    }
    
    const row = result.rows[0];
    if (!row) {
        return null;
    }
    
    return {
        id: row.id as number,
        title: row.title as string,
        content: row.content as string,
        metadata: JSON.parse(row.metadata as string),
    };
}