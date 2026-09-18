# 경소위키백과

경북소프트웨어마이스터고등학교 학생들이 친구, 동아리, 학교생활에 관한 문서를 함께 만들고 읽는 위키입니다.

## 실행

```bash
npm install
npm run dev
```

## Supabase 연결

1. `.env.example`을 복사해 `.env.local` 파일을 만들고 Supabase 프로젝트 URL과 anon key를 채웁니다.
2. Supabase SQL Editor에서 아래 SQL을 실행합니다.

```sql
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text default '문서',
  subtitle text,
  summary text,
  content text,
  views integer default 0,
  updated_at timestamptz default now()
);

alter table public.articles enable row level security;

create policy "누구나 문서를 볼 수 있음"
on public.articles for select using (true);
```

환경변수가 없으면 예시 문서를 보여주고, 연결하면 `articles` 테이블의 최신 문서를 자동으로 불러옵니다.
