"use client";

import { useCallback, useEffect, useState } from "react";

type Law = { slug: string; titulo: string };
type ConferenceList = {
  id: string;
  nome: string;
  created_at: string;
  updated_at: string;
  questions_count: number;
  reviewed_count: number;
  pending_count: number;
  unavailable_count: number;
};
type ImportPreview = {
  total_received: number;
  found_count: number;
  missing_ids: string[];
  duplicate_ids: string[];
  invalid_ids: string[];
  valid_unique: string[];
};

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : "Não foi possível concluir a operação.",
    );
  return body;
}
async function post(body: Record<string, unknown>) {
  return fetch("/api/admin/questoes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(readJson);
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminQuestionConferenceLists({
  law,
  onClose,
  onOpen,
}: {
  law: Law;
  onClose: () => void;
  onOpen: (list: Pick<ConferenceList, "id" | "nome">) => void;
}) {
  const [lists, setLists] = useState<ConferenceList[]>([]);
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [appendTarget, setAppendTarget] = useState<ConferenceList | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const body = (await fetch(
        `/api/admin/questoes?mode=conference-lists&law_slug=${encodeURIComponent(law.slug)}`,
        { cache: "no-store" },
      ).then(readJson)) as { lists: ConferenceList[] };
      setLists(body.lists);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível carregar as listas.",
      );
    } finally {
      setLoading(false);
    }
  }, [law.slug]);
  useEffect(() => {
    void load();
  }, [load]);

  async function analyze() {
    if (!source.trim()) {
      setError("Cole UUIDs ou selecione um arquivo TXT/CSV.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      setPreview(
        (await post({
          action: "previsualizar_lista_conferencia",
          law_slug: law.slug,
          source,
        })) as ImportPreview,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível gerar a prévia.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function save() {
    if (!preview) return;
    if (!appendTarget && !name.trim()) {
      setError("Informe o nome da lista.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await post(
        appendTarget
          ? {
              action: "adicionar_lista_conferencia",
              law_slug: law.slug,
              list_id: appendTarget.id,
              source,
            }
          : {
              action: "criar_lista_conferencia",
              law_slug: law.slug,
              nome: name,
              source,
            },
      );
      setName("");
      setSource("");
      setPreview(null);
      setAppendTarget(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível salvar a lista.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function rename(list: ConferenceList) {
    const nome = window.prompt("Novo nome da lista:", list.nome)?.trim();
    if (!nome || nome === list.nome) return;
    setSaving(true);
    try {
      await post({
        action: "renomear_lista_conferencia",
        law_slug: law.slug,
        list_id: list.id,
        nome,
      });
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível renomear a lista.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function remove(list: ConferenceList) {
    if (
      !window.confirm(
        `Excluir a lista “${list.nome}”? As questões originais serão preservadas.`,
      )
    )
      return;
    setSaving(true);
    try {
      await post({
        action: "excluir_lista_conferencia",
        law_slug: law.slug,
        list_id: list.id,
      });
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível excluir a lista.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function chooseFile(file: File | null) {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError("O arquivo pode ter no máximo 1 MB.");
      return;
    }
    setSource(await file.text());
    setPreview(null);
  }
  function problems() {
    return [
      ...(preview?.missing_ids ?? []),
      ...(preview?.duplicate_ids ?? []),
      ...(preview?.invalid_ids ?? []),
    ].join("\n");
  }
  async function copyProblems() {
    try {
      await navigator.clipboard.writeText(problems());
    } catch {
      setError("Não foi possível copiar os UUIDs neste navegador.");
    }
  }
  const title = appendTarget
    ? `Acrescentar a “${appendTarget.nome}”`
    : "Criar uma lista";

  return (
    <div className="admin-modal-backdrop" role="presentation">
      <section
        className="admin-modal conference-list-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conference-lists-title"
      >
        <header className="conference-list-header">
          <div>
            <p className="law-center-kicker">Modo conferência</p>
            <h2 id="conference-lists-title">Listas personalizadas</h2>
            <p>
              Monte uma fila por UUID sem duplicar ou alterar o conteúdo das
              questões desta lei.
            </p>
          </div>
          <button
            type="button"
            className="admin-button secondary"
            onClick={onClose}
          >
            Fechar
          </button>
        </header>
        {error ? (
          <p className="admin-alert error conference-list-alert" role="alert">
            {error}
          </p>
        ) : null}
        <div className="conference-list-layout">
          <section
            className="conference-list-builder"
            aria-labelledby="conference-list-builder-title"
          >
            <header>
              <span aria-hidden="true">1</span>
              <div>
                <h3 id="conference-list-builder-title">{title}</h3>
                <p>
                  Cole os UUIDs ou envie um TXT/CSV. A ordem colada define a
                  ordem da conferência.
                </p>
              </div>
            </header>
            {!appendTarget ? (
              <label>
                <span>Nome da lista</span>
                <input
                  value={name}
                  maxLength={160}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex.: Revisão de outubro"
                />
              </label>
            ) : (
              <div className="conference-list-append-target">
                <span>Lista selecionada</span>
                <strong>{appendTarget.nome}</strong>
                <button
                  type="button"
                  className="admin-link-button"
                  onClick={() => {
                    setAppendTarget(null);
                    setPreview(null);
                  }}
                >
                  Escolher outra ação
                </button>
              </div>
            )}
            <label>
              <span>UUIDs das questões</span>
              <textarea
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                  setPreview(null);
                }}
                rows={7}
                placeholder="Um UUID por linha, ou valores separados por vírgula"
              />
              <small>
                Limite de 1 MB. UUIDs repetidos são informados na prévia.
              </small>
            </label>
            <label className="conference-list-file">
              <span>Ou importe um arquivo</span>
              <input
                type="file"
                accept=".txt,.csv,text/plain,text/csv"
                onChange={(event) =>
                  void chooseFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
            <button
              type="button"
              className="admin-button secondary conference-list-preview-button"
              disabled={saving || !source.trim()}
              onClick={() => void analyze()}
            >
              {saving ? "Analisando…" : "Gerar prévia"}
            </button>
            {preview ? (
              <section className="conference-list-preview" aria-live="polite">
                <header>
                  <div>
                    <span aria-hidden="true">2</span>
                    <h4>Confirme a importação</h4>
                  </div>
                  <strong>{preview.found_count} válida(s)</strong>
                </header>
                <dl>
                  <div>
                    <dt>Recebidas</dt>
                    <dd>{preview.total_received}</dd>
                  </div>
                  <div>
                    <dt>Ausentes</dt>
                    <dd>{preview.missing_ids.length}</dd>
                  </div>
                  <div>
                    <dt>Repetidas</dt>
                    <dd>{preview.duplicate_ids.length}</dd>
                  </div>
                  <div>
                    <dt>Inválidas</dt>
                    <dd>{preview.invalid_ids.length}</dd>
                  </div>
                </dl>
                {problems() ? (
                  <button
                    type="button"
                    className="admin-link-button"
                    onClick={() => void copyProblems()}
                  >
                    Copiar UUIDs com problema
                  </button>
                ) : null}
                <button
                  type="button"
                  className="admin-button primary"
                  disabled={saving || !preview.found_count}
                  onClick={() => void save()}
                >
                  {appendTarget
                    ? `Acrescentar ${preview.found_count} questão(ões)`
                    : `Criar lista com ${preview.found_count} questão(ões)`}
                </button>
              </section>
            ) : null}
          </section>
          <section
            className="conference-list-saved"
            aria-labelledby="conference-list-saved-title"
          >
            <header>
              <div>
                <h3 id="conference-list-saved-title">Listas salvas</h3>
                <p>Abra uma fila para conferir ou acrescente novos UUIDs.</p>
              </div>
              {!loading ? <span>{lists.length}</span> : null}
            </header>
            {loading ? (
              <p className="conference-list-empty">Carregando listas…</p>
            ) : lists.length ? (
              <ul>
                {lists.map((list) => (
                  <li key={list.id}>
                    <div className="conference-list-card-heading">
                      <div>
                        <strong>{list.nome}</strong>
                        <small>
                          Atualizada em {formatDate(list.updated_at)}
                        </small>
                      </div>
                      <span>{list.questions_count} questões</span>
                    </div>
                    <dl>
                      <div>
                        <dt>Conferidas</dt>
                        <dd>{list.reviewed_count}</dd>
                      </div>
                      <div>
                        <dt>Pendentes</dt>
                        <dd>{list.pending_count}</dd>
                      </div>
                      {list.unavailable_count ? (
                        <div>
                          <dt>Indisponíveis</dt>
                          <dd>{list.unavailable_count}</dd>
                        </div>
                      ) : null}
                    </dl>
                    <div className="conference-list-card-actions">
                      <button
                        type="button"
                        className="admin-button primary"
                        disabled={saving}
                        onClick={() => onOpen(list)}
                      >
                        Abrir conferidor
                      </button>
                      <button
                        type="button"
                        className="admin-button secondary"
                        disabled={saving}
                        onClick={() => {
                          setAppendTarget(list);
                          setPreview(null);
                        }}
                      >
                        Acrescentar
                      </button>
                      <button
                        type="button"
                        className="admin-button secondary"
                        disabled={saving}
                        onClick={() => void rename(list)}
                      >
                        Renomear
                      </button>
                      <button
                        type="button"
                        className="admin-button danger"
                        disabled={saving}
                        onClick={() => void remove(list)}
                      >
                        Excluir
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="conference-list-empty">
                Nenhuma lista personalizada nesta lei.
              </p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
