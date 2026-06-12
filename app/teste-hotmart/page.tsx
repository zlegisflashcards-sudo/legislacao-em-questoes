const hotmartCheckoutUrl =
  "https://pay.hotmart.com/B104079780M?checkoutMode=2&off=xmmntspl";

export default function TesteHotmartPage() {
  return (
    <div className="bg-[#eef2f7]">
      <div className="mx-auto min-h-[calc(100vh-220px)] max-w-5xl px-5 py-8 sm:px-6 sm:py-10">
        <div className="mb-5">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
            Teste temporario
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">
            Widget Hotmart
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Pagina isolada para validar o checkout incorporado. Os botoes de
            compra atuais continuam inalterados.
          </p>
        </div>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <iframe
            src={hotmartCheckoutUrl}
            title="Checkout Hotmart"
            className="h-[760px] w-full border-0"
            allow="payment *"
          />
        </section>
      </div>
    </div>
  );
}
