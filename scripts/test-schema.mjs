import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const bootstrap = `
create role anon;
create role authenticated;
create schema auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001');
`;

for (const partial of [false, true]) {
  const db = new PGlite();
  try {
    await db.exec(bootstrap);
    if (partial) await db.exec(`create type public.user_role as enum ('user','admin');`);
    await db.exec(schema);
    assert.equal((await db.query('select * from profiles')).rows.length, 1);
    assert.equal((await db.query('select * from categories')).rows.length, 8);
    assert.equal((await db.query('select * from documents')).rows.length, 0);
    await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
      set role authenticated;
      insert into documents(title,slug,content,author_id,status) values
      ('테스트','test','본문','00000000-0000-0000-0000-000000000001','published');
      reset role;`);
    await db.exec(schema);
    assert.equal((await db.query('select * from documents')).rows.length, 1);
    assert.equal((await db.query('select * from document_revisions')).rows.length, 1);
    assert.equal((await db.query('select * from categories')).rows.length, 8);
    await db.exec('alter table profiles drop column cohort; alter table documents drop column edit_summary;');
    await db.exec(schema);
    await db.exec(`set role authenticated; update documents set content='수정 본문', edit_summary='테스트 수정' where slug='test'; reset role;`);
    assert.equal((await db.query('select * from document_revisions')).rows.length, 2);
    await db.exec(schema);
    assert.equal((await db.query('select * from document_revisions')).rows.length, 2);
    console.log(`PASS ${partial ? '기존 user_role 존재' : '신규 DB'}: 설치, 반복 실행, 데이터 보존, 누락 컬럼 보충, 기존 회원 문서 생성·수정 기록`);
  } finally { await db.close(); }
}
