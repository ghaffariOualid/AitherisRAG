import React, { useState, useEffect, useMemo } from 'react';
import NavBar from '../shared/navBar';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import {
  FiServer,
  FiCpu,
  FiCloud,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiCheckCircle,
  FiAlertCircle,
  FiRefreshCw,
  FiZap,
  FiEye,
  FiEyeOff,
  FiActivity,
  FiLayers,
  FiShield
} from 'react-icons/fi';

const PROVIDER_PRESETS = {
  ollama: {
    label: 'Ollama (Local)',
    icon: FiCpu,
    color: 'emerald',
    defaultUrl: 'http://host.docker.internal:11434/v1',
    defaultModel: 'qwen2.5:7b',
    requiresKey: false,
    suggestedModels: ['qwen2.5:7b', 'qwen3:14b', 'llama3.2', 'mistral', 'deepseek-r1:8b', 'phi3']
  },
  mistral: {
    label: 'Mistral AI (Cloud)',
    icon: FiCloud,
    color: 'orange',
    defaultUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    requiresKey: true,
    suggestedModels: ['mistral-small-latest', 'mistral-large-latest', 'open-mistral-nemo', 'codestral-latest']
  },
  openai: {
    label: 'OpenAI (Cloud)',
    icon: FiCloud,
    color: 'blue',
    defaultUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    requiresKey: true,
    suggestedModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo']
  },
  groq: {
    label: 'Groq (Ultra-rapide)',
    icon: FiZap,
    color: 'amber',
    defaultUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    requiresKey: true,
    suggestedModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768']
  },
  openrouter: {
    label: 'OpenRouter (Multi-modèles)',
    icon: FiLayers,
    color: 'purple',
    defaultUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct',
    requiresKey: true,
    suggestedModels: ['meta-llama/llama-3.3-70b-instruct', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash']
  },
  custom: {
    label: 'Personnalisé (OpenAI Compatible)',
    icon: FiServer,
    color: 'slate',
    defaultUrl: '',
    defaultModel: '',
    requiresKey: true,
    suggestedModels: []
  }
};

const ROLES_DEF = [
  { id: 'chat', label: 'Chat Général', desc: 'Conversations interactives et questions libres' },
  { id: 'rag', label: 'Synthèse RAG', desc: 'Génération de réponses ancrées dans les documents' },
  { id: 'summary', label: 'Résumés & Questions', desc: 'Extraction et synthèses automatiques' },
  { id: 'query_expansion', label: 'Expansion Requête', desc: 'Reformulation et synonymes de recherche' }
];

export default function LLMGatewayPage() {
  const axiosPrivate = useAxiosPrivate();

  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successBanner, setSuccessBanner] = useState(null);

  // Filter
  const [selectedFilter, setSelectedFilter] = useState('all');

  // Test states by provider id
  const [testingMap, setTestingMap] = useState({});
  const [testResultMap, setTestResultMap] = useState({});

  // Modal form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // Form values
  const [formType, setFormType] = useState('ollama');
  const [formName, setFormName] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formModelName, setFormModelName] = useState('');
  const [formTemperature, setFormTemperature] = useState(0.6);
  const [formRoles, setFormRoles] = useState(['chat']);
  const [formPriority, setFormPriority] = useState(0);
  const [formIsActive, setFormIsActive] = useState(true);

  // Ollama discovery in form
  const [detectingOllama, setDetectingOllama] = useState(false);
  const [detectedOllamaModels, setDetectedOllamaModels] = useState([]);
  const [modalTestStatus, setModalTestStatus] = useState(null);

  // Fetch providers
  const loadProviders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axiosPrivate.get('/api/admin/llm/providers');
      setProviders(res.data || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Impossible de charger les fournisseurs LLM.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  // Stats computed
  const stats = useMemo(() => {
    const active = providers.filter((p) => p.is_active);
    const primaryChat = active.find((p) => p.assigned_roles?.includes('chat')) || active[0];
    const primaryRag = active.find((p) => p.assigned_roles?.includes('rag')) || active[0];
    const primarySummary = active.find((p) => p.assigned_roles?.includes('summary')) || active[0];
    const ollamaCount = providers.filter((p) => p.provider_type === 'ollama').length;
    const cloudCount = providers.length - ollamaCount;

    return {
      total: providers.length,
      activeCount: active.length,
      ollamaCount,
      cloudCount,
      primaryChat: primaryChat?.model_name || 'Défaut (.env)',
      primaryRag: primaryRag?.model_name || 'Défaut (.env)',
      primarySummary: primarySummary?.model_name || 'Défaut (.env)'
    };
  }, [providers]);

  // Open modal for Create
  const handleOpenCreate = (presetKey = 'ollama') => {
    const preset = PROVIDER_PRESETS[presetKey] || PROVIDER_PRESETS.ollama;
    setEditingProvider(null);
    setFormType(presetKey);
    setFormName(presetKey === 'ollama' ? 'Ollama Local' : `${preset.label.split(' ')[0]} API`);
    setFormBaseUrl(preset.defaultUrl);
    setFormApiKey('');
    setFormModelName(preset.defaultModel);
    setFormTemperature(0.6);
    setFormRoles(['chat']);
    setFormPriority(providers.length);
    setFormIsActive(true);
    setShowApiKey(false);
    setDetectedOllamaModels([]);
    setModalTestStatus(null);
    setIsModalOpen(true);

    if (presetKey === 'ollama') {
      triggerDetectOllama(preset.defaultUrl);
    }
  };

  // Open modal for Edit
  const handleOpenEdit = (prov) => {
    setEditingProvider(prov);
    setFormType(prov.provider_type);
    setFormName(prov.name);
    setFormBaseUrl(prov.base_url);
    setFormApiKey(''); // leave empty so existing key remains
    setFormModelName(prov.model_name);
    setFormTemperature(prov.temperature || 0.6);
    setFormRoles(prov.assigned_roles || []);
    setFormPriority(prov.priority || 0);
    setFormIsActive(prov.is_active);
    setShowApiKey(false);
    setDetectedOllamaModels([]);
    setModalTestStatus(null);
    setIsModalOpen(true);

    if (prov.provider_type === 'ollama') {
      triggerDetectOllama(prov.base_url);
    }
  };

  // Switch preset in modal
  const handleSelectPreset = (presetKey) => {
    const preset = PROVIDER_PRESETS[presetKey];
    setFormType(presetKey);
    setFormBaseUrl(preset.defaultUrl);
    if (!formModelName || !editingProvider) {
      setFormModelName(preset.defaultModel);
    }
    if (!editingProvider) {
      setFormName(presetKey === 'ollama' ? 'Ollama Local' : `${preset.label.split(' ')[0]} Cloud`);
    }
    setModalTestStatus(null);
    if (presetKey === 'ollama') {
      triggerDetectOllama(preset.defaultUrl);
    }
  };

  // Trigger Ollama model discovery
  const triggerDetectOllama = async (targetUrl) => {
    const urlToTest = targetUrl || formBaseUrl || 'http://host.docker.internal:11434';
    setDetectingOllama(true);
    try {
      const res = await axiosPrivate.get(`/api/admin/llm/ollama/models?base_url=${encodeURIComponent(urlToTest)}`);
      const models = res.data?.models || [];
      setDetectedOllamaModels(models);
      if (models.length > 0 && (!formModelName || formModelName === 'qwen2.5:7b')) {
        setFormModelName(models[0].id || models[0].name);
      }
    } catch (err) {
      console.warn('Could not discover Ollama models:', err);
    } finally {
      setDetectingOllama(false);
    }
  };

  // Live test provider
  const handleTestProvider = async (prov) => {
    const pId = prov.id;
    setTestingMap((prev) => ({ ...prev, [pId]: true }));
    setTestResultMap((prev) => ({ ...prev, [pId]: null }));

    try {
      const res = await axiosPrivate.post('/api/admin/llm/test', {
        base_url: prov.base_url,
        api_key: null, // backend will decrypt if provider_id is sent
        model_name: prov.model_name,
        provider_type: prov.provider_type,
        provider_id: pId
      });
      setTestResultMap((prev) => ({ ...prev, [pId]: res.data }));
    } catch (err) {
      setTestResultMap((prev) => ({
        ...prev,
        [pId]: {
          success: false,
          message: err.response?.data?.detail || err.message || 'Erreur lors du test'
        }
      }));
    } finally {
      setTestingMap((prev) => ({ ...prev, [pId]: false }));
    }
  };

  // Test inside Modal
  const handleTestModal = async () => {
    setModalTestStatus({ testing: true });
    try {
      const res = await axiosPrivate.post('/api/admin/llm/test', {
        base_url: formBaseUrl,
        api_key: formApiKey || null,
        model_name: formModelName,
        provider_type: formType,
        provider_id: editingProvider?.id || null
      });
      setModalTestStatus({ testing: false, ...res.data });
    } catch (err) {
      setModalTestStatus({
        testing: false,
        success: false,
        message: err.response?.data?.detail || err.message || 'Erreur de connexion'
      });
    }
  };

  // Toggle active status
  const handleToggleActive = async (prov) => {
    try {
      const updated = await axiosPrivate.put(`/api/admin/llm/providers/${prov.id}`, {
        is_active: !prov.is_active
      });
      setProviders((prev) => prev.map((p) => (p.id === prov.id ? updated.data : p)));
      setSuccessBanner(`Statut de ${prov.name} mis à jour.`);
      setTimeout(() => setSuccessBanner(null), 3000);
    } catch (err) {
      alert('Impossible de modifier le statut : ' + (err.response?.data?.detail || err.message));
    }
  };

  // Save form (Create or Update)
  const handleSave = async (e) => {
    e.preventDefault();
    if (!formName.trim() || !formBaseUrl.trim() || !formModelName.trim()) {
      alert('Veuillez renseigner le nom, l’URL de base et le nom du modèle.');
      return;
    }

    const payload = {
      name: formName.trim(),
      provider_type: formType,
      base_url: formBaseUrl.trim(),
      api_key: formApiKey.trim() || null,
      model_name: formModelName.trim(),
      temperature: parseFloat(formTemperature),
      is_active: formIsActive,
      priority: parseInt(formPriority, 10) || 0,
      assigned_roles: formRoles
    };

    try {
      if (editingProvider) {
        const res = await axiosPrivate.put(`/api/admin/llm/providers/${editingProvider.id}`, payload);
        setProviders((prev) => prev.map((p) => (p.id === editingProvider.id ? res.data : p)));
        setSuccessBanner(`Fournisseur "${res.data.name}" mis à jour avec succès.`);
      } else {
        const res = await axiosPrivate.post('/api/admin/llm/providers', payload);
        setProviders((prev) => [...prev, res.data]);
        setSuccessBanner(`Fournisseur "${res.data.name}" créé avec succès.`);
      }
      setIsModalOpen(false);
      setTimeout(() => setSuccessBanner(null), 3500);
    } catch (err) {
      alert('Erreur lors de l’enregistrement : ' + (err.response?.data?.detail || err.message));
    }
  };

  // Delete provider
  const handleDelete = async (prov) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer le fournisseur "${prov.name}" ?`)) {
      return;
    }
    try {
      await axiosPrivate.delete(`/api/admin/llm/providers/${prov.id}`);
      setProviders((prev) => prev.filter((p) => p.id !== prov.id));
      setSuccessBanner(`Fournisseur "${prov.name}" supprimé.`);
      setTimeout(() => setSuccessBanner(null), 3000);
    } catch (err) {
      alert('Erreur de suppression : ' + (err.response?.data?.detail || err.message));
    }
  };

  // Filtered providers
  const filteredProviders = useMemo(() => {
    if (selectedFilter === 'ollama') return providers.filter((p) => p.provider_type === 'ollama');
    if (selectedFilter === 'cloud') return providers.filter((p) => p.provider_type !== 'ollama');
    if (selectedFilter === 'active') return providers.filter((p) => p.is_active);
    return providers;
  }, [providers, selectedFilter]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <NavBar />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
                <FiServer className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">Passerelle LLM (LLM Gateway)</h1>
                  <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
                    <FiShield className="mr-1 h-3 w-3" /> Administrateur
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-slate-500">
                  Orchestrez dynamiquement vos modèles locaux Ollama et vos fournisseurs Cloud avec repli automatique.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={loadProviders}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <FiRefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
            <button
              onClick={() => handleOpenCreate('ollama')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-500"
            >
              <FiCpu className="h-4 w-4" />
              + Connecter Ollama
            </button>
            <button
              onClick={() => handleOpenCreate('mistral')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-slate-900/20 transition hover:bg-slate-800"
            >
              <FiPlus className="h-4 w-4" />
              Ajouter un Fournisseur
            </button>
          </div>
        </div>

        {/* Success / Error Banner */}
        {successBanner && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-600/20 animate-fade-in">
            <FiCheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
            {successBanner}
          </div>
        )}
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-600/20 animate-fade-in">
            <FiAlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            {error}
          </div>
        )}

        {/* Overview Stats Cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Total Fournisseurs</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <FiLayers className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{stats.total}</span>
              <span className="text-xs font-semibold text-emerald-600">
                {stats.activeCount} actif{stats.activeCount > 1 ? 's' : ''}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {stats.ollamaCount} local (Ollama) · {stats.cloudCount} cloud
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Chat Général</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <FiActivity className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 truncate text-lg font-bold text-slate-900" title={stats.primaryChat}>
              {stats.primaryChat}
            </div>
            <div className="mt-2 text-xs text-slate-500">Modèle interactif par défaut</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Synthèse RAG</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <FiCpu className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 truncate text-lg font-bold text-slate-900" title={stats.primaryRag}>
              {stats.primaryRag}
            </div>
            <div className="mt-2 text-xs text-slate-500">Analyse et réponse documentaire</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Résumés & Questions</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <FiZap className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 truncate text-lg font-bold text-slate-900" title={stats.primarySummary}>
              {stats.primarySummary}
            </div>
            <div className="mt-2 text-xs text-slate-500">Extraction de points clés & suggestions</div>
          </div>
        </div>

        {/* Role Matrix & Fallback Chain Indicator */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
            Attribution des Rôles & Chaîne de Repli (Fallback)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Si le modèle primaire d'un rôle est indisponible ou rencontre un quota (HTTP 429), la passerelle bascule instantanément sur le modèle suivant de la chaîne.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES_DEF.map((role) => {
              const assigned = providers.filter((p) => p.is_active && p.assigned_roles?.includes(role.id));
              return (
                <div key={role.id} className="flex flex-col justify-between rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200/70">
                  <div>
                    <span className="text-xs font-semibold text-slate-900">{role.label}</span>
                    <p className="mt-0.5 text-[11px] text-slate-500 leading-tight">{role.desc}</p>
                  </div>
                  <div className="mt-3 flex flex-col gap-1.5">
                    {assigned.length === 0 ? (
                      <span className="rounded-md bg-slate-200/80 px-2 py-1 text-center text-xs font-medium text-slate-600">
                        Repli automatique sur .env
                      </span>
                    ) : (
                      assigned.map((p, idx) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                        >
                          <span className="flex items-center gap-1.5 truncate font-medium text-slate-800">
                            {idx === 0 ? (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                                1
                              </span>
                            ) : (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-300 text-[10px] font-bold text-slate-700">
                                {idx + 1}
                              </span>
                            )}
                            <span className="truncate">{p.model_name}</span>
                          </span>
                          <span className="ml-1 text-[10px] font-semibold text-slate-400">
                            {p.provider_type === 'ollama' ? 'Local' : 'Cloud'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Filter bar */}
        <div className="mt-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-1 rounded-xl bg-slate-200/70 p-1">
            <button
              onClick={() => setSelectedFilter('all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                selectedFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tous ({providers.length})
            </button>
            <button
              onClick={() => setSelectedFilter('ollama')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                selectedFilter === 'ollama' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ollama Local ({stats.ollamaCount})
            </button>
            <button
              onClick={() => setSelectedFilter('cloud')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                selectedFilter === 'cloud' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Fournisseurs Cloud ({stats.cloudCount})
            </button>
            <button
              onClick={() => setSelectedFilter('active')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                selectedFilter === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Actifs ({stats.activeCount})
            </button>
          </div>

          <span className="text-xs text-slate-500">
            {filteredProviders.length} modèle{filteredProviders.length > 1 ? 's' : ''} affiché{filteredProviders.length > 1 ? 's' : ''}
          </span>
        </div>

        {/* Provider Cards List */}
        {filteredProviders.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <FiServer className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-800">Aucun fournisseur configuré</h3>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              Vous pouvez connecter votre Ollama local tournant sur la machine hôte ou vos comptes Cloud Mistral, OpenAI, Groq pour piloter vos modèles.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => handleOpenCreate('ollama')}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-500"
              >
                Connecter Ollama Local
              </button>
              <button
                onClick={() => handleOpenCreate('mistral')}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Ajouter Cloud LLM
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filteredProviders.map((prov) => {
              const isOllama = prov.provider_type === 'ollama';
              const isTesting = testingMap[prov.id];
              const testResult = testResultMap[prov.id];

              return (
                <div
                  key={prov.id}
                  className={`flex flex-col justify-between rounded-2xl border bg-white p-5 shadow-sm transition ${
                    prov.is_active ? 'border-slate-200/90' : 'border-slate-200/50 opacity-75'
                  }`}
                >
                  <div>
                    {/* Card Top: Type, Name, Status Toggle */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            isOllama ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'
                          }`}
                        >
                          {isOllama ? <FiCpu className="h-5 w-5" /> : <FiCloud className="h-5 w-5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-900">{prov.name}</h3>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                isOllama
                                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20'
                                  : 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20'
                              }`}
                            >
                              {prov.provider_type}
                            </span>
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                              Priorité #{prov.priority}
                            </span>
                          </div>
                          <p className="font-mono text-xs font-semibold text-slate-600">{prov.model_name}</p>
                        </div>
                      </div>

                      {/* Active toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleActive(prov)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          prov.is_active ? 'bg-emerald-600' : 'bg-slate-300'
                        }`}
                        title={prov.is_active ? 'Désactiver' : 'Activer'}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            prov.is_active ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Endpoint URL & details */}
                    <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-2.5 text-xs">
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-slate-400">Endpoint :</span>
                        <span className="max-w-[280px] truncate font-mono text-[11px] text-slate-700 sm:max-w-[360px]" title={prov.base_url}>
                          {prov.base_url}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-slate-400">Clé API :</span>
                        <span className="font-mono text-[11px] text-slate-600">
                          {prov.api_key_masked || (isOllama ? 'Aucune (Ollama Local)' : 'Non configurée')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-slate-400">Température :</span>
                        <span className="font-mono text-[11px] text-slate-700">{prov.temperature ?? 0.6}</span>
                      </div>
                    </div>

                    {/* Roles Badges */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-medium text-slate-400">Rôles :</span>
                      {(!prov.assigned_roles || prov.assigned_roles.length === 0) ? (
                        <span className="text-xs italic text-slate-400">Aucun rôle direct (repli général)</span>
                      ) : (
                        prov.assigned_roles.map((rId) => {
                          const def = ROLES_DEF.find((d) => d.id === rId);
                          return (
                            <span
                              key={rId}
                              className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20"
                            >
                              {def?.label || rId}
                            </span>
                          );
                        })
                      )}
                    </div>

                    {/* Live Test feedback */}
                    {testResult && (
                      <div
                        className={`mt-3 flex items-center justify-between rounded-xl px-3 py-2 text-xs ${
                          testResult.success
                            ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20'
                            : 'bg-rose-50 text-rose-800 ring-1 ring-rose-600/20'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {testResult.success ? (
                            <FiCheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                          ) : (
                            <FiAlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                          )}
                          <span className="font-medium">{testResult.message}</span>
                        </div>
                        {testResult.latency_ms && (
                          <span className="font-mono font-bold text-emerald-700">⚡ {testResult.latency_ms} ms</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Bottom Actions */}
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => handleTestProvider(prov)}
                      disabled={isTesting}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      {isTesting ? (
                        <>
                          <FiRefreshCw className="h-3.5 w-3.5 animate-spin" />
                          Test en cours...
                        </>
                      ) : (
                        <>
                          <FiZap className="h-3.5 w-3.5 text-amber-500" />
                          Tester la connexion
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(prov)}
                        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                        title="Modifier"
                      >
                        <FiEdit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(prov)}
                        className="rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-50 hover:text-rose-700"
                        title="Supprimer"
                      >
                        <FiTrash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal Add / Edit Provider */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingProvider ? `Modifier ${editingProvider.name}` : 'Connecter un Nouveau Fournisseur LLM'}
                </h3>
                <p className="text-xs text-slate-500">
                  {editingProvider ? 'Ajustez les réglages et les rôles de ce modèle.' : 'Choisissez un préréglage ou personnalisez les paramètres.'}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {/* Presets Selector (only if creating) */}
            {!editingProvider && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-slate-700">Sélectionner un type :</label>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {Object.entries(PROVIDER_PRESETS).map(([key, p]) => {
                    const Icon = p.icon;
                    const isSelected = formType === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleSelectPreset(key)}
                        className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-medium transition ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-2 ring-indigo-600/20'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${isSelected ? 'text-indigo-600' : 'text-slate-500'}`} />
                        <span className="truncate">{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Nom d'affichage</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ex: Ollama Qwen 2.5"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                  />
                </div>

                {/* Base URL */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700">URL de Base (Endpoint)</label>
                    {formType === 'ollama' && (
                      <button
                        type="button"
                        onClick={() => triggerDetectOllama(formBaseUrl)}
                        disabled={detectingOllama}
                        className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                      >
                        {detectingOllama ? 'Détection...' : '🔍 Détecter les modèles'}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={formBaseUrl}
                    onChange={(e) => setFormBaseUrl(e.target.value)}
                    placeholder={formType === 'ollama' ? 'http://host.docker.internal:11434/v1' : 'https://api.mistral.ai/v1'}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                  />
                </div>
              </div>

              {/* Model selection / Text */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">Nom du Modèle</label>
                {detectedOllamaModels.length > 0 && formType === 'ollama' ? (
                  <div className="mt-1 flex gap-2">
                    <select
                      value={formModelName}
                      onChange={(e) => setFormModelName(e.target.value)}
                      className="w-full rounded-xl border border-emerald-300 bg-emerald-50/40 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                    >
                      {detectedOllamaModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.size_gb ? `${m.size_gb} GB` : ''} {m.param_size || ''})
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={formModelName}
                      onChange={(e) => setFormModelName(e.target.value)}
                      placeholder="Ou saisie manuelle"
                      className="w-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                    />
                  </div>
                ) : (
                  <div className="mt-1 flex flex-col gap-1.5">
                    <input
                      type="text"
                      required
                      value={formModelName}
                      onChange={(e) => setFormModelName(e.target.value)}
                      placeholder="Ex: qwen2.5:7b, mistral-small-latest, gpt-4o-mini"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                    />
                    {PROVIDER_PRESETS[formType]?.suggestedModels?.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-slate-400">Suggestions :</span>
                        {PROVIDER_PRESETS[formType].suggestedModels.map((sm) => (
                          <button
                            key={sm}
                            type="button"
                            onClick={() => setFormModelName(sm)}
                            className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 hover:bg-indigo-100 hover:text-indigo-800"
                          >
                            {sm}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* API Key (Optional for Ollama) */}
              {formType !== 'ollama' && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700">
                      Clé API {editingProvider && '(Laisser vide pour conserver l’actuelle)'}
                    </label>
                  </div>
                  <div className="relative mt-1">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={formApiKey}
                      onChange={(e) => setFormApiKey(e.target.value)}
                      placeholder={editingProvider?.has_api_key ? '••••••••••••••••' : 'sk-...'}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pr-10 font-mono text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showApiKey ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Roles assignment */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">Rôles assignés à ce modèle :</label>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {ROLES_DEF.map((role) => {
                    const isChecked = formRoles.includes(role.id);
                    return (
                      <label
                        key={role.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-xs transition ${
                          isChecked
                            ? 'border-indigo-600 bg-indigo-50/50 font-semibold text-indigo-900 ring-1 ring-indigo-600/20'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormRoles([...formRoles, role.id]);
                            } else {
                              setFormRoles(formRoles.filter((r) => r !== role.id));
                            }
                          }}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{role.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Priority & Temperature */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Priorité dans la chaîne (0 = Primaire, 1 = Repli 1, ...)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700">Température</label>
                    <span className="font-mono text-xs font-bold text-slate-700">{formTemperature}</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="1.5"
                    step="0.1"
                    value={formTemperature}
                    onChange={(e) => setFormTemperature(parseFloat(e.target.value))}
                    className="mt-2.5 w-full accent-indigo-600"
                  />
                </div>
              </div>

              {/* Live Modal Test Feedback */}
              {modalTestStatus && (
                <div
                  className={`rounded-xl px-4 py-3 text-xs ${
                    modalTestStatus.testing
                      ? 'bg-slate-100 text-slate-700'
                      : modalTestStatus.success
                      ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20'
                      : 'bg-rose-50 text-rose-800 ring-1 ring-rose-600/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {modalTestStatus.testing ? 'Test de connectivité en cours...' : modalTestStatus.message}
                    </span>
                    {modalTestStatus.latency_ms && (
                      <span className="font-mono font-bold text-emerald-700">⚡ {modalTestStatus.latency_ms} ms</span>
                    )}
                  </div>
                  {modalTestStatus.sample_reply && (
                    <div className="mt-1 font-mono text-[11px] text-emerald-700">
                      Réponse : "{modalTestStatus.sample_reply}"
                    </div>
                  )}
                </div>
              )}

              {/* Modal Buttons */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={handleTestModal}
                  disabled={modalTestStatus?.testing}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <FiZap className="h-4 w-4 text-amber-500" />
                  {modalTestStatus?.testing ? 'Test en cours...' : 'Tester cette configuration'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                  >
                    {editingProvider ? 'Enregistrer les modifications' : 'Créer le fournisseur'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
