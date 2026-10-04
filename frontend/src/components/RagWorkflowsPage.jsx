import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LuArrowRight, LuCheck, LuFileText, LuRefreshCw, LuShieldCheck, LuX } from 'react-icons/lu';
import ProjectMembers from './ProjectMembers';
import NavBar from './shared/navBar';
import useAxiosPrivate from '../hooks/useAxiosPrivate';

const LABELS = {
  running: 'En cours', created: 'À démarrer', failed: 'Interrompue',
  awaiting_review: 'À valider', completed: 'Terminée', rejected: 'Rejetée',
  insufficient_evidence: 'Preuves insuffisantes',
};
const STEPS = {
  access_checked: 'Accès aux documents vérifié', retrieved: 'Recherche et classement des passages',
  query_refined: 'Recherche complémentaire', draft_generated: 'Brouillon préparé',
  evidence_checked: 'Citations et appui documentaire contrôlés', awaiting_review: 'Relecture demandée',
  human_reviewed: 'Décision humaine enregistrée', completed: 'Réponse finalisée',
  rejected: 'Réponse rejetée', abstained: 'Abstention : preuves insuffisantes',
};
const errorText = (error) => typeof error.response?.data?.detail === 'string'
  ? error.response.data.detail : 'La demande n’a pas abouti. Actualisez l’historique avant de réessayer.';

