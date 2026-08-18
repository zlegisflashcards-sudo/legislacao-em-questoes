begin;

alter table public.legisbot_destaques_usuario
  drop constraint if exists legisbot_destaques_cor;

alter table public.legisbot_destaques_usuario
  add constraint legisbot_destaques_cor
  check (cor in ('amarelo', 'verde', 'azul', 'roxo', 'rosa'))
  not valid;

alter table public.legisbot_destaques_usuario
  validate constraint legisbot_destaques_cor;

commit;
