import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, hasSupabaseConfig } from "./supabase";
import { active, errorText, isPublic, result, rows, rpc } from "./api";
import { Auth, Password, Profile } from "./Account";
import { Document, Editor, Home, Search } from "./Documents";
import Admin from "./Admin";
import { Button, ErrorBox } from "./components";
import "./wiki.css";
import "./fixes.css";
import { FeedbackContext } from "./feedback";

const empty = {
  documents: [],
  categories: [],
  tags: [],
  documentTags: [],
  links: [],
  comments: [],
  likes: [],
  revisions: [],
  requests: [],
  activity: [],
  members: [],
  labels: [],
  profile: null,
};
function initialPath() {
  return location.hash.startsWith("#/")
    ? location.hash.slice(1)
    : location.pathname + location.search;
}
export default function WikiApp() {
  const [path, setPath] = useState(initialPath),
    [session, setSession] = useState(null),
    [authReady, setAuthReady] = useState(!hasSupabaseConfig);
  const [data, setData] = useState(empty),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState(null);
  const sequence = useRef(0),
    mutation = useRef(false),
    sessionRef = useRef(null),
    seen = useRef(new Set());
  const go = useCallback((next) => {
    history.pushState({}, "", next);
    setPath(next);
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    if (location.hash.startsWith("#/"))
      history.replaceState({}, "", location.hash.slice(1));
    const onPop = () => setPath(initialPath());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let live = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, value) => {
      sessionRef.current = value;
      setSession(value);
      setAuthReady(true);
      setData(empty);
      if (event === "PASSWORD_RECOVERY") go("/reset-password");
    });
    supabase.auth.getSession().then(({ data, error: failure }) => {
      if (live) {
        if (failure) setError(errorText(failure));
        sessionRef.current = data.session;
        setSession(data.session);
        setAuthReady(true);
      }
    });
    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, [go]);
  const reload = useCallback(async () => {
    const version = ++sequence.current;
    if (!supabase) {
      setData(empty);
      setLoading(false);
      return;
    }
    const current = sessionRef.current;
    const profile = current
      ? await result(
          supabase
            .from("profiles")
            .select("*")
            .eq("id", current.user.id)
            .maybeSingle(),
        )
      : null;
    const admin = profile?.role === "admin" && active(profile);
    const [
      documents,
      categories,
      tags,
      documentTags,
      links,
      comments,
      likes,
      revisions,
      requests,
      activity,
      members,
      labels,
    ] = await Promise.all([
      rows("documents", (q) => q.order("id")),
      rows("categories", (q) => q.order("sort_order").order("id")),
      rows("tags", (q) => q.order("id")),
      rows("document_tags", (q) => q.order("document_id").order("tag_id")),
      rows("document_links", (q) => q.order("document_id").order("related_id")),
      rows("comments", (q) => q.order("id")),
      rows("comment_likes", (q) => q.order("comment_id").order("user_id")),
      rows("document_revisions", (q) => q.order("id")),
      current
        ? rows("deletion_requests", (q) =>
            q.order("created_at", { ascending: false }).order("id"),
          )
        : [],
      admin
        ? rows("activity_log", (q) =>
            q.order("created_at", { ascending: false }).order("id"),
          )
        : [],
      admin ? rows("profiles", (q) => q.order("id")) : [],
      rpc("author_labels"),
    ]);
    if (
      version === sequence.current &&
      current?.user?.id === sessionRef.current?.user?.id
    ) {
      setData({
        documents,
        categories,
        tags,
        documentTags,
        links,
        comments,
        likes,
        revisions,
        requests,
        activity,
        members,
        labels,
        profile,
      });
    }
  }, []);
  useEffect(() => {
    if (!authReady) return;
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      reload()
        .catch((e) => {
          if (live) setError(errorText(e));
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 0);
    return () => {
      live = false;
      clearTimeout(timer);
      sequence.current++;
    };
  }, [authReady, session, reload]);
  const run = useCallback(async (job, message = "") => {
    if (mutation.current) return false;
    mutation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await job();
      if (message) setNotice(message);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }, []);
  const publicDocs = data.documents.filter(isPublic);
  const documentId = path.startsWith("/document/")
    ? path.split("?")[0].split("/")[2]
    : null;
  useEffect(() => {
    if (
      !documentId ||
      !data.documents.some((d) => d.id === documentId) ||
      seen.current.has(documentId) ||
      !supabase
    )
      return;
    seen.current.add(documentId);
    rpc("increment_document_view", { target_id: documentId })
      .then(() => {
        setData((old) => ({
          ...old,
          documents: old.documents.map((d) =>
            d.id === documentId ? { ...d, views: d.views + 1 } : d,
          ),
        }));
      })
      .catch(() => seen.current.delete(documentId));
  }, [documentId, data.documents]);
  const ctx = {
    ...data,
    path,
    go,
    run,
    reload,
    busy,
    user: session?.user,
    admin: data.profile?.role === "admin" && active(data.profile),
    name: (id) =>
      data.labels.find((p) => p.id === id)?.nickname ||
      data.members.find((p) => p.id === id)?.nickname ||
      (id ? "회원" : "탈퇴 회원"),
    tagsFor: (id) =>
      data.documentTags
        .filter((t) => t.document_id === id)
        .map((t) => data.tags.find((tag) => tag.id === t.tag_id)?.name)
        .filter(Boolean),
    login: () => setModal({ kind: "auth" }),
    write: (doc) => {
      if (!session) return setModal({ kind: "auth" });
      if (!active(data.profile)) {
        setError("회원 정보 또는 정지 상태를 확인해 주세요.");
        return;
      }
      setModal({ kind: "editor", doc });
    },
    adminAction: (kind, id, payload) =>
      run(async () => {
        await rpc("admin_action", { kind, target_id: id, data: payload });
        await reload();
      }, "변경했습니다."),
    deleteDoc: (doc) => {
      if (
        confirm(
          "“" +
            doc.title +
            "” 문서와 댓글·수정 기록을 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다.",
        )
      )
        run(async () => {
          await rpc("admin_action", {
            kind: "delete_document",
            target_id: doc.id,
          });
          await reload();
          go("/admin");
        }, "문서를 삭제했습니다.");
    },
  };
  const route = path.split("?")[0];
  const content =
    route === "/" ? (
      <Home ctx={ctx} />
    ) : route === "/search" ? (
      <Search ctx={ctx} />
    ) : route === "/admin" ? (
      <Admin ctx={ctx} />
    ) : route === "/me" ? (
      <Profile
        key={data.profile?.id + "-" + data.profile?.updated_at}
        ctx={ctx}
      />
    ) : route === "/reset-password" ? (
      <Password ctx={ctx} />
    ) : documentId ? (
      <Document key={documentId} id={documentId} ctx={ctx} />
    ) : (
      <main className="page">
        <h1>페이지를 찾을 수 없습니다.</h1>
        <Button onClick={() => go("/")}>홈으로</Button>
      </main>
    );
  return (
    <FeedbackContext.Provider value={{error,busy}}>
      <header>
        <button className="logo" onClick={() => go("/")}>
          <b>경</b>
          <span>경소위키</span>
          <i>BETA</i>
        </button>
        <nav aria-label="주 메뉴">
          <button onClick={() => go("/search")}>문서 검색</button>
          <button
            onClick={() => {
              if (publicDocs.length)
                go(
                  "/document/" +
                    publicDocs[Math.floor(Math.random() * publicDocs.length)]
                      .id,
                );
              else setNotice("아직 공개된 문서가 없습니다.");
            }}
          >
            랜덤 문서
          </button>
          {ctx.admin && <button onClick={() => go("/admin")}>관리센터</button>}
        </nav>
        <div>
          <Button onClick={() => ctx.write()}>＋ 문서 작성</Button>
          {session ? (
            <button
              className="avatar-button"
              aria-label="마이페이지"
              onClick={() => go("/me")}
            >
              {data.profile?.nickname?.[0] || "나"}
            </button>
          ) : (
            <Button onClick={ctx.login}>로그인</Button>
          )}
        </div>
      </header>
      {!hasSupabaseConfig && (
        <p className="setup-note">
          아직 서비스가 연결되지 않았습니다. 연결 후 회원가입과 문서 저장을
          사용할 수 있습니다.
        </p>
      )}
      <div className="feedback">
        <ErrorBox
          message={error}
          retry={() => run(reload, "다시 불러왔습니다.")}
        />
        {notice && (
          <p role="status" className="notice">
            {notice}
            <button aria-label="알림 닫기" onClick={() => setNotice("")}>
              ×
            </button>
          </p>
        )}
      </div>
      {loading ? (
        <main className="page" role="status">
          불러오는 중…
        </main>
      ) : (
        content
      )}
      {modal?.kind === "auth" && (
        <Auth ctx={ctx} close={() => setModal(null)} />
      )}
      {modal?.kind === "editor" && (
        <Editor ctx={ctx} document={modal.doc} close={() => setModal(null)} />
      )}
      <footer>
        경소위키 · 경북소프트웨어마이스터고등학교의 이야기를 함께 기록합니다.
      </footer>
    </FeedbackContext.Provider>
  );
}
