# 경소위키백과

경북소프트웨어마이스터고등학교 학생들이 친구, 동아리, 학교생활에 관한 문서를 함께 만들고 읽는 위키입니다.

## 실행

```bash
npm install
npm run dev
```

## Supabase 연결

1. `.env.example`을 복사해 `.env.local` 파일을 만들고 Supabase 프로젝트 URL과 publishable key를 채웁니다.
2. Supabase SQL Editor에서 [`supabase/schema.sql`](./supabase/schema.sql) 파일 전체를 실행합니다.

`schema.sql`에는 회원·문서·수정 기록·댓글·태그·카테고리 테이블과 RLS 정책이 포함되어 있습니다.
환경변수가 없으면 예시 문서를 보여주고, 연결하면 `documents` 테이블의 공개 문서를 자동으로 불러옵니다.

## 중요한 보안 규칙

- 브라우저 환경변수에는 `sb_publishable_` key만 사용합니다. `sb_secret_` key는 절대 넣지 마세요.
- 학생과 선생님 문서는 `subject_consent = true`여야 일반 사용자에게 공개됩니다.
- 첫 관리자 지정은 가입 후 Supabase SQL Editor에서 한 번만 실행합니다.

```sql
update public.profiles set role = 'admin' where nickname = '관리자닉네임';
```

## 관리자 강제 탈퇴 기능 배포

회원 탈퇴와 관리자의 강제 탈퇴는 브라우저에 비밀 키를 노출하지 않도록 Edge Function으로 처리합니다. Supabase CLI를 로그인·연결한 뒤 다음을 실행하세요.

```bash
supabase functions deploy admin-users
```

`SUPABASE_SERVICE_ROLE_KEY`는 Supabase Edge Function 기본 환경변수로만 사용되며, `.env.local`이나 프런트엔드에 넣으면 안 됩니다.
