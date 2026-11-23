begin;

alter table public.legislative_references
  add constraint legislative_references_scoped_certificate_target_key
  unique (id, lei_id, structure_id),
  add constraint legislative_references_scoped_certificate_law_key unique (id, lei_id);

alter table public.recortes_leis
  add constraint recortes_leis_scoped_certificate_law_key unique (id, lei_id);

create table public.scoped_reading_certificates (
  recorte_id uuid not null,
  reference_id uuid not null,
  lei_id bigint not null,
  structure_id bigint,
  format_version smallint not null default 1 check (format_version > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  certified_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (recorte_id, reference_id),
  foreign key (recorte_id, lei_id) references public.recortes_leis (id, lei_id) on delete cascade,
  foreign key (reference_id, lei_id, structure_id)
    references public.legislative_references (id, lei_id, structure_id)
    on update cascade on delete cascade,
  foreign key (reference_id, lei_id) references public.legislative_references (id, lei_id) on update cascade on delete cascade,
  foreign key (structure_id, lei_id) references public.law_structure (id, lei_id)
    on delete set null (structure_id)
);
-- A cleared structure leaves an inert historical pin, not an impediment to
-- existing editorial changes. A moved structure no longer matches the digest.
create index scoped_reading_certificates_structure_idx
  on public.scoped_reading_certificates (structure_id, lei_id);

alter table public.scoped_reading_certificates enable row level security;
revoke all on public.scoped_reading_certificates from public, anon, authenticated, service_role;
grant select on public.scoped_reading_certificates to service_role;

commit;
