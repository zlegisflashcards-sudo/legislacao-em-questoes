begin;

alter table public.law_structure
  add column if not exists audio_not_applicable boolean not null default false;

comment on column public.law_structure.audio_not_applicable is
  'Marcação administrativa manual: este nó estrutural não exige áudio próprio no LegisCast.';

commit;
