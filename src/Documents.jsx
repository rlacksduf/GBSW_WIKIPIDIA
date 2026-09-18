import { useState } from "react";
import { active, canEdit, date, isPerson, isPublic, rpc, types } from "./api";
import {
  Button,
  Cards,
  Image,
  ImageField,
  Markdown,
  Modal,
} from "./components";
import Comments from "./Comments";

export function Home({ ctx }) {
  const docs = ctx.documents.filter(isPublic);
  return (
    <>
      <section className="hero">
        <div>
          <small>GBSW STUDENT WIKI</small>
          <h1>
            경소마고의 모든 이야기,<em> 우리 손으로 기록해요.</em>
          </h1>
          <p>
            함께 기록하는 학교의 오늘. 현재 {docs.length}개의 공개 문서가
            있어요.
          </p>
          <Button onClick={() => ctx.write()}>＋ 문서 작성</Button>
        </div>
        <span className="hero-flag">⚑</span>
      </section>
      <main className="page home">
        {docs.some((d) => d.is_featured) && (
          <section>
            <h2>중요 문서</h2>
            <Cards documents={docs.filter((d) => d.is_featured)} ctx={ctx} />
          </section>
        )}
        <section>
          <h2>최근 수정 문서</h2>
          <Cards
            documents={[...docs]
              .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
              .slice(0, 6)}
            ctx={ctx}
          />
        </section>
        <section>
          <h2>인기 문서</h2>
          <Cards
            documents={[...docs].sort((a, b) => b.views - a.views).slice(0, 6)}
            ctx={ctx}
          />
        </section>
        <section>
          <h2>새로운 문서</h2>
          <Cards
            documents={[...docs]
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .slice(0, 6)}
            ctx={ctx}
          />
        </section>
        <section>
          <h2>카테고리</h2>
          <div className="categories">
            {ctx.categories.map((c) => (
              <button
                key={c.id}
                onClick={() => ctx.go("/search?category=" + c.id)}
              >
                {c.name} ›
              </button>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
export function Search({ ctx }) {
  const [query, setQuery] = useState("");
  const category = new URLSearchParams(ctx.path.split("?")[1]).get("category");
  const docs = ctx.documents
    .filter(isPublic)
    .filter(
      (d) =>
        (!category || d.category_id === category) &&
        (
          d.title +
          " " +
          d.summary +
          " " +
          d.content +
          " " +
          ctx.tagsFor(d.id).join(" ")
        )
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  return (
    <main className="page">
      <h1>문서 검색</h1>
      <label>
        제목·본문·태그
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="chips">
        <button onClick={() => ctx.go("/search")}>전체</button>
        {ctx.categories.map((c) => (
          <button
            key={c.id}
            className={category === c.id ? "on" : ""}
            onClick={() => ctx.go("/search?category=" + c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <Cards documents={docs} ctx={ctx} />
    </main>
  );
}
export function Editor({ ctx, document, close }) {
  const [form, setForm] = useState(
    document
      ? {
          ...document,
          tags: ctx.tagsFor(document.id).join(", "),
          related_ids: ctx.links
            .filter((l) => l.document_id === document.id)
            .map((l) => l.related_id),
          edit_summary: "",
        }
      : {
          title: "",
          summary: "",
          content: "",
          category_id: "",
          document_type: "other",
          thumbnail_url: "",
          tags: "",
          related_ids: [],
          edit_summary: "",
        },
  );
  const [preview, setPreview] = useState(false);
  const change = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  return (
    <Modal title={document ? "문서 수정" : "새 문서 작성"} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ctx.run(async () => {
            const id = await rpc("save_document", {
              data: {
                ...form,
                tags: form.tags
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
              target_id: document?.id || null,
              expected_revision: document?.revision ?? null,
            });
            await ctx.reload();
            close();
            ctx.go("/document/" + id);
          }, "문서를 저장했습니다.");
        }}
      >
        <label>
          제목
          <input
            required
            maxLength={120}
            value={form.title}
            onChange={(e) => change("title", e.target.value)}
          />
        </label>
        <div className="two">
          <label>
            카테고리
            <select
              value={form.category_id || ""}
              onChange={(e) => {
                change("category_id", e.target.value);
                const slug = ctx.categories.find(
                  (c) => c.id === e.target.value,
                )?.slug;
                if (types[slug]) change("document_type", slug);
              }}
            >
              <option value="">선택 안 함</option>
              {ctx.categories.map((c) => (
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
              onChange={(e) => change("document_type", e.target.value)}
            >
              {Object.entries(types).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {isPerson(form) && (
          <p className="notice">
            인물 문서는 관리자가 당사자 계정을 확인하고, 그 당사자가 공개에
            동의한 후 공개됩니다.
          </p>
        )}
        <label>
          소개
          <input
            maxLength={300}
            value={form.summary || ""}
            onChange={(e) => change("summary", e.target.value)}
          />
        </label>
        <ImageField
          label="대표 이미지"
          value={form.thumbnail_url}
          onChange={(value) => change("thumbnail_url", value)}
          user={ctx.user}
          run={ctx.run}
        />
        <label>
          태그 (쉼표로 구분, 최대 20개)
          <input
            value={form.tags}
            onChange={(e) => change("tags", e.target.value)}
          />
        </label>
        <label>
          관련 문서
          <select
            multiple
            value={form.related_ids}
            onChange={(e) =>
              change(
                "related_ids",
                Array.from(e.target.selectedOptions, (o) => o.value),
              )
            }
          >
            {ctx.documents
              .filter((d) => d.id !== document?.id && isPublic(d))
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
          </select>
        </label>
        <label>
          본문 (Markdown)
          <textarea
            required
            rows={12}
            value={form.content}
            onChange={(e) => change("content", e.target.value)}
          />
        </label>
        <button type="button" onClick={() => setPreview(!preview)}>
          미리보기 {preview ? "닫기" : "열기"}
        </button>
        {preview && <Markdown content={form.content} />}
        {document && (
          <label>
            수정 이유
            <input
              required
              maxLength={300}
              value={form.edit_summary}
              onChange={(e) => change("edit_summary", e.target.value)}
            />
          </label>
        )}
        <Button disabled={ctx.busy}>저장</Button>
      </form>
    </Modal>
  );
}
function History({ ctx, doc, revisions, close }) {
  const [selected, setSelected] = useState(revisions[0]?.id || "");
  const revision = revisions.find((r) => r.id === selected);
  return (
    <Modal title="수정 기록 · 비교" close={close}>
      <label>
        이전 버전
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {revisions.map((r) => (
            <option key={r.id} value={r.id}>
              r{r.revision_number} · {ctx.name(r.editor_id)} ·{" "}
              {date(r.created_at)} · {r.edit_summary || "문서 작성"}{" "}
              {r.is_hidden ? "(숨김)" : ""}
            </option>
          ))}
        </select>
      </label>
      {revision && (
        <>
          <div className="two compare">
            <section>
              <h3>선택한 버전: {revision.title}</h3>
              <pre>{revision.content}</pre>
            </section>
            <section>
              <h3>현재: {doc.title}</h3>
              <pre>{doc.content}</pre>
            </section>
          </div>
          {canEdit(doc, ctx.profile) && (
            <Button
              disabled={ctx.busy}
              onClick={() => {
                if (
                  window.confirm(
                    "이 버전으로 복구할까요? 현재 내용도 기록에 남습니다.",
                  )
                )
                  ctx.run(async () => {
                    await rpc("restore_revision", {
                      revision_id: revision.id,
                      expected_revision: doc.revision,
                    });
                    await ctx.reload();
                    close();
                  }, "버전을 복구했습니다.");
              }}
            >
              선택한 버전으로 복구
            </Button>
          )}
          {ctx.admin && (
            <button
              disabled={ctx.busy}
              onClick={() =>
                ctx.adminAction("revision", revision.id, {
                  is_hidden: !revision.is_hidden,
                })
              }
            >
              {revision.is_hidden ? "기록 숨김 해제" : "부적절한 기록 숨김"}
            </button>
          )}
        </>
      )}
    </Modal>
  );
}
export function Document({ ctx, id }) {
  const [history, setHistory] = useState(false),
    [request, setRequest] = useState(false),
    [reason, setReason] = useState("");
  const doc = ctx.documents.find((d) => d.id === id);
  if (!doc)
    return (
      <main className="page">
        <h1>문서를 찾을 수 없습니다.</h1>
        <p>삭제되었거나 비공개 문서일 수 있습니다.</p>
      </main>
    );
  const revisions = ctx.revisions
    .filter((r) => r.document_id === id)
    .sort((a, b) => b.revision_number - a.revision_number);
  const last = revisions[0];
  return (
    <main className="page document">
      <button className="back" onClick={() => ctx.go("/")}>
        ← 홈
      </button>
      <div className="document-head">
        <small>
          {types[doc.document_type]} {doc.is_locked ? "· 수정 잠금" : ""}
        </small>
        <h1>{doc.title}</h1>
        <p>{doc.summary}</p>
        <p>
          작성: {ctx.name(doc.author_id)} · 최근 수정:{" "}
          {ctx.name(last?.editor_id || doc.author_id)} · {date(doc.updated_at)}{" "}
          · {doc.views}회 열람
        </p>
        <div className="actions">
          {canEdit(doc, ctx.profile) && (
            <Button onClick={() => ctx.write(doc)}>수정</Button>
          )}
          <button onClick={() => setHistory(true)}>수정 기록</button>
          {active(ctx.profile) && (
            <button onClick={() => setRequest(true)}>삭제 요청</button>
          )}
          {ctx.admin && (
            <button onClick={() => ctx.deleteDoc(doc)}>완전 삭제</button>
          )}
        </div>
      </div>
      {!isPublic(doc) && (
        <p className="notice">
          현재 비공개입니다.{" "}
          {isPerson(doc)
            ? "당사자 확인 및 공개 동의를 기다리거나 관리자가 숨긴 문서입니다."
            : "관리자가 숨긴 문서입니다."}
        </p>
      )}
      {doc.subject_id === ctx.user?.id && doc.subject_verified && (
        <Button
          disabled={ctx.busy}
          onClick={() =>
            ctx.run(async () => {
              await rpc("set_person_consent", {
                target_id: id,
                allowed: !doc.subject_consent,
              });
              await ctx.reload();
            }, "공개 동의를 변경했습니다.")
          }
        >
          {doc.subject_consent
            ? "공개 동의 철회"
            : "당사자로서 전체 공개에 동의"}
        </Button>
      )}
      <Image
        value={doc.thumbnail_url}
        alt={doc.title}
        className="document-image"
      />
      <div className="chips">
        {ctx.tagsFor(id).map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </div>
      <Markdown content={doc.content} />
      <h2>관련 문서</h2>
      <Cards
        documents={ctx.links
          .filter((l) => l.document_id === id)
          .map((l) => ctx.documents.find((d) => d.id === l.related_id))
          .filter(Boolean)}
        ctx={ctx}
      />
      <Comments ctx={ctx} doc={doc} />
      {history && (
        <History
          ctx={ctx}
          doc={doc}
          revisions={revisions}
          close={() => setHistory(false)}
        />
      )}
      {request && (
        <Modal title="문서 삭제 요청" close={() => setRequest(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ctx.run(async () => {
                await rpc("request_deletion", { target_id: id, reason });
                await ctx.reload();
                setRequest(false);
              }, "관리자에게 삭제 요청을 보냈습니다.");
            }}
          >
            <label>
              이유
              <textarea
                required
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <Button disabled={ctx.busy}>요청</Button>
          </form>
        </Modal>
      )}
    </main>
  );
}
