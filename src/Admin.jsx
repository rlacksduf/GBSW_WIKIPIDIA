import { useState } from "react";
import { date, deleteAccount, rpc } from "./api";
import { Button, Modal } from "./components";

export default function Admin({ ctx }) {
  const [tab, setTab] = useState("dashboard"),
    [query, setQuery] = useState(""),
    [member, setMember] = useState(null),
    [category, setCategory] = useState(null),
    [subject, setSubject] = useState(null),
    [subjectId, setSubjectId] = useState("");
  if (!ctx.admin)
    return (
      <main className="page">
        <h1>경소위키 관리센터</h1>
        <p>관리자 계정으로 로그인해 주세요.</p>
      </main>
    );
  const match = (...values) =>
    values.join(" ").toLowerCase().includes(query.toLowerCase());
  const act = (kind, id, data) => ctx.adminAction(kind, id, data);
  const today = (value) =>
    new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) ===
    new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  return (
    <main className="page admin">
      <h1>경소위키 관리센터</h1>
      <nav className="admin-nav">
        {[
          ["dashboard", "대시보드"],
          ["members", "회원 관리"],
          ["documents", "문서 관리"],
          ["comments", "댓글 관리"],
          ["categories", "카테고리"],
          ["requests", "삭제 요청"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "on" : ""}
            onClick={() => {
              setTab(key);
              setQuery("");
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab !== "dashboard" && (
        <label>
          검색
          <input
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목·닉네임·내용·분류 검색"
          />
        </label>
      )}
      {tab === "dashboard" && (
        <>
          <div className="stats">
            {[
              ["전체 회원", ctx.members.length],
              ["전체 문서", ctx.documents.length],
              ["전체 댓글", ctx.comments.length],
              [
                "오늘 생성된 문서",
                ctx.documents.filter((d) => today(d.created_at)).length,
              ],
              [
                "오늘 가입한 회원",
                ctx.members.filter((p) => today(p.created_at)).length,
              ],
            ].map(([label, count]) => (
              <div key={label}>
                <small>{label}</small>
                <b>{count}</b>
              </div>
            ))}
          </div>
          <h2>최근 활동</h2>
          {ctx.activity.slice(0, 50).map((a) => (
            <p key={a.id}>
              {ctx.name(a.actor_id)} · {a.action} · {date(a.created_at)}
            </p>
          ))}
        </>
      )}
      {tab === "members" && (
        <div className="table">
          {ctx.members
            .filter((p) => match(p.nickname, p.id, p.grade, p.class_number))
            .map((p) => (
              <div key={p.id}>
                <span>
                  <button onClick={() => setMember(p.id)}>{p.nickname}</button>
                  <small>
                    {p.role} · {p.is_suspended ? "정지" : "정상"} · {p.id}
                  </small>
                </span>
                <aside>
                  <button
                    disabled={ctx.busy || p.id === ctx.user.id}
                    onClick={() => {
                      if (confirm("회원 권한을 변경할까요?"))
                        act("member", p.id, {
                          role: p.role === "admin" ? "user" : "admin",
                        });
                    }}
                  >
                    권한 변경
                  </button>
                  <button
                    disabled={ctx.busy || p.id === ctx.user.id}
                    onClick={() =>
                      act("member", p.id, {
                        is_suspended: !p.is_suspended,
                        suspended_until: null,
                      })
                    }
                  >
                    {p.is_suspended ? "정지 해제" : "정지"}
                  </button>
                  <button
                    onClick={() => {
                      const days = prompt("정지 일수 (1~365)", "7");
                      if (
                        days &&
                        Number.isInteger(+days) &&
                        +days > 0 &&
                        +days <= 365
                      )
                        act("member", p.id, {
                          is_suspended: true,
                          suspended_until: new Date(
                            Date.now() + Number(days) * 86400000,
                          ).toISOString(),
                        });
                    }}
                  >
                    기간 정지
                  </button>
                  <button
                    disabled={ctx.busy || p.id === ctx.user.id}
                    onClick={() => {
                      if (confirm(p.nickname + " 회원을 강제 탈퇴시킬까요?"))
                        ctx.run(async () => {
                          await deleteAccount(p.id);
                          await ctx.reload();
                        }, "탈퇴 처리했습니다.");
                    }}
                  >
                    강제 탈퇴
                  </button>
                  <button
                    disabled={ctx.busy}
                    onClick={() => {
                      if (confirm("이 회원의 모든 댓글을 숨길까요?"))
                        act("hide_member_comments", p.id, {});
                    }}
                  >
                    댓글 일괄 숨김
                  </button>
                </aside>
              </div>
            ))}
        </div>
      )}
      {tab === "documents" && (
        <div className="table">
          {ctx.documents
            .filter((d) =>
              match(
                d.title,
                ctx.name(d.author_id),
                ctx.categories.find((c) => c.id === d.category_id)?.name,
              ),
            )
            .map((d) => (
              <div key={d.id}>
                <span>
                  <button onClick={() => ctx.go("/document/" + d.id)}>
                    {d.title}
                  </button>
                  <small>
                    {ctx.name(d.author_id)} · {d.status} · r{d.revision}
                  </small>
                </span>
                <aside>
                  <button onClick={() => ctx.write(d)}>수정</button>
                  <button
                    disabled={ctx.busy}
                    onClick={() =>
                      act("document", d.id, {
                        status: d.status === "hidden" ? "published" : "hidden",
                      })
                    }
                  >
                    {d.status === "hidden" ? "복구" : "숨김"}
                  </button>
                  <button
                    onClick={() =>
                      act("document", d.id, { is_locked: !d.is_locked })
                    }
                  >
                    {d.is_locked ? "수정 잠금 해제" : "수정 잠금"}
                  </button>
                  <button
                    onClick={() =>
                      act("document", d.id, {
                        comments_locked: !d.comments_locked,
                      })
                    }
                  >
                    {d.comments_locked ? "댓글 잠금 해제" : "댓글 잠금"}
                  </button>
                  <button
                    onClick={() =>
                      act("document", d.id, { is_featured: !d.is_featured })
                    }
                  >
                    {d.is_featured ? "고정 해제" : "상단 고정"}
                  </button>
                  {["student", "teacher"].includes(d.document_type) && (
                    <button
                      onClick={() => {
                        setSubject(d);
                        setSubjectId(d.subject_id || "");
                      }}
                    >
                      당사자 확인
                    </button>
                  )}
                  <button disabled={ctx.busy} onClick={() => ctx.deleteDoc(d)}>
                    완전 삭제
                  </button>
                </aside>
              </div>
            ))}
        </div>
      )}
      {tab === "comments" && (
        <div className="table">
          {ctx.comments
            .filter((c) => match(c.content, ctx.name(c.author_id)))
            .map((c) => (
              <div key={c.id}>
                <span>
                  <b>{ctx.name(c.author_id)}</b>
                  <p>{c.content}</p>
                  <small>{date(c.created_at)}</small>
                </span>
                <aside>
                  <button onClick={() => ctx.go("/document/" + c.document_id)}>
                    문서
                  </button>
                  <button
                    onClick={() =>
                      act("comment", c.id, { is_hidden: !c.is_hidden })
                    }
                  >
                    {c.is_hidden ? "숨김 해제" : "숨김"}
                  </button>
                  <button
                    disabled={ctx.busy}
                    onClick={() => {
                      if (confirm("댓글을 삭제할까요?"))
                        ctx.run(async () => {
                          await rpc("delete_comment", { target_id: c.id });
                          await ctx.reload();
                        }, "댓글을 삭제했습니다.");
                    }}
                  >
                    삭제
                  </button>
                </aside>
              </div>
            ))}
        </div>
      )}
      {tab === "categories" && (
        <>
          <Button
            onClick={() =>
              setCategory({
                name: "",
                slug: "category-" + crypto.randomUUID().slice(0, 8),
                sort_order: ctx.categories.length * 10 + 10,
              })
            }
          >
            카테고리 추가
          </Button>
          <div className="table">
            {ctx.categories
              .filter((c) => match(c.name, c.slug))
              .map((c) => (
                <div key={c.id}>
                  <span>
                    {c.name} · 순서 {c.sort_order}
                  </span>
                  <aside>
                    <button onClick={() => setCategory(c)}>
                      이름·순서 수정
                    </button>
                    <button
                      disabled={ctx.busy}
                      onClick={() => {
                        if (
                          confirm(
                            "카테고리를 삭제할까요? 기존 문서는 유지됩니다.",
                          )
                        )
                          act("delete_category", c.id, {});
                      }}
                    >
                      삭제
                    </button>
                  </aside>
                </div>
              ))}
          </div>
        </>
      )}
      {tab === "requests" &&
        ctx.requests
          .filter((r) => match(r.reason, ctx.name(r.requester_id)))
          .map((r) => (
            <div className="comment" key={r.id}>
              <p>
                {ctx.documents.find((d) => d.id === r.document_id)?.title} ·{" "}
                {ctx.name(r.requester_id)} · {r.resolved ? "완료" : "대기"}
              </p>
              <p>{r.reason}</p>
              <button onClick={() => ctx.go("/document/" + r.document_id)}>
                문서 확인
              </button>
              {!r.resolved && (
                <button onClick={() => act("resolve_request", r.id, {})}>
                  처리 완료
                </button>
              )}
            </div>
          ))}
      {member && (
        <Modal title="회원 정보 및 활동" close={() => setMember(null)}>
          {ctx.members
            .filter((p) => p.id === member)
            .map((p) => (
              <section key={p.id}>
                <h3>{p.nickname}</h3>
                <p>
                  {p.cohort || "-"}기 · {p.grade || "-"}학년{" "}
                  {p.class_number || "-"}반
                </p>
                <p>
                  가입: {date(p.created_at)} / 정지 만료:{" "}
                  {date(p.suspended_until) || "없음"}
                </p>
                <h3>작성 문서</h3>
                {ctx.documents
                  .filter((d) => d.author_id === p.id)
                  .map((d) => (
                    <p key={d.id}>
                      <button
                        onClick={() => {
                          setMember(null);
                          ctx.go("/document/" + d.id);
                        }}
                      >
                        {d.title}
                      </button>
                    </p>
                  ))}
                <h3>작성 댓글</h3>
                {ctx.comments
                  .filter((c) => c.author_id === p.id)
                  .map((c) => (
                    <p key={c.id}>{c.content}</p>
                  ))}
              </section>
            ))}
        </Modal>
      )}
      {category && (
        <Modal title="카테고리 편집" close={() => setCategory(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ctx.run(async () => {
                await rpc("admin_action", {
                  kind: "category",
                  target_id: category.id || null,
                  data: category,
                });
                await ctx.reload();
                setCategory(null);
              }, "카테고리를 저장했습니다.");
            }}
          >
            <label>
              이름
              <input
                required
                maxLength={40}
                value={category.name}
                onChange={(e) =>
                  setCategory({ ...category, name: e.target.value })
                }
              />
            </label>
            <label>
              식별자
              <input
                required
                pattern="[a-z0-9-]+"
                value={category.slug}
                onChange={(e) =>
                  setCategory({ ...category, slug: e.target.value })
                }
              />
            </label>
            <label>
              순서 (작은 숫자 먼저)
              <input
                required
                type="number"
                value={category.sort_order}
                onChange={(e) =>
                  setCategory({
                    ...category,
                    sort_order: Number(e.target.value),
                  })
                }
              />
            </label>
            <Button disabled={ctx.busy}>저장</Button>
          </form>
        </Modal>
      )}
      {subject && (
        <Modal title="인물 문서 당사자 확인" close={() => setSubject(null)}>
          <p>
            문서의 실제 당사자 계정인지 확인한 후 지정하세요. 지정 후 당사자가
            마이페이지에서 공개에 동의해야 합니다.
          </p>
          <label>
            당사자
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              <option value="">지정 해제</option>
              {ctx.members.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname} ({p.id})
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={ctx.busy}
            onClick={() =>
              ctx.run(async () => {
                await rpc("admin_action", {
                  kind: "verify_subject",
                  target_id: subject.id,
                  data: { subject_id: subjectId },
                });
                await ctx.reload();
                setSubject(null);
              }, "당사자를 지정했습니다. 기존 동의는 초기화됩니다.")
            }
          >
            확인 및 지정
          </Button>
        </Modal>
      )}
    </main>
  );
}
