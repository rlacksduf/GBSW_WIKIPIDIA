import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { hasSupabaseConfig, supabase } from "./supabase";
import "./wiki.css";

const typeNames = {
  student: "학생",
  teacher: "선생님",
  club: "동아리",
  project: "프로젝트",
  event: "교내 행사",
  place: "학교 장소",
  term: "학교 용어",
  other: "기타",
};
const emptyDoc = {
  title: "",
  summary: "",
  content: "",
  category_id: "",
  document_type: "other",
  subject_consent: false,
  edit_summary: "",
};
const now = (value) =>
  new Date(value || Date.now()).toLocaleDateString("ko-KR");
const readableError = (message = "") =>
  message.includes("Could not find the table") ||
  message.includes("schema cache")
    ? "Supabase에 문서 테이블이 없어요. SQL Editor에서 supabase/schema.sql 전체를 실행한 뒤 다시 시도해 주세요."
    : message;

function Logo() {
  return (
    <button className="logo" onClick={() => (location.hash = "#/")}>
      <b>경</b>
      <span>경소위키</span>
      <i>BETA</i>
    </button>
  );
}
function Button({ children, className = "", ...props }) {
  return (
    <button className={`button ${className}`} {...props}>
      {children}
    </button>
  );
}

function AuthModal({ mode, close, toast }) {
  const [form, setForm] = useState({ email: "", password: "", nickname: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!hasSupabaseConfig) return toast("먼저 Supabase를 연결해 주세요.");
    setBusy(true);
    const result =
      mode === "signup"
        ? await supabase.auth.signUp({
            email: form.email,
            password: form.password,
            options: { data: { nickname: form.nickname } },
          })
        : await supabase.auth.signInWithPassword({
            email: form.email,
            password: form.password,
          });
    setBusy(false);
    if (result.error) return toast(readableError(result.error.message));
    close();
    toast(
      mode === "signup" ? "인증 메일을 확인해 주세요." : "로그인되었습니다.",
    );
  };
  return (
    <div className="overlay" onMouseDown={close}>
      <form
        className="dialog auth"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" className="close" onClick={close}>
          ×
        </button>
        <b className="dialog-logo">경</b>
        <h2>{mode === "signup" ? "경소위키 시작하기" : "로그인"}</h2>
        <p>
          {mode === "signup"
            ? "닉네임은 언제든 프로필에서 바꿀 수 있어요."
            : "경소위키 계정으로 로그인하세요."}
        </p>
        {mode === "signup" && (
          <label>
            닉네임
            <input
              required
              minLength="2"
              maxLength="20"
              value={form.nickname}
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}
            />
          </label>
        )}
        <label>
          이메일
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          비밀번호
          <input
            required
            type="password"
            minLength="6"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <Button disabled={busy}>
          {busy ? "처리 중…" : mode === "signup" ? "회원가입" : "로그인"}
        </Button>
        <button
          type="button"
          className="text-button"
          onClick={() => close(mode === "signup" ? "login" : "signup")}
        >
          {mode === "signup"
            ? "이미 계정이 있나요? 로그인"
            : "처음이신가요? 회원가입"}
        </button>
      </form>
    </div>
  );
}

