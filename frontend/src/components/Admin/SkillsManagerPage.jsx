import React, { useState, useEffect, useRef } from 'react';
import NavBar from '../shared/navBar';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import { useToast } from '../Toast/ToastContext';
import { 
  Sparkles, 
  ShieldAlert, 
  FileSearch, 
  Briefcase, 
  CodeXml, 
  Plus, 
  Save, 
  Trash2, 
  Copy, 
  Download, 
  Upload, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Check, 
  FileText, 
  Sliders, 
  Code, 
  Eye, 
  Bot, 
  Zap, 
  BookOpen, 
  Terminal,
  Search,
  CheckCircle
} from 'lucide-react';
import { getSkillIcon } from '../GeneralChat/SkillSelector';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const AVAILABLE_ICONS = [
  { id: 'Sparkles', name: 'Étoiles (Général)', icon: Sparkles },
  { id: 'ShieldAlert', name: 'Bouclier (Audit/Sécurité)', icon: ShieldAlert },
  { id: 'FileSearch', name: 'Loupe Document (Analyse)', icon: FileSearch },
  { id: 'Briefcase', name: 'Mallette (Direction/Business)', icon: Briefcase },
  { id: 'CodeXml', name: 'Code (Architecture/Dev)', icon: CodeXml },
  { id: 'Bot', name: 'Robot (Assistant)', icon: Bot },
  { id: 'Zap', name: 'Éclair (Rapide)', icon: Zap },
  { id: 'BookOpen', name: 'Livre (Connaissances)', icon: BookOpen },
];

