import { useState } from "react";
import { active, date, rpc } from "./api";
import { Button } from "./components";

export default function Comments({ ctx, doc }) {
  const [body, setBody] = useState(""),
    [parent, setParent] = useState(null),
    [edit, setEdit] = useState(null),
    [sort, setSort] = useState("latest");
  const comments = ctx.comments.filter((c) => c.document_id === doc.id);
  const likes = (id) => ctx.likes.filter((l) => l.comment_id === id);
  const sorted = [...comments.filter((c) => !c.parent_id)].sort(
    (a, b) =>
      Number(b.is_pinned) - Number(a.is_pinned) ||
      (sort === "popular" ? likes(b.id).length - likes(a.id).length : 0) ||
      b.created_at.localeCompare(a.created_at),
  );
  const submit = (e) => {
    e.preventDefault();
    ctx.run(
      async () => {
        await rpc("write_comment", {
          target_document: doc.id,
          body,
          parent,
          comment_id: edit,
        });
        setBody("");
        setParent(null);
        setEdit(null);
        await ctx.reload();
      },
      edit ? "댓글을 수정했습니다." : "댓글을 등록했습니다.",
    );
  };
  const render = (c) => (
    <div className={"comment " + (c.parent_id ? "reply" : "")} key={c.id}>
      <b>
        {ctx.name(c.author_id)} {c.is_pinned ? "📌" : ""}
      </b>
      <small>{date(c.created_at)}</small>
      <p>
        {c.is_deleted
          ? "삭제된 댓글입니다."
          : c.is_hidden
            ? "숨겨진 댓글입니다."
            : c.content}
      </p>
      {!c.is_deleted && !c.is_hidden && (
        <div className="actions">
          <button
            disabled={!active(ctx.profile) || ctx.busy}
            aria-pressed={likes(c.id).some((l) => l.user_id === ctx.user?.id)}
            onClick={() =>
              ctx.run(async () => {
                await rpc("toggle_like", { target_id: c.id });
                await ctx.reload();
              })
            }
          >
            ♥ {likes(c.id).length}
          </button>
          {!c.parent_id && !doc.comments_locked && active(ctx.profile) && (
            <button
              onClick={() => {
                setParent(c.id);
                setEdit(null);
                setBody("");
              }}
            >
              답글
            </button>
          )}
          {c.author_id === ctx.user?.id && !doc.comments_locked && (
            <button
              onClick={() => {
                setEdit(c.id);
                setParent(null);
                setBody(c.content);
              }}
            >
              수정
            </button>
          )}
          {(c.author_id === ctx.user?.id || ctx.admin) && (
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
          )}
          {(ctx.admin ||
            (doc.subject_verified &&
              doc.subject_id === ctx.user?.id &&
              c.author_id === ctx.user.id)) && (
            <button
              onClick={() =>
                ctx.run(async () => {
                  await rpc("pin_comment", {
                    target_id: c.id,
                    pinned: !c.is_pinned,
                  });
                  await ctx.reload();
                })
              }
            >
              {c.is_pinned ? "고정 해제" : "고정"}
            </button>
          )}
        </div>
      )}
      {ctx.admin && (
        <button
          onClick={() =>
            ctx.adminAction("comment", c.id, { is_hidden: !c.is_hidden })
          }
        >
          {c.is_hidden ? "숨김 해제" : "숨김"}
        </button>
      )}
    </div>
  );
  return (
    <section className="comments">
      <div className="section-title">
        <h2>댓글 {comments.length}</h2>
        <label>
          정렬
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="latest">최신순</option>
            <option value="popular">인기순</option>
          </select>
        </label>
      </div>
      {doc.comments_locked ? (
        <p>관리자가 댓글 작성을 잠갔습니다.</p>
      ) : active(ctx.profile) ? (
        <form onSubmit={submit}>
          {(parent || edit) && (
            <p>
              {edit
                ? "댓글 수정 중"
                : ctx.name(comments.find((c) => c.id === parent)?.author_id) +
                  "님에게 답글"}{" "}
              <button
                type="button"
                onClick={() => {
                  setParent(null);
                  setEdit(null);
                  setBody("");
                }}
              >
                취소
              </button>
            </p>
          )}
          <label>
            댓글
            <textarea
              required
              maxLength={500}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <small>{body.length}/500</small>
          <Button disabled={ctx.busy}>
            {edit ? "수정 저장" : parent ? "답글 등록" : "댓글 등록"}
          </Button>
        </form>
      ) : (
        <p>로그인한 정상 회원만 댓글을 작성할 수 있습니다.</p>
      )}
      {sorted.map((c) => (
        <div key={c.id}>
          {render(c)}
          {comments
            .filter((r) => r.parent_id === c.id)
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map(render)}
        </div>
      ))}
    </section>
  );
}
