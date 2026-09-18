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

SQL은 신규 설치와 재실행을 지원합니다. `user_role already exists` 오류가 났다면 수정된 파일 **전체**를 다시 실행하세요. 기존 테이블과 데이터를 삭제하지 않고, 정책·트리거를 갱신하고 이전 버전의 누락 컬럼을 보충합니다. 실행 도중 실패하면 이번 실행의 변경은 트랜잭션으로 롤백됩니다. 기존 가입자의 누락 프로필도 자동으로 생성합니다.

이미 다른 구조로 직접 만든 테이블이 있다면 호환되지 않는 컬럼 때문에 추가 조정이 필요할 수 있습니다. 오류를 해결하려고 테이블을 삭제하지 마세요.

`npm run test:db`는 임시 PGlite PostgreSQL 엔진에서 새 DB, 타입만 존재하는 DB, 반복 실행, 기존 데이터 보존, 기존 계정 문서 생성, 수정 기록, 이전 버전 누락 컬럼 보충을 검증합니다. 운영 Supabase에는 접속하지 않습니다.

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