export const SkillsManagerPage = () => {
  const axiosInstance = useAxiosPrivate();
  const toast = useToast();

  const [skills, setSkills] = useState([]);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [activeTab, setActiveTab] = useState('editor'); // 'editor', 'preview', 'form'
  const [searchQuery, setSearchQuery] = useState('');
  
  // Editor state
  const [rawContentMd, setRawContentMd] = useState('');
  const [validationResult, setValidationResult] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const fileInputRef = useRef(null);

  // Load skills list
  const loadSkills = async (selectSlug = null) => {
    try {
      setIsLoading(true);
      const response = await axiosInstance.get('/api/skills?include_inactive=true');
      const data = response.data || [];
      setSkills(data);

      if (data.length > 0) {
        let toSelect = data[0];
        if (selectSlug) {
          const found = data.find((s) => s.slug === selectSlug);
          if (found) toSelect = found;
        } else if (selectedSkill) {
          const found = data.find((s) => s.id === selectedSkill.id || s.slug === selectedSkill.slug);
          if (found) toSelect = found;
        }
        await loadSkillDetail(toSelect.slug || toSelect.id);
      } else {
        setSelectedSkill(null);
        setRawContentMd('');
      }
    } catch (error) {
      toast.error('Impossible de charger les compétences.', 'Erreur API');
    } finally {
      setIsLoading(false);
    }
  };

  // Load single skill full details (including content_md)
  const loadSkillDetail = async (idOrSlug) => {
    try {
      const response = await axiosInstance.get(`/api/skills/${idOrSlug}`);
      const fullSkill = response.data;
      setSelectedSkill(fullSkill);
      setRawContentMd(fullSkill.content_md || '');
      setIsDirty(false);
      setValidationResult(null);
    } catch (error) {
      toast.error('Erreur lors du chargement des détails de la compétence.');
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  // Live syntax validation
  const handleValidateSyntax = async (contentToValidate = rawContentMd) => {
    try {
      setIsValidating(true);
      const res = await axiosInstance.post('/api/skills/validate', { content_md: contentToValidate });
      setValidationResult(res.data);
      return res.data;
    } catch (err) {
      setValidationResult({ valid: false, errors: ["Erreur de communication avec le validateur."] });
      return { valid: false };
    } finally {
      setIsValidating(false);
    }
  };

  // Save skill changes
  const handleSaveSkill = async () => {
    if (!selectedSkill) return;

    // First validate
    const val = await handleValidateSyntax(rawContentMd);
    if (!val.valid) {
      toast.error("Veuillez corriger les erreurs de syntaxe avant d'enregistrer.");
      return;
    }

    try {
      setIsSaving(true);
      if (selectedSkill.id && !selectedSkill._isNew) {
        // Update
        const response = await axiosInstance.put(`/api/skills/${selectedSkill.id}`, {
          content_md: rawContentMd,
          is_active: selectedSkill.is_active,
        });
        toast.success(`Compétence '${response.data.name}' mise à jour !`);
        await loadSkills(response.data.slug);
      } else {
        // Create
        const response = await axiosInstance.post('/api/skills', {
          content_md: rawContentMd,
        });
        toast.success(`Compétence '${response.data.name}' créée avec succès !`);
        await loadSkills(response.data.slug);
      }
      setIsDirty(false);
    } catch (error) {
      const msg = error.response?.data?.detail || "Erreur lors de l'enregistrement de la compétence.";
      toast.error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setIsSaving(false);
    }
  };

  // Create new blank skill
  const handleCreateNewSkill = () => {
    const defaultTemplate = `---
name: "Nouvelle Compétence"
slug: "nouvelle-competence"
description: "Description claire du rôle et du domaine d'expertise de l'assistant."
icon: "Sparkles"
temperature: 0.5
roles:
  - "chat"
  - "rag"
tags:
  - "personnalise"
is_default: false
---
# Rôle & Persona
Tu es un assistant expert dédié à...

## Règles d'analyse documentaire
- Règle 1 : Analyser rigoureusement les informations fournies dans le contexte documentaire RAG.
- Règle 2 : Toujours citer la source documentaire.

## Format de réponse
Présenter une réponse claire, structurée et professionnelle.
`;

    const newSkillObj = {
      _isNew: true,
      name: "Nouvelle Compétence",
      slug: "nouvelle-competence",
      description: "Description de la compétence",
      icon: "Sparkles",
      is_active: true,
      is_system: false,
      temperature: 0.5,
      content_md: defaultTemplate,
      frontmatter: {
        name: "Nouvelle Compétence",
        slug: "nouvelle-competence",
        description: "Description de la compétence",
        icon: "Sparkles",
        temperature: 0.5,
      }
    };

    setSelectedSkill(newSkillObj);
    setRawContentMd(defaultTemplate);
    setIsDirty(true);
    setActiveTab('editor');
    setValidationResult(null);
  };

  // Duplicate current skill
  const handleDuplicateSkill = () => {
    if (!selectedSkill) return;

    let clonedContent = rawContentMd;
    const newSlug = `${selectedSkill.slug}-copie`.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    const newName = `${selectedSkill.name} (Copie)`;

    // Replace slug and name in YAML frontmatter
    clonedContent = clonedContent
      .replace(/slug:\s*["']?([^"'\n]+)["']?/, `slug: "${newSlug}"`)
      .replace(/name:\s*["']?([^"'\n]+)["']?/, `name: "${newName}"`);

    const clonedObj = {
      _isNew: true,
      name: newName,
      slug: newSlug,
      description: selectedSkill.description,
      icon: selectedSkill.icon,
      is_active: true,
      is_system: false,
      temperature: selectedSkill.temperature,
      content_md: clonedContent,
    };

    setSelectedSkill(clonedObj);
    setRawContentMd(clonedContent);
    setIsDirty(true);
    toast.info("Compétence dupliquée en tant que nouvelle compétence non enregistrée.");
  };

  // Delete custom skill
  const handleDeleteSkill = async () => {
    if (!selectedSkill || selectedSkill.is_system || selectedSkill._isNew) return;
    if (!window.confirm(`Confirmez-vous la suppression définitive de la compétence '${selectedSkill.name}' ?`)) return;

    try {
      await axiosInstance.delete(`/api/skills/${selectedSkill.id}`);
      toast.success(`Compétence '${selectedSkill.name}' supprimée.`);
      await loadSkills();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Impossible de supprimer la compétence.");
    }
  };

  // Download SKILL.md
  const handleDownloadSkillMd = () => {
    if (!rawContentMd) return;
    const blob = new Blob([rawContentMd], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${selectedSkill?.slug || 'skill'}.SKILL.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Import SKILL.md file
  const handleFileImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        setRawContentMd(text);
        setIsDirty(true);
        const val = await handleValidateSyntax(text);
        if (val.valid && val.metadata) {
          setSelectedSkill((prev) => ({
            ...(prev || {}),
            name: val.metadata.name || prev?.name,
            slug: val.metadata.slug || prev?.slug,
            description: val.metadata.description || prev?.description,
            icon: val.metadata.icon || prev?.icon,
            temperature: val.metadata.temperature !== undefined ? val.metadata.temperature : prev?.temperature,
          }));
          toast.success("Fichier SKILL.md importé avec succès.");
        } else {
          toast.warning("Fichier importé avec des avertissements ou erreurs de syntaxe.");
        }
      }
    };
    reader.readAsText(file);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Sync skills from disk
  const handleSyncDisk = async () => {
    try {
      setIsSyncing(true);
      const response = await axiosInstance.post('/api/skills/sync');
      toast.success(`${response.data.synced} compétence(s) système synchronisées depuis le disque.`);
      await loadSkills(selectedSkill?.slug);
    } catch (err) {
      toast.error("Échec de la synchronisation disque.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Form helper: update rawContentMd from visual form fields
  const handleFormFieldChange = (field, value) => {
    setIsDirty(true);
    let meta = selectedSkill?.frontmatter || {};
    meta = { ...meta, [field]: value };
    
    // Replace in rawContentMd
    let newContent = rawContentMd;
    const regex = new RegExp(`^${field}:.*$`, 'm');
    if (regex.test(newContent)) {
      const formattedVal = typeof value === 'string' ? `"${value}"` : value;
      newContent = newContent.replace(regex, `${field}: ${formattedVal}`);
    } else {
      // Insert right after ---
      newContent = newContent.replace(/^---\n/, `---\n${field}: "${value}"\n`);
    }

    setRawContentMd(newContent);
    setSelectedSkill(prev => ({
      ...prev,
      [field]: value,
      frontmatter: meta
    }));
  };

  const filteredSkills = skills.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q)) ||
      s.slug.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
      <NavBar />

      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Skill list */}
        <aside className="w-80 sm:w-96 flex flex-col border-r border-slate-200 bg-white shrink-0">
          {/* Sidebar Header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                Compétences (Skills)
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">Personas et consignes `SKILL.md`</p>
            </div>
            <button
              type="button"
              onClick={handleCreateNewSkill}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-semibold shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              Nouveau
            </button>
          </div>

          {/* Search & Actions Bar */}
          <div className="p-3 border-b border-slate-100 space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filtrer les compétences..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
              <span>{filteredSkills.length} compétence{filteredSkills.length > 1 ? 's' : ''} disponible{filteredSkills.length > 1 ? 's' : ''}</span>
              <button
                type="button"
                onClick={handleSyncDisk}
                disabled={isSyncing}
                className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                title="Resynchroniser les 5 skills système depuis les fichiers du disque"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                Sync disque
              </button>
            </div>
          </div>

          {/* Skills Scrollable List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-slate-400">Chargement des compétences...</div>
            ) : filteredSkills.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">Aucune compétence trouvée.</div>
            ) : (
              filteredSkills.map((skill) => {
                const isSelected = selectedSkill && (selectedSkill.id === skill.id || selectedSkill.slug === skill.slug);
                return (
                  <button
                    key={skill.id || skill.slug}
                    type="button"
                    onClick={() => {
                      if (isDirty && !window.confirm("Vous avez des modifications non enregistrées. Continuer ?")) return;
                      loadSkillDetail(skill.slug || skill.id);
                    }}
                    className={`w-full text-left p-3 rounded-2xl transition-all border flex items-start gap-3 ${
                      isSelected
                        ? "bg-indigo-50/80 border-indigo-200 shadow-sm"
                        : "hover:bg-slate-50/80 border-transparent hover:border-slate-100"
                    }`}
                  >
                    <div className={`p-2.5 rounded-xl shrink-0 ${
                      isSelected ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-600"
                    }`}>
                      {getSkillIcon(skill.icon, "w-4 h-4")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs font-bold truncate ${isSelected ? "text-indigo-950" : "text-slate-800"}`}>
                          {skill.name}
                        </span>
                        {skill.is_system ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 shrink-0">
                            Système
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 shrink-0">
                            Custom
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                        {skill.description || "Aucune description fournie."}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400">
                        <code className="bg-slate-100/80 px-1 py-0.5 rounded text-slate-600 font-mono">
                          {skill.slug}
                        </code>
                        {skill.temperature !== null && (
                          <span>T: {skill.temperature}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Area: Workspace / Editor */}
        <section className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
          {selectedSkill ? (
            <>
              {/* Workspace Top Bar */}
              <div className="px-6 py-4 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/20 shrink-0">
                    {getSkillIcon(selectedSkill.icon, "w-6 h-6")}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900 truncate">
                        {selectedSkill.name || "Sans titre"}
                      </h2>
                      {isDirty && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 animate-pulse">
                          Modifié
                        </span>
                      )}
                      {selectedSkill.is_system && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                          Système
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">
                      {selectedSkill.slug}.SKILL.md
                    </p>
                  </div>
                </div>

                {/* Main Action Buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Hidden File Input for Import */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".md,.txt"
                    onChange={handleFileImport}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors"
                    title="Importer un fichier SKILL.md existant"
                  >
                    <Upload className="w-3.5 h-3.5 text-slate-500" />
                    Importer
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadSkillMd}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors"
                    title="Télécharger le fichier .md"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    Télécharger
                  </button>

                  <button
                    type="button"
                    onClick={handleDuplicateSkill}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors"
                    title="Dupliquer comme nouvelle compétence personnalisée"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    Dupliquer
                  </button>

                  {!selectedSkill.is_system && !selectedSkill._isNew && (
                    <button
                      type="button"
                      onClick={handleDeleteSkill}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-medium text-rose-700 transition-colors"
                      title="Supprimer la compétence"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      Supprimer
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveSkill}
                    disabled={isSaving}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold text-white transition-all shadow-sm ${
                      isDirty
                        ? "bg-indigo-600 hover:bg-indigo-700 ring-2 ring-indigo-500/20"
                        : "bg-slate-800 hover:bg-slate-900"
                    }`}
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>
              </div>

              {/* Navigation Tabs (Editor / Preview / Form) */}
              <div className="px-6 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setActiveTab('editor')}
                    className={`py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                      activeTab === 'editor'
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Code className="w-4 h-4" />
                    Éditeur SKILL.md
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('preview');
                      handleValidateSyntax();
                    }}
                    className={`py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                      activeTab === 'preview'
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Eye className="w-4 h-4" />
                    Aperçu & Prompt compilé
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('form')}
                    className={`py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                      activeTab === 'form'
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Sliders className="w-4 h-4" />
                    Formulaire Guidé
                  </button>
                </div>

                {/* Quick validation button */}
                <button
                  type="button"
                  onClick={() => handleValidateSyntax()}
                  disabled={isValidating}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 font-medium py-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                  Valider syntaxe
                </button>
              </div>

              {/* Validation Banner if errors or warnings exist */}
              {validationResult && (
                <div className={`px-6 py-2.5 text-xs flex items-center gap-2 border-b ${
                  !validationResult.valid 
                    ? 'bg-rose-50 border-rose-200 text-rose-800' 
                    : validationResult.warnings?.length > 0 
                    ? 'bg-amber-50 border-amber-200 text-amber-800' 
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}>
                  {!validationResult.valid ? (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  )}
                  <div className="flex-1">
                    {!validationResult.valid ? (
                      <span>Erreurs de syntaxe : {validationResult.errors.join(' | ')}</span>
                    ) : validationResult.warnings?.length > 0 ? (
                      <span>Avertissements : {validationResult.warnings.join(' | ')}</span>
                    ) : (
                      <span>Syntaxe YAML et corps Markdown valides.</span>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 1: Code Editor */}
              {activeTab === 'editor' && (
                <div className="flex-1 p-6 flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-600">
                      Code source brut (Frontmatter YAML + Markdown)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Les balises YAML délimitées par `---` définissent les métadonnées de la compétence.
                    </span>
                  </div>
                  <div className="flex-1 relative rounded-2xl border border-slate-200 bg-slate-950 overflow-hidden shadow-inner flex flex-col">
                    <textarea
                      value={rawContentMd}
                      onChange={(e) => {
                        setRawContentMd(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full h-full p-4 font-mono text-xs text-emerald-400 bg-transparent resize-none focus:outline-none leading-relaxed"
                      placeholder="---&#10;name: Mon Skill&#10;slug: mon-skill&#10;---&#10;# Consignes..."
                      spellCheck={false}
                    />
                  </div>
                </div>
              )}

              {/* Tab 2: Live Preview */}
              {activeTab === 'preview' && (
                <div className="flex-1 p-6 overflow-y-auto space-y-6">
                  {/* Metadata Card */}
                  <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Métadonnées de la compétence
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 bg-white rounded-xl border border-slate-200/80">
                        <span className="text-slate-400 text-[11px]">Nom</span>
                        <p className="font-semibold text-slate-800 mt-0.5">{selectedSkill.name}</p>
                      </div>
                      <div className="p-3 bg-white rounded-xl border border-slate-200/80">
                        <span className="text-slate-400 text-[11px]">Slug</span>
                        <p className="font-mono font-semibold text-slate-800 mt-0.5">{selectedSkill.slug}</p>
                      </div>
                      <div className="p-3 bg-white rounded-xl border border-slate-200/80">
                        <span className="text-slate-400 text-[11px]">Température LLM</span>
                        <p className="font-semibold text-slate-800 mt-0.5">{selectedSkill.temperature ?? 0.6}</p>
                      </div>
                      <div className="p-3 bg-white rounded-xl border border-slate-200/80">
                        <span className="text-slate-400 text-[11px]">Type</span>
                        <p className="font-semibold text-slate-800 mt-0.5">
                          {selectedSkill.is_system ? 'Système RAGio' : 'Personnalisé'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Rendered Markdown Body */}
                  <div className="p-6 rounded-2xl border border-slate-200 bg-white">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 pb-2 border-b border-slate-100">
                      Consignes & Instructions compilées (Rendu Markdown)
                    </h3>
                    <div className="prose prose-sm max-w-none text-slate-800 prose-headings:text-slate-900 prose-code:text-indigo-600 prose-code:bg-slate-50 prose-code:px-1 prose-code:rounded">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {rawContentMd.replace(/^---\s*\n(.*?)\n---\s*\n/s, '')}
                      </ReactMarkdown>
                    </div>
                  </div>

                  {/* Prompt Simulation */}
                  <div className="p-4 rounded-2xl border border-indigo-100 bg-indigo-50/30">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900 mb-2 flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5" />
                      Simulation de l'injection dynamique dans LangChain
                    </h3>
                    <pre className="p-3 bg-white rounded-xl border border-indigo-200/60 text-[11px] font-mono text-slate-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
{`[INSTRUCTIONS DU SKILL: ${selectedSkill.name}]
${rawContentMd.replace(/^---\s*\n(.*?)\n---\s*\n/s, '').slice(0, 300)}...

RÈGLE LINGUISTIQUE: Répondre en Français.

CONTEXTE DOCUMENTAIRE (RAG):
{context}

HISTORIQUE DE CONVERSATION:
{memory}

QUESTION DE L'UTILISATEUR:
{question}`}
                    </pre>
                  </div>
                </div>
              )}

              {/* Tab 3: Guided Form Helper */}
              {activeTab === 'form' && (
                <div className="flex-1 p-6 overflow-y-auto space-y-5 max-w-3xl">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nom affiché
                      </label>
                      <input
                        type="text"
                        value={selectedSkill.name || ''}
                        onChange={(e) => handleFormFieldChange('name', e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Slug (identifiant unique)
                      </label>
                      <input
                        type="text"
                        value={selectedSkill.slug || ''}
                        disabled={selectedSkill.is_system}
                        onChange={(e) => handleFormFieldChange('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '-'))}
                        className={`w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500 ${
                          selectedSkill.is_system ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Description brève
                    </label>
                    <textarea
                      rows={2}
                      value={selectedSkill.description || ''}
                      onChange={(e) => handleFormFieldChange('description', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Icon Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                      Icône représentative
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {AVAILABLE_ICONS.map((ic) => {
                        const IconComponent = ic.icon;
                        const isChosen = (selectedSkill.icon || '').toLowerCase() === ic.id.toLowerCase();
                        return (
                          <button
                            key={ic.id}
                            type="button"
                            onClick={() => handleFormFieldChange('icon', ic.id)}
                            className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${
                              isChosen
                                ? 'bg-indigo-50 border-indigo-400 text-indigo-900 ring-2 ring-indigo-500/20'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <IconComponent className="w-4 h-4 text-indigo-600 shrink-0" />
                            <span className="text-[11px] truncate">{ic.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Temperature slider */}
                  <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700">
                        Température de réponse : <strong className="text-indigo-600 font-mono">{selectedSkill.temperature ?? 0.5}</strong>
                      </label>
                      <span className="text-[11px] text-slate-400">
                        {Number(selectedSkill.temperature) <= 0.3 ? 'Précis & Déterministe' : Number(selectedSkill.temperature) >= 0.7 ? 'Créatif & Développé' : 'Équilibré'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.05"
                      value={selectedSkill.temperature ?? 0.5}
                      onChange={(e) => handleFormFieldChange('temperature', parseFloat(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>0.0 (Audit strict)</span>
                      <span>0.5 (Standard)</span>
                      <span>1.0 (Synthèse libre)</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <Sparkles className="w-12 h-12 text-slate-300 mb-3" />
              <h3 className="text-sm font-semibold text-slate-600">Aucune compétence sélectionnée</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Sélectionnez une compétence dans le menu de gauche ou cliquez sur "+ Nouveau" pour créer un nouveau fichier SKILL.md.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default SkillsManagerPage;
