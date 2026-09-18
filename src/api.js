import { supabase } from "./supabase";

export function errorText(error) {
  const message = error?.message || String(error);
  if (message.includes("schema cache") || message.includes("does not exist"))
    return "데이터베이스 설정을 확인해 주세요. 관리자에게 문의하거나 최신 schema.sql을 적용해 주세요.";
  if (error?.code === "23505")
    return "이미 사용 중인 닉네임, 제목 또는 분류입니다.";
  if (error?.code === "23503")
    return "연결된 항목이 변경되었습니다. 새로고침 후 다시 시도해 주세요.";
  return message;
}
export async function result(request) {
  if (!supabase) throw new Error("서비스 연결 설정이 필요합니다.");
  const { data, error } = await request;
  if (error) throw error;
  return data;
}
export async function rows(table, configure = (q) => q) {
  if (!supabase) return [];
  const output = [];
  for (let start = 0; ; start += 500) {
    const batch = await result(
      configure(supabase.from(table).select("*")).range(start, start + 499),
    );
    output.push(...batch);
    if (batch.length < 500) return output;
  }
}
export const rpc = (name, params = {}) => {
  if (!supabase)
    return Promise.reject(new Error("서비스 연결 설정이 필요합니다."));
  return result(supabase.rpc(name, params));
};
export const types = {
  student: "학생",
  teacher: "선생님",
  club: "동아리",
  project: "프로젝트",
  event: "교내 행사",
  place: "학교 장소",
  term: "학교 용어",
  other: "기타",
};
export const date = (value) =>
  value ? new Date(value).toLocaleString("ko-KR") : "";
export const isPerson = (doc) =>
  ["student", "teacher"].includes(doc.document_type);
export const isPublic = (doc) =>
  doc.status === "published" &&
  (!isPerson(doc) ||
    (doc.subject_verified && doc.subject_consent && doc.subject_id));
export const active = (profile) =>
  Boolean(
    profile &&
    (!profile.is_suspended ||
      (profile.suspended_until &&
        new Date(profile.suspended_until) <= new Date())),
  );
export const canEdit = (doc, profile) =>
  active(profile) &&
  (profile.role === "admin" ||
    (!doc.is_locked &&
      (doc.status === "published" || doc.author_id === profile.id)));
export function safeUrl(value) {
  if (!value) return "";
  if (value.startsWith("asset:")) return value;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
export async function deleteAccount(id) {
  const data = await result(
    supabase.functions.invoke("admin-users", { body: { userId: id } }),
  );
  if (data?.error) throw new Error(data.error);
}
