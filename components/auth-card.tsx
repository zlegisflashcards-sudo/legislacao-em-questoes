type AuthCardProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-240px)] w-full max-w-md items-center px-5 py-12">
      <section className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
            Area do Aluno
          </p>
          <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
          <p className="text-sm leading-6 text-slate-600">{subtitle}</p>
        </div>

        {children}
      </section>
    </div>
  );
}
