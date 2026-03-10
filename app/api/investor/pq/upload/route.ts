import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * POST /api/investor/pq/upload
 *
 * Upload a supporting document for the PQ (e.g., Malaysian sophisticated investor docs).
 * Stores in Supabase Storage: pq-documents/{investor_id}/{field_id}_{timestamp}.{ext}
 * Returns the storage path for inclusion in PQ form data.
 */
export async function POST(request: NextRequest) {
  // Auth
  const cookieStore = cookies();
  const userSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: investor } = await adminClient
    .from("investors")
    .select("id")
    .ilike("email", user.email)
    .single();

  if (!investor) return NextResponse.json({ error: "Investor not found" }, { status: 404 });

  // Parse form data
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const fieldId = formData.get("field_id") as string || "document";

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // Validate file size (10MB max)
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large. Maximum 10MB." }, { status: 400 });
  }

  // Validate file type
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const allowed = ["pdf", "jpg", "jpeg", "png"];
  if (!allowed.includes(ext)) {
    return NextResponse.json({ error: `File type .${ext} not allowed. Use PDF, JPG, or PNG.` }, { status: 400 });
  }

  // Upload to Supabase Storage
  const timestamp = Date.now();
  const storagePath = `${investor.id}/${fieldId}_${timestamp}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // Ensure the storage bucket exists (auto-create on first upload)
  const { data: buckets } = await adminClient.storage.listBuckets();
  const bucketExists = (buckets || []).some((b: any) => b.name === "pq-documents");
  if (!bucketExists) {
    await adminClient.storage.createBucket("pq-documents", {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024, // 10MB
    });
  }

  const { error: uploadErr } = await adminClient.storage
    .from("pq-documents")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadErr) {
    console.error("[PQ-UPLOAD] Storage error:", uploadErr.message);
    return NextResponse.json({ error: "Upload failed: " + uploadErr.message }, { status: 500 });
  }

  return NextResponse.json({ path: storagePath });
}
