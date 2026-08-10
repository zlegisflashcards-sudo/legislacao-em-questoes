begin;

alter table public.alunos
  add column if not exists deve_trocar_senha boolean not null default false;

comment on column public.alunos.deve_trocar_senha is
  'Impede acesso normal ate a troca da senha provisoria pelo proprio aluno.';

commit;
