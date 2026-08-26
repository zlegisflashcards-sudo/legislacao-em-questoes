begin;

drop policy if exists law_update_notices_student_read on public.law_update_notices;
create policy law_update_notices_student_read
on public.law_update_notices
for select to authenticated
using (
  exists (
    select 1
    from public.law_update_notice_deliveries as d
    join public.alunos as a on a.id = d.student_id
    where d.notice_id = public.law_update_notices.id
      and a.user_id = auth.uid()
  )
);

commit;
