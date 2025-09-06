import { NextRequest, NextResponse } from "next/server";
import { db } from "@/database";
import { liked_songs } from "@/database/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      const item = await db.select().from(liked_songs).where(eq(liked_songs.id, parseInt(id)));
      return NextResponse.json(item[0] || null);
    }

    const items = await db.select().from(liked_songs);
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await db.insert(liked_songs).values(body).returning();
    return NextResponse.json(result[0]);
  } catch (error) {
    return NextResponse.json({ error: "Failed to create item" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) throw new Error("ID required");

    await db.delete(liked_songs).where(eq(liked_songs.id, parseInt(id)));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
