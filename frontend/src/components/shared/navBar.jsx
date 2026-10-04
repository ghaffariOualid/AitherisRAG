import Brand from "./Brand";
import { Link, useLocation } from "react-router-dom";
import useAuthStore from "../../stores/authStore";
import { GoFileDirectory, GoSignOut, GoChevronDown } from "react-icons/go";
import { LuPanelRightClose } from "react-icons/lu";
import { useState, useRef, useEffect } from "react";
import { Workflow, Sparkles, Cpu, MessageSquare, Activity } from "lucide-react";

const NavBar = () => {
    const token = useAuthStore((state) => state.token);
    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);
    const [userDropMenu, setUserDropMenu] = useState(false);
    const [isSourcesSidebarOpen, setIsSourcesSidebarOpen] = useState(false);
    const dropdownRef = useRef(null);
    const location = useLocation();

    const handleLogout = () => {
        logout();
        setUserDropMenu(false);
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setUserDropMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        const syncSourcesSidebar = (event) => setIsSourcesSidebarOpen(Boolean(event.detail?.isOpen));
        window.addEventListener('ragio:sources-state', syncSourcesSidebar);
        return () => window.removeEventListener('ragio:sources-state', syncSourcesSidebar);
    }, []);

    const isGeneralChat = location.pathname === "/general-chat";
    const isLanding = location.pathname === "/";

    return (
        <header className={`sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-md ${isGeneralChat ? 'shrink-0' : ''}`}>
            <nav className={`${isGeneralChat ? 'flex h-[4.2rem]  w-full items-center justify-between px-4 sm:px-5' : 'mx-auto flex h-[4.4rem] max-w-6xl items-center justify-between gap-2 px-3 sm:px-8'}`}>
                {/* Logo */}
                <Link to={token ? "/general-chat" : "/"} className={`flex items-center ${isGeneralChat ? 'gap-2' : ''}`}>
                    <Brand />
                    {isGeneralChat && <span className="border-l border-slate-200 pl-2 text-sm font-medium text-slate-700">Chat Général</span>}
                </Link>

                {isLanding && (
                    <div className="hidden items-center gap-1 md:flex">
                        <a href="#fonctionnalites" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">Fonctionnalités</a>
                        <a href="#comment-ca-marche" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">Comment ça marche</a>
                    </div>
                )}

                {token && user && (
                    <div className="flex items-center gap-1 rounded-2xl bg-slate-100/90 p-1 border border-slate-200/80 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-xs">
                        <Link
                            to="/rag-workflows"
                            className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                                location.pathname === '/rag-workflows'
                                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 border border-transparent'
                            }`}
                            aria-current={location.pathname === '/rag-workflows' ? 'page' : undefined}
                        >
                            <Workflow className={`h-3.5 w-3.5 transition-colors ${
                                location.pathname === '/rag-workflows' ? 'text-primary' : 'text-slate-400 group-hover:text-slate-700'
                            }`} />
                            <span>RAG contrôlé</span>
                        </Link>

                        <Link
                            to="/admin/skills"
                            className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                                location.pathname === '/admin/skills'
                                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 border border-transparent'
                            }`}
                            aria-current={location.pathname === '/admin/skills' ? 'page' : undefined}
                        >
                            <Sparkles className={`h-3.5 w-3.5 transition-colors ${
                                location.pathname === '/admin/skills' ? 'text-emerald-600' : 'text-slate-400 group-hover:text-emerald-600'
                            }`} />
                            <span>Compétences</span>
                            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${
                                location.pathname === '/admin/skills'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-slate-200/80 text-slate-600 group-hover:bg-emerald-50 group-hover:text-emerald-700'
                            }`}>
                                MD
                            </span>
                        </Link>

                        {user.is_admin && (
                            <>
                                <Link
                                    to="/admin/llm-gateway"
                                    className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                                        location.pathname === '/admin/llm-gateway'
                                            ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 border border-transparent'
                                    }`}
                                    aria-current={location.pathname === '/admin/llm-gateway' ? 'page' : undefined}
                                >
                                    <Cpu className={`h-3.5 w-3.5 transition-colors ${
                                        location.pathname === '/admin/llm-gateway' ? 'text-indigo-600' : 'text-slate-400 group-hover:text-indigo-600'
                                    }`} />
                                    <span>Passerelle LLM</span>
                                </Link>

                                <Link
                                    to="/admin/observability"
                                    className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                                        location.pathname === '/admin/observability'
                                            ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 border border-transparent'
                                    }`}
                                    aria-current={location.pathname === '/admin/observability' ? 'page' : undefined}
                                >
                                    <Activity className={`h-3.5 w-3.5 transition-colors ${
                                        location.pathname === '/admin/observability' ? 'text-violet-600' : 'text-slate-400 group-hover:text-violet-600'
                                    }`} />
                                    <span>Observabilité</span>
                                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${
                                        location.pathname === '/admin/observability'
                                            ? 'bg-violet-100 text-violet-800'
                                            : 'bg-slate-200/80 text-slate-600 group-hover:bg-violet-50 group-hover:text-violet-700'
                                    }`}>
                                        LF
                                    </span>
                                </Link>
                            </>
                        )}
                    </div>
                )}

                {/* Auth Section */}
                <div className="flex items-center gap-3">
                    {isGeneralChat && (
                        <button
                            type="button"
                            onClick={() => window.dispatchEvent(new Event('ragio:toggle-sources'))}
                            className={`hidden items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all sm:flex ${
                                isSourcesSidebarOpen
                                    ? 'bg-slate-900 text-white shadow-sm hover:bg-slate-800'
                                    : 'bg-slate-100/90 text-slate-700 hover:bg-slate-200 hover:text-slate-900 border border-slate-200/80'
                            }`}
                        >
                            {isSourcesSidebarOpen ? <LuPanelRightClose className="h-3.5 w-3.5" /> : <GoFileDirectory className="h-3.5 w-3.5" />}
                            <span>{isSourcesSidebarOpen ? 'Fermer documents' : 'Documents'}</span>
                        </button>
                    )}
                    {token && user ? (
                        <div className="relative" ref={dropdownRef}>
                            <button
                                type="button"
                                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                onClick={() => setUserDropMenu((isOpen) => !isOpen)}
                                aria-expanded={userDropMenu}
                                aria-haspopup="menu"
                                aria-label="Open account menu"
                            >
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white">
                                    {user.first_name?.[0]?.toUpperCase() || user.user_name?.[0]?.toUpperCase()}
                                </div>
                                <span className="hidden max-w-28 truncate text-sm font-medium text-slate-700 sm:block">
                                    {user.user_name}
                                </span>
                                <GoChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${userDropMenu ? 'rotate-180' : ''}`} />
                            </button>

                            {userDropMenu && (
                                <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10 animate-fade-in" role="menu">
                                    <div className="px-3 py-3">
                                        <p className="truncate text-sm font-semibold text-slate-800">
                                            {user.first_name || user.last_name ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : user.user_name}
                                        </p>
                                        <p className="mt-0.5 truncate text-xs text-slate-500">{user.email}</p>
                                        {user.is_admin && (
                                            <span className="mt-1 inline-flex items-center rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                                                Administrateur
                                            </span>
                                        )}
                                    </div>
                                    <div className="border-t border-slate-100 p-1.5">
                                        <Link
                                            to="/general-chat"
                                            onClick={() => setUserDropMenu(false)}
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                                            role="menuitem"
                                        >
                                            <MessageSquare className="h-4 w-4 text-slate-500" />
                                            Chat Général
                                        </Link>
                                        <Link
                                            to="/rag-workflows"
                                            onClick={() => setUserDropMenu(false)}
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                                            role="menuitem"
                                        >
                                            <Workflow className="h-4 w-4 text-slate-500" />
                                            RAG contrôlé
                                        </Link>
                                        <Link
                                            to="/admin/skills"
                                            onClick={() => setUserDropMenu(false)}
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                                            role="menuitem"
                                        >
                                            <Sparkles className="h-4 w-4 text-emerald-600" />
                                            Compétences (SKILL.md)
                                        </Link>
                                    </div>
                                    {user.is_admin && (
                                        <div className="border-t border-slate-100 p-1.5">
                                            <Link
                                                to="/admin/llm-gateway"
                                                onClick={() => setUserDropMenu(false)}
                                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-50"
                                                role="menuitem"
                                            >
                                                <Cpu className="h-4 w-4 text-indigo-600" />
                                                Passerelle LLM
                                            </Link>
                                        </div>
                                    )}
                                    <div className="border-t border-slate-100 p-1.5">
                                        <button
                                            type="button"
                                            onClick={handleLogout}
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
                                            role="menuitem"
                                        >
                                            <GoSignOut className="h-4 w-4" aria-hidden="true" />
                                            Se déconnecter
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (

                        <div className="flex items-center gap-1 sm:gap-2">
                            <Link
                                to="/user/login"
                                className="rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 sm:px-3"
                            >
                                Se connecter
                            </Link>
                            <Link
                                to="/user/register"
                                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 sm:px-4"
                            >
                                S'inscrire
                            </Link>
                        </div>
                    )}
                </div>
            </nav>

        </header>
    );
};

export default NavBar;
