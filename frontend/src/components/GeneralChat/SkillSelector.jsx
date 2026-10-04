import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  ShieldAlert, 
  FileSearch, 
  Briefcase, 
  CodeXml, 
  ChevronDown, 
  Check, 
  Settings, 
  Search,
  Bot,
  Zap,
  BookOpen
} from 'lucide-react';
import { Link } from 'react-router-dom';

// Icon resolver helper
export const getSkillIcon = (iconName, className = "w-4 h-4") => {
  const norm = (iconName || "").toLowerCase().trim();
  switch (norm) {
    case 'shieldalert':
    case 'shieldcheck':
    case 'shield':
      return <ShieldAlert className={className} />;
    case 'filesearch':
    case 'filetext':
    case 'search':
      return <FileSearch className={className} />;
    case 'briefcase':
    case 'business':
      return <Briefcase className={className} />;
    case 'codexml':
    case 'code':
    case 'terminal':
      return <CodeXml className={className} />;
    case 'zap':
      return <Zap className={className} />;
    case 'bookopen':
    case 'book':
      return <BookOpen className={className} />;
    case 'bot':
      return <Bot className={className} />;
    case 'sparkles':
    default:
      return <Sparkles className={className} />;
  }
};

export const SkillSelector = ({
  skills = [],
  activeSkill = null,
  onSelectSkill,
  isLoading = false,
  disabled = false,
  className = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredSkills = skills.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.description && s.description.toLowerCase().includes(q)) ||
      (s.slug && s.slug.toLowerCase().includes(q))
    );
  });

  const currentSkill = activeSkill || skills.find((s) => s.slug === 'cyber-audit-dnssi') || skills[0];

  return (
    <div className={`relative inline-block ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled || isLoading}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border shadow-sm ${
          isOpen
            ? "bg-indigo-50 border-indigo-300 text-indigo-700 ring-2 ring-indigo-500/20"
            : "bg-white/90 hover:bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300"
        } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        title="Sélectionner la compétence (persona & règles d'analyse RAG)"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="flex items-center justify-center p-1 rounded-full bg-indigo-100/80 text-indigo-600">
          {getSkillIcon(currentSkill?.icon, "w-3.5 h-3.5")}
        </span>
        <span className="truncate max-w-[140px] sm:max-w-[200px] font-semibold">
          {currentSkill?.name || "Compétence"}
        </span>
        {currentSkill?.is_system && (
          <span className="hidden sm:inline-block px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-slate-500 font-normal">
            Système
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 bottom-full mb-2 w-80 sm:w-96 rounded-2xl bg-white border border-slate-200 shadow-xl shadow-slate-900/10 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-3 bg-gradient-to-r from-slate-50 to-indigo-50/30 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Compétences RAG (SKILL.md)
              </span>
            </div>
            <Link
              to="/admin/skills"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              <Settings className="w-3 h-3" />
              Configurer
            </Link>
          </div>

          {/* Search bar if multiple skills */}
          {skills.length > 3 && (
            <div className="p-2 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs focus-within:border-indigo-400 focus-within:bg-white">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Rechercher une compétence..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent border-none outline-none text-xs text-slate-700 placeholder-slate-400"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Skill List */}
          <div className="max-h-72 overflow-y-auto p-1.5 space-y-1">
            {filteredSkills.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                Aucune compétence trouvée pour "{searchQuery}".
              </div>
            ) : (
              filteredSkills.map((skill) => {
                const isSelected = (currentSkill?.id === skill.id) || (currentSkill?.slug === skill.slug);
                return (
                  <button
                    key={skill.id || skill.slug}
                    type="button"
                    onClick={() => {
                      onSelectSkill(skill);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left p-2.5 rounded-xl transition-all flex items-start gap-3 ${
                      isSelected
                        ? "bg-indigo-50/80 border border-indigo-200/80 shadow-sm"
                        : "hover:bg-slate-50 border border-transparent"
                    }`}
                  >
                    <div className={`p-2 rounded-xl shrink-0 ${
                      isSelected ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-600"
                    }`}>
                      {getSkillIcon(skill.icon, "w-4 h-4")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs font-semibold truncate ${isSelected ? "text-indigo-950" : "text-slate-800"}`}>
                          {skill.name}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                        {skill.description || "Aucune description fournie."}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                        {skill.temperature !== null && skill.temperature !== undefined && (
                          <span className="text-slate-400">
                            Temp: <strong className="text-slate-600">{skill.temperature}</strong>
                          </span>
                        )}
                        {skill.is_system && (
                          <span className="px-1 py-0.5 rounded bg-slate-100 text-slate-500">
                            Système
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer note */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Règle active pour vos réponses RAG</span>
            <Link
              to="/admin/skills"
              onClick={() => setIsOpen(false)}
              className="text-indigo-600 hover:underline font-medium"
            >
              + Nouveau SKILL.md
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default SkillSelector;
