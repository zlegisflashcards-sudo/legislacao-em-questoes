import type { FormEvent, ReactNode } from "react";

export function CommercialEditForm({ title, onSubmit, onCancel, busy, children }: { title: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void; busy: boolean; children: ReactNode }) { return <form className="commercial-card commercial-form-grid" onSubmit={onSubmit}><h2>{title}</h2>{children}<div className="commercial-form-actions"><button className="admin-button primary" disabled={busy}>Salvar</button><button type="button" className="admin-button secondary" onClick={onCancel}>Novo / cancelar edição</button></div></form>; }

export function CommercialDataTable({ headers, children }: { headers: string[]; children: ReactNode }) { return <div className="admin-table-wrap commercial-table-wrap"><table className="admin-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