export default function RagWorkflowsPage() {
  const api = useAxiosPrivate();
  const [params, setParams] = useSearchParams();
  const runId = params.get('run');
  const projectId = params.get('project');
  const [projects, setProjects] = useState([]);
  const [projectName, setProjectName] = useState('');
  const [library, setLibrary] = useState([]);
  const [attachId, setAttachId] = useState('');
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState([]);
  const [question, setQuestion] = useState('');
  const [reviewRequired, setReviewRequired] = useState(false);
  const [ready, setReady] = useState(false);
  const [runs, setRuns] = useState([]);
  const [run, setRun] = useState(null);
  const [onlyPending, setOnlyPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const attemptRef = useRef(null);
  const inFlight = useRef(false);

  const refreshRuns = useCallback(async () => {
    if (!projectId) return;
    const response = await api.get(`/api/rag-workflows/runs?project_id=${projectId}`);
    setRuns(response.data.runs || []);
  }, [api, projectId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [documents, capability, projectList] = await Promise.all([
          api.get('/api/document/files'), api.get('/api/rag-workflows/capabilities'),
          api.get('/api/projects'),
        ]);
        if (cancelled) return;
        setLibrary(Object.values(documents.data || {}).flat().filter(file => file.processing_status === 'completed' && file.processed));
        setReady(capability.data.ready);
        setProjects(projectList.data.projects || []);
      } catch (e) { if (!cancelled) setError(errorText(e)); }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    if (!runId) { setRun(null); return undefined; }
    setRun(null);
    api.get(`/api/rag-workflows/runs/${runId}`).then(response => {
      if (!cancelled) {
        if (response.data.project_id && response.data.project_id !== projectId) {
          setParams({ project: response.data.project_id, run: runId }, { replace: true });
        }
        setRun(response.data);
      }
    }).catch(e => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; };
  }, [api, runId, projectId, setParams]);

  useEffect(() => {
    let cancelled = false;
    setFiles([]); setRuns([]); setSelected([]); setAttachId('');
    if (!projectId) return undefined;
    Promise.all([
      api.get(`/api/projects/${projectId}/documents`),
      api.get(`/api/rag-workflows/runs?project_id=${projectId}`),
    ]).then(([documents, history]) => {
      if (cancelled) return;
      setFiles((documents.data.files || []).filter(f => f.processed && f.processing_status === 'completed'));
      setRuns(history.data.runs || []);
    }).catch(e => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; };
  }, [api, projectId]);

  const createProject = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const { data } = await api.post('/api/projects', { name: projectName.trim(), file_ids: [] });
      setProjects(previous => [...previous, data]);
      setParams({ project: data.id }); setProjectName('');
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };

  const attachDocument = async () => {
    setBusy(true); setError('');
    try {
      await api.put(`/api/projects/${projectId}/documents/${attachId}`);
      const { data } = await api.get(`/api/projects/${projectId}/documents`);
      setFiles(data.files.filter(f => f.processed && f.processing_status === 'completed'));
      setAttachId('');
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };

  const perform = async (url, body) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await api.post(url, body, { timeout: 200000 });
      setRun(response.data);
      setParams({ project: response.data.project_id || projectId, run: response.data.id });
      await refreshRuns();
      return response.data;
    } catch (e) {
      setError(errorText(e));
      // A lost response need not mean a lost run. Show durable history if reachable.
      try { await refreshRuns(); } catch (_) { /* Preserve the original error. */ }
      return null;
    } finally { inFlight.current = false; setBusy(false); }
  };

  const submit = async (event) => {
    event.preventDefault();
    const body = { project_id: projectId, question: question.trim(), file_ids: [...selected].sort((a, b) => a - b), require_review: reviewRequired };
    const signature = JSON.stringify(body);
    if (!attemptRef.current || attemptRef.current.signature !== signature) {
      attemptRef.current = { signature, id: window.crypto.randomUUID() };
    }
    const result = await perform('/api/rag-workflows/runs', { ...body, id: attemptRef.current.id });
    if (result) attemptRef.current = null;
  };

  const review = action => perform(`/api/rag-workflows/runs/${run.id}/review`, {
    action, draft_hash: run.result.draft_hash,
  });
  const activeRole = projects.find(p => p.id === projectId)?.role;
  const canContribute = ['owner', 'admin', 'contributor'].includes(activeRole);
  const canReview = ['owner', 'admin'].includes(activeRole);
  const result = run?.result;
  const pending = run?.status === 'awaiting_review';
  const visibleRuns = onlyPending ? runs.filter(item => item.status === 'awaiting_review') : runs;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <NavBar />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Aitheris · Analyses documentaires</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">RAG contrôlé</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Des réponses reliées à leurs preuves, avec une relecture humaine lorsque vous la demandez.</p>
          </div>
          <Link to="/general-chat" className="text-sm font-medium text-primary hover:underline">Ouvrir mes documents <span aria-hidden="true">→</span></Link>
        </div>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
          <label htmlFor="rag-project" className="block text-sm font-semibold">Projet</label>
          <select id="rag-project" value={projectId || ''} disabled={busy} onChange={e => { setParams(e.target.value ? { project: e.target.value } : {}); setError(''); }} className="mt-2 w-full rounded-lg border p-3">
            <option value="">Choisir un projet</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <form onSubmit={createProject} className="mt-3 flex flex-wrap gap-2">
            <input aria-label="Nom du nouveau projet" required maxLength={200} value={projectName} disabled={busy} onChange={e => setProjectName(e.target.value)} placeholder="Nom du nouveau projet" className="min-w-0 flex-1 rounded-lg border p-2 text-sm" />
            <button disabled={busy || !projectName.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-40">Créer un projet</button>
          </form>
          {projectId && canContribute && <div className="mt-3 flex flex-wrap gap-2">
            <select aria-label="Document à ajouter au projet" value={attachId} disabled={busy} onChange={e => setAttachId(e.target.value)} className="min-w-0 flex-1 rounded-lg border p-2 text-sm">
              <option value="">Ajouter un document de ma bibliothèque</option>
              {library.filter(f => !files.some(existing => existing.id === f.id)).map(f => <option key={f.id} value={f.id}>{f.file_name}</option>)}
            </select>
            <button type="button" disabled={busy || !attachId} onClick={attachDocument} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40">Ajouter au projet</button>
          </div>}
          {projectId && <ProjectMembers key={projectId} api={api} projectId={projectId} role={activeRole} disabled={busy} />}
        </section>
        {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
        {!loading && !ready && <div role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Le service d’analyse est temporairement indisponible. Réessayez plus tard ou contactez votre administrateur.</div>}

        <div className="grid items-start gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Analyses du projet</h2>
              <button type="button" disabled={busy} onClick={() => refreshRuns().catch(e => setError(errorText(e)))} aria-label="Actualiser l’historique" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><LuRefreshCw /></button>
            </div>
            <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-xs">
              <button type="button" onClick={() => setOnlyPending(false)} aria-pressed={!onlyPending} className={`flex-1 rounded-md px-2 py-2 ${!onlyPending ? 'bg-white shadow-sm' : ''}`}>Toutes</button>
              <button type="button" onClick={() => setOnlyPending(true)} aria-pressed={onlyPending} className={`flex-1 rounded-md px-2 py-2 ${onlyPending ? 'bg-white shadow-sm' : ''}`}>À valider ({runs.filter(r => r.status === 'awaiting_review').length})</button>
            </div>
            <button type="button" disabled={busy} onClick={() => { setParams(projectId ? { project: projectId } : {}); setQuestion(''); setError(''); attemptRef.current = null; }} className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-40">Nouvelle analyse</button>
            <div className="mt-3 max-h-[500px] space-y-2 overflow-y-auto">
              {!visibleRuns.length && <p className="px-2 py-5 text-sm text-slate-500">{loading ? 'Chargement…' : 'Aucune analyse à afficher.'}</p>}
              {visibleRuns.map(item => <button key={item.id} type="button" disabled={busy} onClick={() => { setError(''); setParams({ project: projectId, run: item.id }); }} className={`w-full rounded-xl border p-3 text-left disabled:opacity-50 ${item.id === runId ? 'border-primary/30 bg-primary/5' : 'border-transparent hover:bg-slate-50'}`}>
                <span className="block truncate text-sm font-medium">{item.question}</span>
                <span className={`mt-1 block text-xs ${item.status === 'awaiting_review' ? 'text-amber-700' : 'text-slate-500'}`}>{LABELS[item.status] || item.status}</span>
              </button>)}
            </div>
          </aside>

          <div className="space-y-5">
            {!runId && !canContribute && projectId && <p className="rounded-xl bg-white p-5 text-sm text-slate-600">Sélectionnez une analyse dans l’historique. Votre rôle ne permet pas de lancer une nouvelle analyse.</p>}
            {!runId && canContribute && <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
              <label htmlFor="rag-question" className="block text-lg font-semibold">Que souhaitez-vous comprendre ?</label>
              <textarea id="rag-question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={4000} minLength={3} required rows={4} disabled={busy} placeholder="Comparez les exigences de sauvegarde dans les documents sélectionnés…" className="mt-4 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
              <fieldset disabled={busy} className="mt-5">
                <legend className="text-sm font-semibold">Sources de cette analyse <span className="font-normal text-slate-500">({selected.length} sélectionnées)</span></legend>
                {!files.length && <p className="mt-3 text-sm text-slate-500">{loading ? 'Chargement des documents…' : 'Ajoutez et traitez un document depuis votre bibliothèque pour commencer.'}</p>}
                <div className="mt-3 grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2">
                  {files.map(file => <label key={file.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${selected.includes(file.id) ? 'border-primary/30 bg-primary/5' : 'border-slate-200'}`}>
                    <input type="checkbox" checked={selected.includes(file.id)} onChange={() => setSelected(previous => previous.includes(file.id) ? previous.filter(id => id !== file.id) : [...previous, file.id])} className="accent-slate-800" />
                    <LuFileText className="shrink-0 text-slate-400" aria-hidden="true" /><span className="truncate">{file.file_name}</span>
                  </label>)}
                </div>
              </fieldset>
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-4">
                <input type="checkbox" checked={reviewRequired} onChange={e => setReviewRequired(e.target.checked)} disabled={busy} className="mt-1 accent-slate-800" />
                <span><span className="block text-sm font-medium">Relire avant de finaliser</span><span className="mt-1 block text-xs leading-5 text-slate-500">Un administrateur ou le propriétaire approuve ou rejette le brouillon. Vous pouvez revenir plus tard pour prendre votre décision.</span></span>
              </label>
              <button type="submit" disabled={!projectId || !ready || busy || !selected.length || question.trim().length < 3} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">{busy ? 'Analyse en cours…' : 'Analyser les documents'} <LuArrowRight aria-hidden="true" /></button>
              <p className="mt-3 text-xs leading-5 text-slate-500">L’analyse peut prendre quelques minutes. Les contrôles automatiques réduisent les erreurs sans garantir l’exactitude.</p>
            </form>}

            {runId && !run && !error && <div role="status" className="rounded-xl bg-white p-6 text-sm text-slate-500">Chargement de l’analyse…</div>}
            {run && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${pending ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{LABELS[run.status] || run.status}</span>
                <span className="text-xs text-slate-400">{new Date(run.created_at).toLocaleString('fr-FR')}</span>
              </div>
              <h2 className="mt-4 break-words text-xl font-semibold">{run.question}</h2>
              {run.error && <p role="alert" className="mt-4 text-sm text-rose-700">{run.error}</p>}
              {canContribute && ['running', 'created', 'failed'].includes(run.status) && <button disabled={busy || !ready} type="button" onClick={() => perform(`/api/rag-workflows/runs/${run.id}/resume`, {})} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-40">{busy ? 'Reprise…' : 'Reprendre / vérifier l’exécution'}</button>}
              {pending && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Brouillon à relire.</strong> Vérifiez les affirmations et leurs extraits. La décision d’un administrateur ou du propriétaire finalise cette réponse uniquement ; aucune publication externe n’est déclenchée.</div>}
              {(pending || run.status === 'completed') && result?.claims?.map((claim, index) => <div key={index} className="mt-5 border-b border-slate-100 pb-4 last:border-0">
                <p className="whitespace-pre-wrap break-words text-sm leading-7">{claim.text}</p>
                <div className="mt-2 flex flex-wrap gap-2">{[...new Set(claim.evidence.map(e => e.source_id))].map(id => <a key={id} href={`#source-${id}`} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-primary hover:bg-slate-200">[{id}]</a>)}</div>
                <details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer">Passages justificatifs</summary>{claim.evidence.map((e, i) => <blockquote key={i} className="mt-2 border-l-2 border-slate-200 pl-3 leading-6">« {e.quote} » [{e.source_id}]</blockquote>)}</details>
              </div>)}
              {['insufficient_evidence', 'rejected'].includes(run.status) && <p className="mt-5 text-sm leading-7 text-slate-600">{result?.answer}</p>}
              {pending && canReview && <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" disabled={busy || !ready} onClick={() => review('approve')} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"><LuCheck aria-hidden="true" />{busy ? 'Enregistrement…' : 'Approuver cette réponse'}</button>
                <button type="button" disabled={busy || !ready} onClick={() => review('reject')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700 disabled:opacity-40"><LuX aria-hidden="true" />Rejeter</button>
              </div>}
              {run.review?.decision && <p className="mt-4 text-xs text-slate-500">Décision enregistrée : {run.review.decision === 'approve' ? 'approbation' : 'rejet'} · {new Date(run.review.reviewed_at).toLocaleString('fr-FR')}</p>}
            </section>}

            {!!result?.sources?.length && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
              <h2 className="font-semibold">Sources consultées</h2>
              <div className="mt-4 space-y-3">{result.sources.map(source => <details id={`source-${source.id}`} key={source.id} className="scroll-mt-24 rounded-xl border border-slate-200 p-4">
                <summary className="cursor-pointer break-words text-sm font-medium">[{source.id}] {source.name}{source.page > 0 ? ` · page ${source.page}` : ''}</summary>
                <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-slate-600">{source.text}</p>
              </details>)}</div>
            </section>}
            {!!result?.trace?.length && <details className="rounded-2xl border border-slate-200 bg-white p-5">
              <summary className="cursor-pointer text-sm font-medium"><LuShieldCheck className="mr-2 inline" aria-hidden="true" />Parcours et contrôles</summary>
              <ol className="mt-4 list-inside list-decimal space-y-2 text-xs text-slate-600">{result.trace.map((event, i) => <li key={i}>{STEPS[event] || event}</li>)}</ol>
              <p className="mt-4 text-xs leading-5 text-slate-500">Les citations sont comparées aux extraits. L’appui documentaire est également évalué par un modèle ; ce contrôle peut se tromper.</p>
            </details>}
            {busy && <p role="status" className="text-sm text-slate-500">Traitement en cours. La réponse finale sera affichée après les contrôles.</p>}
          </div>
        </div>
      </main>
    </div>
  );
}
