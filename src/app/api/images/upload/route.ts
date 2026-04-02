import { NextResponse } from "next/server";
import { createSupabaseAdminClient, hasSupabaseServiceRole } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

const DEFAULT_BUCKET = process.env.SUPABASE_IMAGE_BUCKET?.trim() || "article-assets";

function normalizeFileName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9.\-_]/g, "")
    .slice(-80) || "image";
}

async function ensureBucket() {
  const supabase = createSupabaseAdminClient();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    throw new Error(listError.message);
  }

  const exists = buckets?.some((bucket) => bucket.name === DEFAULT_BUCKET);
  if (!exists) {
    const { error: createError } = await supabase.storage.createBucket(DEFAULT_BUCKET, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    });

    if (createError && !/already exists/i.test(createError.message)) {
      throw new Error(createError.message);
    }
  }

  return supabase;
}

export async function POST(request: Request) {
  if (!hasSupabaseServiceRole()) {
    return NextResponse.json({ message: "Supabase 服务端存储未配置，无法上传图片。" }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "缺少图片文件。" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ message: "仅支持图片文件上传。" }, { status: 400 });
    }

    const supabase = await ensureBucket();
    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = `draft-images/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${normalizeFileName(file.name)}`;

    const { error: uploadError } = await supabase.storage.from(DEFAULT_BUCKET).upload(filePath, buffer, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage.from(DEFAULT_BUCKET).getPublicUrl(filePath);

    return NextResponse.json({
      ok: true,
      bucket: DEFAULT_BUCKET,
      path: filePath,
      url: data.publicUrl,
    });
  } catch (error) {
    console.error("Failed to upload image:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "图片上传失败，请稍后重试。" },
      { status: 500 },
    );
  }
}
