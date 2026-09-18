import { useContext, useEffect, useRef, useState } from "react";
import { FeedbackContext } from "./feedback";
import ReactMarkdown from "react-markdown";
import { date, result, safeUrl } from "./api";
import { supabase } from "./supabase";

export function Modal({ title, close, children }) {
  const feedback = useContext(FeedbackContext);
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog ref={ref} className="dialog" onCancel={close}>
      <button aria-label="닫기" className="close" onClick={close}>
        ×
      </button>
      <h2>{title}</h2>
      <ErrorBox message={feedback.error} />
      {children}
    </dialog>
  );
}
export function Button({ children, ...props }) {
  return (
    <button className="button" {...props}>
      {children}
    </button>
  );
}
export function Image({ value, alt = "", className }) {
  const [signed, setSigned] = useState(null);
  useEffect(() => {
    let live = true;
    if (value?.startsWith("asset:") && supabase) {
      supabase.storage
        .from("wiki-images")
        .createSignedUrl(value.slice(6), 3600)
        .then(({ data }) => {
          if (live) setSigned({ value, url: data?.signedUrl });
        });
    }
    return () => {
      live = false;
    };
  }, [value]);
  const src = value?.startsWith("asset:")
    ? signed?.value === value
      ? signed.url
      : null
    : safeUrl(value);
  return src ? (
    <img src={src} alt={alt} className={className} loading="lazy" />
  ) : null;
}
export function ImageField({ value, onChange, user, run, label = "이미지" }) {
  return (
    <label>
      {label}
      <input
        type="url"
        value={value?.startsWith("asset:") ? "" : value || ""}
        placeholder="https://… 이미지 주소 또는 파일 업로드"
        onChange={(e) => onChange(e.target.value)}
      />
      {user && (
        <input
          aria-label={label + " 파일"}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            run(async () => {
              if (
                file.size > 5 * 1024 * 1024 ||
                !["image/png", "image/jpeg", "image/webp"].includes(file.type)
              )
                throw new Error(
                  "5MB 이하 PNG/JPEG/WebP 이미지를 선택해 주세요.",
                );
              const path =
                user.id +
                "/" +
                crypto.randomUUID() +
                "." +
                {
                  "image/png": "png",
                  "image/jpeg": "jpg",
                  "image/webp": "webp",
                }[file.type];
              await result(
                supabase.storage
                  .from("wiki-images")
                  .upload(path, file, { contentType: file.type }),
              );
              onChange("asset:" + path);
            }, "이미지를 업로드했습니다.");
          }}
        />
      )}
      <Image value={value} className="image-preview" />
      <button type="button" onClick={() => onChange("")}>
        이미지 제거
      </button>
    </label>
  );
}
export function Markdown({ content }) {
  let index = 0;
  const headings = (content || "")
    .split("\n")
    .filter((line) => /^#{1,3}\s/.test(line));
  const components = Object.fromEntries(
    ["h1", "h2", "h3"].map((Tag) => [
      Tag,
      ({ children }) => <Tag id={"section-" + index++}>{children}</Tag>,
    ]),
  );
  return (
    <>
      <nav className="toc" aria-label="문서 목차">
        {headings.length > 0 && (
          <details open>
            <summary>목차</summary>
            {headings.map((h, i) => (
              <a key={i} href={"#section-" + i}>
                {h.replace(/^#+\s/, "")}
              </a>
            ))}
          </details>
        )}
      </nav>
      <article className="markdown">
        <ReactMarkdown components={components}>{content || ""}</ReactMarkdown>
      </article>
    </>
  );
}
export function Cards({ documents, ctx }) {
  return documents.length ? (
    <div className="doc-grid">
      {documents.map((d) => (
        <button
          key={d.id}
          className="doc-card"
          onClick={() => ctx.go("/document/" + d.id)}
        >
          <Image value={d.thumbnail_url} className="card-image" />
          <span>
            {ctx.categories.find((c) => c.id === d.category_id)?.name || "기타"}{" "}
            {d.is_featured ? "· 고정" : ""}
          </span>
          <h3>{d.title}</h3>
          <p>{d.summary}</p>
          <small>
            {ctx.name(d.author_id)} · {date(d.updated_at)} · {d.views}회
          </small>
        </button>
      ))}
    </div>
  ) : (
    <p className="empty-state">문서가 없습니다. 첫 이야기를 작성해 주세요.</p>
  );
}
export function ErrorBox({ message, retry }) {
  return message ? (
    <div role="alert" className="error-box">
      {message}
      {retry && <button onClick={retry}>다시 시도</button>}
    </div>
  ) : null;
}