function Composer({ document, categories, close, save, toast }) {
  const [form, setForm] = useState(document || emptyDoc);
  const [busy, setBusy] = useState(false);
  const editing = Boolean(document?.id);
  const submit = async (e) => {
    e.preventDefault();
    if (
      ["student", "teacher"].includes(form.document_type) &&
      !form.subject_consent
    )
      return toast("인물 문서는 당사자의 공개 동의가 필요합니다.");
    setBusy(true);
    await save(form, editing);
    setBusy(false);
  };
  return (
    <div className="overlay" onMouseDown={close}>
      <form
        className="dialog composer"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" className="close" onClick={close}>
          ×
        </button>
        <h2>{editing ? "문서 수정" : "새 문서 작성"}</h2>
        <p>Markdown을 지원합니다. 인물 문서는 동의받은 내용만 공개하세요.</p>
        <label>
          문서 제목
          <input
            required
            maxLength="120"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <div className="two">
          <label>
            카테고리
            <select
              value={form.category_id || ""}
              onChange={(e) =>
                setForm({ ...form, category_id: e.target.value })
              }
            >
              <option value="">선택 안 함</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            문서 종류
            <select
              value={form.document_type}
              onChange={(e) =>
                setForm({ ...form, document_type: e.target.value })
              }
            >
              {Object.entries(typeNames).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          한 줄 소개
          <input
            maxLength="300"
            value={form.summary || ""}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
        </label>
        <label>
          내용
          <textarea
            required
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
        </label>
        {["student", "teacher"].includes(form.document_type) && (
          <label className="check">
            <input
              type="checkbox"
              checked={form.subject_consent}
              onChange={(e) =>
                setForm({ ...form, subject_consent: e.target.checked })
              }
            />{" "}
            당사자의 전체 공개 동의를 받았습니다.
          </label>
        )}
        {editing && (
          <label>
            수정 이유
            <input
              required
              maxLength="300"
              value={form.edit_summary || ""}
              onChange={(e) =>
                setForm({ ...form, edit_summary: e.target.value })
              }
              placeholder="예: 프로젝트 설명 추가"
            />
          </label>
        )}
        <Button disabled={busy}>
          {busy ? "저장 중…" : editing ? "수정 저장" : "문서 공개"}
        </Button>
      </form>
    </div>
  );
}

function Home({ docs, categories, openDoc, openComposer }) {
  const popular = [...docs].sort((a, b) => b.views - a.views).slice(0, 4);
  return (
    <>
      <section className="hero">
        <div>
          <small>GBSW STUDENT WIKI</small>
          <h1>
            경소마고의 모든 이야기,<em> 우리 손으로 기록해요.</em>
          </h1>
          <p>
            친구, 동아리, 프로젝트, 학교생활을 함께 남기는 우리만의 위키입니다.
          </p>
          <Button onClick={openComposer}>＋ 첫 문서 작성</Button>
        </div>
        <span className="hero-flag">⚑</span>
      </section>
      <main className="page home">
        <section>
          <div className="section-title">
            <div>
              <small>START HERE</small>
              <h2>{docs.length ? "최근 수정 문서" : "아직 문서가 없어요"}</h2>
            </div>
          </div>
          {docs.length ? (
            <DocGrid docs={docs.slice(0, 6)} open={openDoc} />
          ) : (
            <Empty open={openComposer} />
          )}
        </section>
        {docs.length > 0 && (
          <section>
            <div className="section-title">
              <div>
                <small>POPULAR</small>
                <h2>인기 문서</h2>
              </div>
            </div>
            <DocGrid docs={popular} open={openDoc} />
          </section>
        )}
        <section>
          <div className="section-title">
            <div>
              <small>CATEGORIES</small>
              <h2>카테고리</h2>
            </div>
          </div>
          <div className="categories">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => (location.hash = `#/search?category=${c.id}`)}
              >
                {c.name}
                <span>›</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
function Empty({ open }) {
  return (
    <div className="empty-state">
      <b>✦</b>
      <h3>경소위키의 첫 문서를 기다리고 있어요</h3>
      <p>경소마고에서만 알 수 있는 이야기를 가장 먼저 기록해 주세요.</p>
      <Button onClick={open}>문서 작성 시작</Button>
    </div>
  );
}
function DocGrid({ docs, open }) {
  return (
    <div className="doc-grid">
      {docs.map((d) => (
        <button className="doc-card" key={d.id} onClick={() => open(d.id)}>
          <span>{d.categories?.name || typeNames[d.document_type]}</span>
          <h3>{d.title}</h3>
          <p>{d.summary || "아직 소개가 없습니다."}</p>
          <small>
            {d.profiles?.nickname || "알 수 없음"} · {now(d.updated_at)} ·{" "}
            {d.views || 0}회
          </small>
        </button>
      ))}
    </div>
  );
}

function Search({ docs, categories, openDoc }) {
  const [q, setQ] = useState("");
  const category = new URLSearchParams(location.hash.split("?")[1]).get(
    "category",
  );
  const results = docs.filter(
    (d) =>
      (!category || d.category_id === category) &&
      `${d.title} ${d.summary || ""} ${d.content}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  return (
    <main className="page">
      <div className="page-head">
        <small>SEARCH</small>
        <h1>문서 검색</h1>
        <input
          className="search-input"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="제목 또는 내용으로 검색"
        />
      </div>
      <div className="chips">
        <button
          className={!category ? "on" : ""}
          onClick={() => (location.hash = "#/search")}
        >
          전체
        </button>
        {categories.map((c) => (
          <button
            className={category === c.id ? "on" : ""}
            onClick={() => (location.hash = `#/search?category=${c.id}`)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <DocGrid docs={results} open={openDoc} />
      {!results.length && <Empty open={() => (location.hash = "#/write")} />}
    </main>
  );
}

function DocumentPage({ id, user, profile, openEdit, toast, refresh }) {
  const [doc, setDoc] = useState(null),
    [comments, setComments] = useState([]),
    [reply, setReply] = useState(""),
    [sort, setSort] = useState("latest"),
    [revisions, setRevisions] = useState([]),
    [showHistory, setShowHistory] = useState(false);
  const load = async () => {
    if (!hasSupabaseConfig) return;
    const { data } = await supabase
      .from("documents")
      .select(
        "*, categories(*), profiles!documents_author_id_fkey(nickname,avatar_url)",
      )
      .eq("id", id)
      .single();
    setDoc(data);
    const { data: cs } = await supabase
      .from("comments")
      .select(
        "*, profiles!comments_author_id_fkey(nickname,avatar_url), comment_likes(user_id)",
      )
      .eq("document_id", id)
      .order("created_at", { ascending: sort === "latest" ? false : true });
    setComments(cs || []);
    const { data: rs } = await supabase
      .from("document_revisions")
      .select("*, profiles!document_revisions_editor_id_fkey(nickname)")
      .eq("document_id", id)
      .order("revision_number", { ascending: false });
    setRevisions(rs || []);
  };
  useEffect(() => {
    const request = window.setTimeout(load, 0);
    if (hasSupabaseConfig)
      supabase.rpc("increment_document_view", { target_id: id });
    return () => window.clearTimeout(request);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sort]);
  const post = async (parentId = null) => {
    if (!user) return toast("댓글 작성은 로그인 후 가능합니다.");
    if (!reply.trim()) return;
    const { error } = await supabase.from("comments").insert({
      document_id: id,
      author_id: user.id,
      parent_id: parentId,
      content: reply,
    });
    if (error) return toast(readableError(error.message));
    setReply("");
    load();
  };
  const like = async (cid) => {
    if (!user) return toast("로그인 후 좋아요할 수 있어요.");
    const exists = comments
      .find((c) => c.id === cid)
      ?.comment_likes?.some((l) => l.user_id === user.id);
    if (exists)
      await supabase
        .from("comment_likes")
        .delete()
        .match({ comment_id: cid, user_id: user.id });
    else
      await supabase
        .from("comment_likes")
        .insert({ comment_id: cid, user_id: user.id });
    load();
  };
  if (!doc) return <main className="page">문서를 불러오는 중…</main>;
  const roots = comments.filter((c) => !c.parent_id),
    replies = (pid) => comments.filter((c) => c.parent_id === pid);
  const owner = doc.author_id === user?.id || profile?.role === "admin";
  return (
    <main className="page document">
      <button className="back" onClick={() => history.back()}>
        ← 목록으로
      </button>
      <div className="document-head">
        <small>{doc.categories?.name || typeNames[doc.document_type]}</small>
        <h1>{doc.title}</h1>
        <p>{doc.summary}</p>
        <div>
          {doc.profiles?.nickname} · {now(doc.updated_at)} · {doc.views || 0}회
          열람 {owner && <Button onClick={() => openEdit(doc)}>수정</Button>}
          <button
            className="text-button"
            onClick={() => setShowHistory(!showHistory)}
          >
            수정 기록
          </button>
        </div>
      </div>
      {showHistory && (
        <section className="history">
          <h3>수정 기록</h3>
          {revisions.map((r) => (
            <div key={r.id}>
              <b>r{r.revision_number}</b>
              <span>
                {r.profiles?.nickname || "알 수 없음"} · {now(r.created_at)}
              </span>
              <p>{r.edit_summary || "문서 작성"}</p>
              {owner && (
                <button
                  onClick={async () => {
                    await supabase
                      .from("documents")
                      .update({
                        title: r.title,
                        content: r.content,
                        edit_summary: `r${r.revision_number} 버전으로 복구`,
                      })
                      .eq("id", id);
                    toast("이전 버전으로 복구했어요.");
                    load();
                    refresh();
                  }}
                >
                  이 버전으로 복구
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      <article className="markdown">
        <ReactMarkdown>{doc.content}</ReactMarkdown>
      </article>
      <section className="comments">
        <div className="section-title">
          <div>
            <small>COMMENTS</small>
            <h2>댓글 {comments.length}</h2>
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="latest">최신순</option>
            <option value="popular">인기순</option>
          </select>
        </div>
        <textarea
          maxLength="500"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder={
            user
              ? "댓글을 남겨 주세요 (최대 500자)"
              : "로그인 후 댓글을 작성할 수 있어요"
          }
        />
        <Button onClick={() => post()}>댓글 등록</Button>
        {roots.map((c) => (
          <div className={`comment ${c.is_hidden ? "hidden" : ""}`} key={c.id}>
            <b>{c.profiles?.nickname || "알 수 없음"}</b>
            <small>{now(c.created_at)}</small>
            <p>
              {c.is_hidden
                ? "관리자에 의해 숨김 처리된 댓글입니다."
                : c.content}
            </p>
            <button onClick={() => like(c.id)}>
              ♥ {c.comment_likes?.length || 0}
            </button>
            <button
              onClick={() => {
                setReply(`@${c.profiles?.nickname} `);
                document.querySelector(".comments textarea")?.focus();
              }}
            >
              답글
            </button>
            {replies(c.id).map((r) => (
              <div className="comment reply" key={r.id}>
                <b>{r.profiles?.nickname}</b>
                <small>{now(r.created_at)}</small>
                <p>{r.content}</p>
              </div>
            ))}
          </div>
        ))}
      </section>
    </main>
  );
}

function ProfilePage({ user, profile, docs, refresh, toast }) {
  const [form, setForm] = useState(profile || {});
  if (!user)
    return (
      <main className="page">
        <Empty open={() => (location.hash = "#/login")} />
      </main>
    );
  const save = async () => {
    const { error } = await supabase
      .from("profiles")
      .update({
        nickname: form.nickname,
        grade: form.grade || null,
        class_number: form.class_number || null,
        cohort: form.cohort || null,
        avatar_url: form.avatar_url || null,
      })
      .eq("id", user.id);
    toast(error?.message || "프로필을 저장했어요.");
    refresh();
  };
  return (
    <main className="page">
      <div className="page-head">
        <small>MY PAGE</small>
        <h1>내 프로필</h1>
      </div>
      <section className="profile-box">
        <label>
          닉네임
          <input
            value={form.nickname || ""}
            onChange={(e) => setForm({ ...form, nickname: e.target.value })}
          />
        </label>
        <label>
          프로필 이미지 URL
          <input
            value={form.avatar_url || ""}
            onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
          />
        </label>
        <div className="two">
          <label>
            기수
            <select
              value={form.cohort || ""}
              onChange={(e) => setForm({ ...form, cohort: e.target.value })}
            >
              <option value="">선택</option>
              <option value="1">1기</option>
              <option value="2">2기</option>
            </select>
          </label>
          <label>
            학년
            <select
              value={form.grade || ""}
              onChange={(e) => setForm({ ...form, grade: e.target.value })}
            >
              <option value="">선택</option>
              <option value="1">1학년</option>
              <option value="2">2학년</option>
              <option value="3">3학년</option>
            </select>
          </label>
        </div>
        <Button onClick={save}>프로필 저장</Button>
        <button
          className="text-button"
          onClick={() => supabase.auth.resetPasswordForEmail(user.email)}
        >
          비밀번호 변경 메일 보내기
        </button>
        <button
          className="danger"
          onClick={async () => {
            if (confirm("정말 탈퇴할까요?")) {
              const { data, error } = await supabase.functions.invoke(
                "admin-users",
                { body: { userId: user.id } },
              );
              if (error || data?.error)
                return toast(data?.error || error.message);
              await supabase.auth.signOut();
            }
          }}
        >
          회원 탈퇴
        </button>
      </section>
      <section>
        <div className="section-title">
          <div>
            <small>MY DOCUMENTS</small>
            <h2>내가 작성한 문서</h2>
          </div>
        </div>
        <DocGrid
          docs={docs.filter((d) => d.author_id === user.id)}
          open={(id) => (location.hash = `#/document/${id}`)}
        />
      </section>
    </main>
  );
}

function Admin({ profile, docs, categories, refresh }) {
  const [tab, setTab] = useState("dashboard"),
    [profiles, setProfiles] = useState([]),
    [comments, setComments] = useState([]);
  useEffect(() => {
    if (profile?.role !== "admin" || !hasSupabaseConfig) return;
    supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setProfiles(data || []));
    supabase
      .from("comments")
      .select("*, profiles!comments_author_id_fkey(nickname), documents(title)")
      .order("created_at", { ascending: false })
      .then(({ data }) => setComments(data || []));
  }, [profile]);
  if (profile?.role !== "admin")
    return (
      <main className="page">
        <h1>접근 권한이 없습니다.</h1>
      </main>
    );
  const suspend = async (p) => {
    await supabase
      .from("profiles")
      .update({ is_suspended: !p.is_suspended })
      .eq("id", p.id);
    setProfiles(
      profiles.map((x) =>
        x.id === p.id ? { ...x, is_suspended: !x.is_suspended } : x,
      ),
    );
  };
  return (
    <main className="page admin">
      <div className="page-head">
        <small>ADMIN</small>
        <h1>경소위키 관리센터</h1>
      </div>
      <nav className="admin-nav">
        {[
          ["dashboard", "대시보드"],
          ["members", "회원"],
          ["documents", "문서"],
          ["comments", "댓글"],
          ["categories", "카테고리"],
        ].map(([id, name]) => (
          <button className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {name}
          </button>
        ))}
      </nav>
      {tab === "dashboard" && (
        <div className="stats">
          <div>
            <small>전체 회원</small>
            <b>{profiles.length}</b>
          </div>
          <div>
            <small>전체 문서</small>
            <b>{docs.length}</b>
          </div>
          <div>
            <small>전체 댓글</small>
            <b>{comments.length}</b>
          </div>
          <div>
            <small>오늘 문서</small>
            <b>
              {
                docs.filter(
                  (d) =>
                    new Date(d.created_at).toDateString() ===
                    new Date().toDateString(),
                ).length
              }
            </b>
          </div>
        </div>
      )}
      {tab === "members" && (
        <Table
          rows={profiles}
          cols={["nickname", "role", "is_suspended"]}
          actions={(p) => (
            <>
              <button
                onClick={() =>
                  supabase
                    .from("profiles")
                    .update({ role: p.role === "admin" ? "user" : "admin" })
                    .eq("id", p.id)
                    .then(refresh)
                }
              >
                권한 변경
              </button>
              <button onClick={() => suspend(p)}>
                {p.is_suspended ? "정지 해제" : "정지"}
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`${p.nickname} 회원을 강제 탈퇴시킬까요?`))
                    return;
                  const { data, error } = await supabase.functions.invoke(
                    "admin-users",
                    { body: { userId: p.id } },
                  );
                  if (error || data?.error)
                    return alert(data?.error || error.message);
                  refresh();
                }}
              >
                강제 탈퇴
              </button>
            </>
          )}
        />
      )}{" "}
      {tab === "documents" && (
        <Table
          rows={docs}
          cols={["title", "status", "views"]}
          actions={(d) => (
            <>
              <button
                onClick={() =>
                  supabase
                    .from("documents")
                    .update({
                      status: d.status === "hidden" ? "published" : "hidden",
                    })
                    .eq("id", d.id)
                    .then(refresh)
                }
              >
                {d.status === "hidden" ? "복구" : "숨김"}
              </button>
              <button
                onClick={() =>
                  supabase
                    .from("documents")
                    .update({ is_locked: !d.is_locked })
                    .eq("id", d.id)
                    .then(refresh)
                }
              >
                {d.is_locked ? "잠금 해제" : "수정 잠금"}
              </button>
            </>
          )}
        />
      )}{" "}
      {tab === "comments" && (
        <Table
          rows={comments}
          cols={["content", "is_hidden"]}
          actions={(c) => (
            <button
              onClick={() =>
                supabase
                  .from("comments")
                  .update({ is_hidden: !c.is_hidden })
                  .eq("id", c.id)
                  .then(() =>
                    setComments(
                      comments.map((x) =>
                        x.id === c.id ? { ...x, is_hidden: !x.is_hidden } : x,
                      ),
                    ),
                  )
              }
            >
              {c.is_hidden ? "복구" : "숨김"}
            </button>
          )}
        />
      )}{" "}
      {tab === "categories" && (
        <Table rows={categories} cols={["name", "slug", "sort_order"]} />
      )}
    </main>
  );
}
function Table({ rows, cols, actions }) {
  return (
    <div className="table">
      {rows.map((row) => (
        <div key={row.id}>
          {cols.map((c) => (
            <span key={c}>{String(row[c])}</span>
          ))}
          {actions && <aside>{actions(row)}</aside>}
        </div>
      )) || <p>데이터가 없습니다.</p>}
    </div>
  );
}

function App() {
  const [route, setRoute] = useState(location.hash || "#/"),
    [session, setSession] = useState(null),
    [profile, setProfile] = useState(null),
    [docs, setDocs] = useState([]),
    [categories, setCategories] = useState([]),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState("");
  const flash = (t) => {
    setToast(t);
    setTimeout(() => setToast(""), 3000);
  };
  const load = async () => {
    if (!hasSupabaseConfig) return;
    const [{ data: ds }, { data: cs }] = await Promise.all([
      supabase
        .from("documents")
        .select(
          "*, categories(*), profiles!documents_author_id_fkey(nickname, avatar_url)",
        )
        .eq("status", "published")
        .order("updated_at", { ascending: false }),
      supabase.from("categories").select("*").order("sort_order"),
    ]);
    setDocs(ds || []);
    setCategories(cs || []);
    if (session) {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      setProfile(data);
    }
  };
  useEffect(() => {
    const f = () => setRoute(location.hash || "#/");
    addEventListener("hashchange", f);
    f();
    return () => removeEventListener("hashchange", f);
  }, []);
  useEffect(() => {
    if (!hasSupabaseConfig) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);
  const openComposer = () =>
    session
      ? setModal({ type: "compose" })
      : setModal({ type: "auth", mode: "login" });
  const save = async (form, editing) => {
    if (!session) return;
    const payload = {
      title: form.title,
      summary: form.summary,
      content: form.content,
      document_type: form.document_type,
      subject_consent: form.subject_consent,
      edit_summary: form.edit_summary || null,
      category_id: form.category_id || null,
      author_id: session.user.id,
    };
    let error;
    if (editing)
      ({ error } = await supabase
        .from("documents")
        .update(payload)
        .eq("id", form.id));
    else
      ({ error } = await supabase.from("documents").insert({
        ...payload,
        slug: `doc-${crypto.randomUUID().slice(0, 8)}`,
        status: "published",
      }));
    if (error) return flash(readableError(error.message));
    setModal(null);
    flash(editing ? "문서를 수정했어요." : "문서를 등록했어요.");
    load();
  };
  const path = route.split("?")[0];
  let page =
    path === "#/" ? (
      <Home
        docs={docs}
        categories={categories}
        openDoc={(id) => (location.hash = `#/document/${id}`)}
        openComposer={openComposer}
      />
    ) : path === "#/search" ? (
      <Search
        docs={docs}
        categories={categories}
        openDoc={(id) => (location.hash = `#/document/${id}`)}
      />
    ) : path.startsWith("#/document/") ? (
      <DocumentPage
        id={path.split("/").pop()}
        user={session?.user}
        profile={profile}
        docs={docs}
        categories={categories}
        openEdit={(doc) => setModal({ type: "compose", doc })}
        toast={flash}
        refresh={load}
      />
    ) : path === "#/me" ? (
      <ProfilePage
        user={session?.user}
        profile={profile}
        docs={docs}
        refresh={load}
        toast={flash}
      />
    ) : path === "#/admin" ? (
      <Admin
        profile={profile}
        docs={docs}
        categories={categories}
        refresh={load}
        toast={flash}
      />
    ) : (
      <Home
        docs={docs}
        categories={categories}
        openDoc={(id) => (location.hash = `#/document/${id}`)}
        openComposer={openComposer}
      />
    );
  return (
    <>
      <header>
        <Logo />
        <nav>
          <button onClick={() => (location.hash = "#/search")}>
            문서 검색
          </button>
          <button
            onClick={() => {
              const d = docs[Math.floor(Math.random() * docs.length)];
              d
                ? (location.hash = `#/document/${d.id}`)
                : flash("아직 문서가 없어요.");
            }}
          >
            랜덤 문서
          </button>
          {profile?.role === "admin" && (
            <button onClick={() => (location.hash = "#/admin")}>
              관리센터
            </button>
          )}
        </nav>
        <div>
          <Button onClick={openComposer}>＋ 문서 작성</Button>
          {session ? (
            <button
              className="avatar-button"
              onClick={() => (location.hash = "#/me")}
            >
              {profile?.nickname?.[0] || "나"}
            </button>
          ) : (
            <Button
              className="outline"
              onClick={() => setModal({ type: "auth", mode: "login" })}
            >
              로그인
            </Button>
          )}
        </div>
      </header>
      {page}
      {modal?.type === "auth" && (
        <AuthModal
          mode={modal.mode}
          close={(next) => setModal(next ? { type: "auth", mode: next } : null)}
          toast={flash}
        />
      )}{" "}
      {modal?.type === "compose" && (
        <Composer
          document={modal.doc}
          categories={categories}
          close={() => setModal(null)}
          save={save}
          toast={flash}
        />
      )}{" "}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
export default App;
