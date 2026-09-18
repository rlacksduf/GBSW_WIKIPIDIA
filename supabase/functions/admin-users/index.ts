import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  const auth = req.headers.get("Authorization") ?? "";
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const {
    data: { user },
  } = await admin.auth.getUser();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user?.id)
    .single();
  const { userId } = await req.json();
  if (!userId)
    return new Response(
      JSON.stringify({ error: "유효하지 않은 요청입니다." }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  if (!user || (userId !== user.id && profile?.role !== "admin"))
    return new Response(JSON.stringify({ error: "권한이 없습니다." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  const { error } = await admin.auth.admin.deleteUser(userId);
  return new Response(JSON.stringify({ error: error?.message ?? null }), {
    status: error ? 400 : 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
