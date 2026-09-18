import { useState } from "react";
import { active, date, deleteAccount, result, rpc } from "./api";
import { Button, Cards, ImageField, Modal } from "./components";
import { supabase } from "./supabase";

export function Auth({ ctx, close, initial = "login" }) {
  const [mode, setMode] = useState(initial),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [nickname, setNickname] = useState("");
  return (
    <Modal
      title={
        {
          login: "로그인",
          signup: "회원가입",
          reset: "비밀번호 재설정",
          resend: "인증 메일 다시 보내기",
        }[mode]
      }
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ctx.run(
            async () => {
              if (!supabase) throw new Error("서비스 연결 설정이 필요합니다.");
              const redirect = location.origin + "/reset-password";
              if (mode === "signup")
                await result(
                  supabase.auth.signUp({
                    email,
                    password,
                    options: {
                      data: { nickname },
                      emailRedirectTo: location.origin + "/me",
                    },
                  }),
                );
              if (mode === "login")
                await result(
                  supabase.auth.signInWithPassword({ email, password }),
                );
              if (mode === "reset")
                await result(
                  supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: redirect,
                  }),
                );
              if (mode === "resend")
                await result(
                  supabase.auth.resend({
                    type: "signup",
                    email,
                    options: { emailRedirectTo: location.origin + "/me" },
                  }),
                );
              close();
            },
            mode === "login" ? "로그인했습니다." : "이메일을 확인해 주세요.",
          );
        }}
      >
        <label>
          이메일
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {mode === "signup" && (
          <label>
            닉네임
            <input
              required
              minLength={2}
              maxLength={20}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </label>
        )}
        {["login", "signup"].includes(mode) && (
          <label>
            비밀번호
            <input
              required
              type="password"
              minLength={8}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        <Button disabled={ctx.busy}>확인</Button>
      </form>
      <div className="actions">
        {Object.entries({
          login: "로그인",
          signup: "회원가입",
          reset: "비밀번호 찾기",
          resend: "인증 메일 재발송",
        })
          .filter(([key]) => key !== mode)
          .map(([key, label]) => (
            <button key={key} onClick={() => setMode(key)}>
              {label}
            </button>
          ))}
      </div>
    </Modal>
  );
}
export function Password({ ctx }) {
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  return (
    <main className="page">
      <h1>새 비밀번호 설정</h1>
      {ctx.user ? (
        <form
          className="profile-box"
          onSubmit={(e) => {
            e.preventDefault();
            ctx.run(async () => {
              if (password !== confirm)
                throw new Error("비밀번호가 일치하지 않습니다.");
              await result(supabase.auth.updateUser({ password }));
              ctx.go("/me");
            }, "비밀번호를 변경했습니다.");
          }}
        >
          <label>
            새 비밀번호
            <input
              required
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            비밀번호 확인
            <input
              required
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <Button disabled={ctx.busy}>변경</Button>
        </form>
      ) : (
        <p>이메일의 비밀번호 재설정 링크를 통해 들어오거나 로그인해 주세요.</p>
      )}
    </main>
  );
}
export function Profile({ ctx }) {
  const [form, setForm] = useState(ctx.profile || {}),
    [tab, setTab] = useState("written");
  const change = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  if (!ctx.user)
    return (
      <main className="page">
        <h1>마이페이지</h1>
        <Button onClick={() => ctx.login()}>로그인</Button>
      </main>
    );
  if (!ctx.profile)
    return (
      <main className="page">
        <p>
          회원 정보를 찾을 수 없습니다. 최신 DB 설정을 적용한 뒤 다시 시도해
          주세요.
        </p>
      </main>
    );
  return (
    <main className="page">
      <h1>내 프로필</h1>
      {!active(ctx.profile) && (
        <p className="notice">
          현재 정지된 계정입니다.{" "}
          {ctx.profile.suspended_until
            ? date(ctx.profile.suspended_until) + "까지"
            : "관리자 해제가 필요합니다."}
        </p>
      )}
      <form
        className="profile-box"
        onSubmit={(e) => {
          e.preventDefault();
          ctx.run(async () => {
            await rpc("update_my_profile", { data: form });
            await ctx.reload();
          }, "프로필을 저장했습니다.");
        }}
      >
        <label>
          닉네임
          <input
            required
            minLength={2}
            maxLength={20}
            value={form.nickname || ""}
            onChange={(e) => change("nickname", e.target.value)}
          />
        </label>
        <ImageField
          label="프로필 사진"
          value={form.avatar_url}
          onChange={(value) => change("avatar_url", value)}
          user={ctx.user}
          run={ctx.run}
        />
        <div className="two">
          <label>
            기수
            <select
              value={form.cohort || ""}
              onChange={(e) => change("cohort", e.target.value)}
            >
              <option value="">선택</option>
              {[1, 2].map((n) => (
                <option key={n} value={n}>
                  {n}기
                </option>
              ))}
            </select>
          </label>
          <label>
            학년
            <select
              value={form.grade || ""}
              onChange={(e) => change("grade", e.target.value)}
            >
              <option value="">선택</option>
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}학년
                </option>
              ))}
            </select>
          </label>
          <label>
            반
            <input
              type="number"
              min={1}
              max={10}
              value={form.class_number || ""}
              onChange={(e) => change("class_number", e.target.value)}
            />
          </label>
        </div>
        <Button disabled={ctx.busy || !active(ctx.profile)}>프로필 저장</Button>
      </form>
      <div className="actions">
        <button onClick={() => ctx.go("/reset-password")}>비밀번호 변경</button>
        <button
          onClick={() =>
            ctx.run(async () => {
              await result(supabase.auth.signOut());
              ctx.go("/");
            }, "로그아웃했습니다.")
          }
        >
          로그아웃
        </button>
        <button
          className="danger"
          disabled={ctx.busy}
          onClick={() => {
            if (
              window.confirm(
                "회원 탈퇴 시 계정과 프로필은 삭제되고 문서와 댓글의 작성자는 탈퇴 회원으로 표시됩니다. 계속할까요?",
              )
            )
              ctx.run(async () => {
                await deleteAccount(ctx.user.id);
                await supabase.auth.signOut({ scope: "local" });
                ctx.go("/");
              }, "탈퇴했습니다.");
          }}
        >
          회원 탈퇴
        </button>
      </div>
      <h2>내 활동</h2>
      <div className="chips">
        {[
          ["written", "작성한 문서"],
          ["edited", "수정한 문서"],
          ["comments", "작성한 댓글"],
          ["consent", "내 공개 동의"],
          ["requests", "삭제 요청"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "on" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {["written", "edited", "consent"].includes(tab) && (
        <Cards
          ctx={ctx}
          documents={ctx.documents.filter((d) =>
            tab === "written"
              ? d.author_id === ctx.user.id
              : tab === "consent"
                ? d.subject_id === ctx.user.id
                : ctx.revisions.some(
                    (r) =>
                      r.document_id === d.id && r.editor_id === ctx.user.id,
                  ),
          )}
        />
      )}
      {tab === "comments" &&
        ctx.comments
          .filter((c) => c.author_id === ctx.user.id)
          .map((c) => (
            <div className="comment" key={c.id}>
              <button onClick={() => ctx.go("/document/" + c.document_id)}>
                {ctx.documents.find((d) => d.id === c.document_id)?.title ||
                  "문서"}
              </button>
              <p>{c.content}</p>
              <small>{date(c.created_at)}</small>
            </div>
          ))}
      {tab === "requests" &&
        ctx.requests.map((r) => (
          <p key={r.id}>
            {r.reason} · {r.resolved ? "처리 완료" : "대기 중"}
          </p>
        ))}
    </main>
  );
}
