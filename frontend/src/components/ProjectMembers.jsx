import { useEffect, useState } from 'react';

const ROLES = { owner: 'Propriétaire', admin: 'Administrateur', contributor: 'Contributeur', reader: 'Lecteur' };

export default function ProjectMembers({ api, projectId, role, disabled }) {
  const [members, setMembers] = useState([]);
  const [name, setName] = useState('');
  const [newRole, setNewRole] = useState('reader');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setMembers([]); setError(''); setName('');
    api.get(`/api/projects/${projectId}/members`).then(({ data }) => {
      if (active) setMembers(data.members || []);
    }).catch(() => { if (active) setError('Impossible de charger les membres.'); });
    return () => { active = false; };
  }, [api, projectId]);

  const update = async (userName, memberRole) => {
    setBusy(true); setError('');
    try {
      const { data } = await api.put(`/api/projects/${projectId}/members`, { user_name: userName, role: memberRole });
      setMembers(previous => [...previous.filter(m => m.user_id !== data.user_id), data]);
      setName('');
    } catch (e) { setError(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Modification impossible.'); }
    finally { setBusy(false); }
  };
  const remove = async id => {
    setBusy(true); setError('');
    try {
      await api.delete(`/api/projects/${projectId}/members/${id}`);
      setMembers(previous => previous.filter(m => m.user_id !== id));
    } catch (_) { setError('Retrait impossible.'); }
    finally { setBusy(false); }
  };

  return <details className="mt-4 border-t border-slate-100 pt-4">
    <summary className="cursor-pointer text-sm font-semibold">Membres et partage · {ROLES[role] || 'Accès au projet'}</summary>
    <p className="mt-3 text-xs leading-5 text-slate-600">Les membres accèdent aux documents et à tout l’historique des analyses du projet. Les administrateurs peuvent approuver les réponses. Les contributeurs peuvent ajouter leurs documents et lancer des analyses. Les lecteurs consultent uniquement.</p>
    {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
    <ul className="mt-3 space-y-2">{members.map(member => <li key={member.user_id} className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm">
      <span className="min-w-0 flex-1 break-words">{member.user_name}</span>
      {role === 'owner' && member.role !== 'owner' ? <>
        <select aria-label={`Rôle de ${member.user_name}`} disabled={busy || disabled} value={member.role} onChange={e => update(member.user_name, e.target.value)} className="rounded border p-2">
          {['admin', 'contributor', 'reader'].map(r => <option key={r} value={r}>{ROLES[r]}</option>)}
        </select>
        <button type="button" disabled={busy || disabled} onClick={() => remove(member.user_id)} className="text-rose-700 disabled:opacity-40">Retirer {member.user_name}</button>
      </> : <span>{ROLES[member.role]}</span>}
    </li>)}</ul>
    {role === 'owner' && <form className="mt-3 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); update(name.trim(), newRole); }}>
      <input aria-label="Identifiant du collaborateur" required maxLength={200} value={name} onChange={e => setName(e.target.value)} disabled={busy || disabled} placeholder="Identifiant exact d’un compte existant" className="min-w-0 flex-1 rounded border p-2 text-sm" />
      <select aria-label="Rôle du collaborateur" value={newRole} disabled={busy || disabled} onChange={e => setNewRole(e.target.value)} className="rounded border p-2 text-sm">
        {['reader', 'contributor', 'admin'].map(r => <option key={r} value={r}>{ROLES[r]}</option>)}
      </select>
      <button disabled={busy || disabled || !name.trim()} className="rounded bg-primary px-4 py-2 text-sm text-white disabled:opacity-40">Partager le projet</button>
    </form>}
    <p className="mt-3 text-xs text-slate-500">Retirer un membre bloque ses prochains accès. Ses documents déjà ajoutés restent dans le projet ; les données déjà consultées ne peuvent pas être rappelées.</p>
  </details>;
}
