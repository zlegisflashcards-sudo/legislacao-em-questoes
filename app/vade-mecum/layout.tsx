export const metadata = {
  title: "Por concurso | Legis Flashcards",
  description: "Materiais completos organizados por concurso.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
