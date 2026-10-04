import React from 'react';
import { LuChevronLeft, LuChevronRight, LuMessageSquare, LuPanelRightClose, LuPlus, LuTrash2 } from 'react-icons/lu';
import { GoSignOut } from 'react-icons/go';
import useAuthStore from '../../stores/authStore';

const conversationDate = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

export const GeneralChatSidebar = React.memo(({
  sidebarCollapsed,
  setSidebarCollapsed,
  conversations,
  activeConversationId,
  isConversationsLoading,
  hasMoreConversations,
  isLoadingMoreConversations,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onLoadMoreConversations,
  activeDocument,
  documentConversations,
  activeDocumentConversationId,
  isDocumentConversationsLoading,
  onReturnToGeneral,
  onNewDocumentConversation,
  onSelectDocumentConversation,
  onDeleteDocumentConversation,
  isViewerOpen,
  onToggleViewer,
}) => {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const displayName = user?.first_name || user?.user_name || 'Mon compte';

  const handleLogout = async () => {
    await logout();
  };

  if (sidebarCollapsed) {
    return (
      <aside className="flex w-16 flex-col items-center border-r border-slate-200 bg-[#f7f7f8] py-3">
        <button type="button" onClick={() => setSidebarCollapsed(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-slate-900" aria-label="Open chat sidebar" title="Open sidebar">
          <LuChevronRight className="text-lg" aria-hidden="true" />
        </button>
        <button type="button" onClick={onNewChat} className="mt-3 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition-colors hover:bg-slate-700" aria-label="New chat" title="New chat">
          <LuPlus className="text-lg" aria-hidden="true" />
        </button>
        {user && <div className="mb-1 flex flex-col items-center gap-1.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white" title={displayName}>
            {displayName[0]?.toUpperCase()}
          </span>
          <button type="button" onClick={handleLogout} className="flex h-9 w-9 items-center justify-center rounded-lg text-rose-600 transition-colors hover:bg-rose-50" aria-label="Se déconnecter" title="Se déconnecter"><GoSignOut className="h-4 w-4" aria-hidden="true" /></button>
        </div>}
      </aside>
    );
  }

  return (
    <aside className="flex w-[19.5rem] shrink-0 flex-col border-r border-slate-200 bg-[#f7f7f8]">
      <div className="flex items-center gap-2 px-3 py-3">
        <button type="button" onClick={onNewChat} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700">
          <LuPlus className="text-base" aria-hidden="true" />
          Nouveau chat
        </button>
        <button type="button" onClick={() => setSidebarCollapsed(true)} className="flex h-10 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-slate-900" aria-label="Close chat sidebar" title="Close sidebar">
          <LuChevronLeft className="text-lg" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 ">
        {activeDocument && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-100 px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Chat de document</p>
                <p className="mt-1.5 truncate text-sm font-semibold text-slate-800">{activeDocument.file_name}</p>
              </div>

            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={onToggleViewer} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-primary shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/25">
                <LuPanelRightClose className="text-sm" aria-hidden="true" />
                {isViewerOpen ? 'Masquer le document' : 'Voir le document'}
              </button>
              <button type="button" onClick={onReturnToGeneral} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                <LuMessageSquare className="text-sm" aria-hidden="true" />
                Chat général
              </button>
            </div>
            <div className="mt-4 border-t border-slate-200 pt-3">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Conversations</p>
                <button type="button" onClick={onNewDocumentConversation} className="text-xs font-medium text-primary hover:text-primary/75">Nouveau</button>
              </div>
              {isDocumentConversationsLoading ? (
                <p className="px-1 py-2 text-xs text-slate-400">Chargement…</p>
              ) : documentConversations.length === 0 ? (
                <p className="px-1 py-2 text-xs leading-5 text-slate-400">Votre première question créera une conversation.</p>
              ) : (
                <div className="space-y-0.5">
                  {documentConversations.map((conversation) => {
                    const isActive = conversation.id === activeDocumentConversationId;
                    return (
                      <div key={conversation.id} className={`group flex items-center gap-2 rounded-lg px-2 py-2 ${isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'}`}>
                        <button type="button" onClick={() => onSelectDocumentConversation(conversation.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-current={isActive ? 'page' : undefined}>
                          <LuMessageSquare className="shrink-0 text-sm text-slate-400" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate text-xs">{conversation.title}</span>
                        </button>
                        <button type="button" onClick={() => onDeleteDocumentConversation(conversation.id)} className="rounded p-1 text-slate-400 transition-opacity hover:bg-rose-50 hover:text-rose-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100" aria-label={`Delete ${conversation.title}`}>
                          <LuTrash2 className="text-sm" aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        <p className="px-2 pb-2 pt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Conversations</p>
        <div className="space-y-0.5">
          {isConversationsLoading ? (
            <p className="px-2 py-3 text-xs text-slate-400">Chargement…</p>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-3 text-xs leading-5 text-slate-400">Vos conversations apparaîtront ici.</p>
          ) : conversations.map((conversation) => {
            const isActive = conversation.id === activeConversationId;
            return (
              <div key={conversation.id} className={`group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors ${isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'}`}>
                <button type="button" onClick={() => onSelectConversation(conversation.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-current={isActive ? 'page' : undefined}>
                  <LuMessageSquare className="shrink-0 text-sm text-slate-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm">{conversation.title}</span>
                </button>
                <span className="text-[10px] text-slate-400 group-hover:hidden">{conversationDate(conversation.updated_at)}</span>
                <button type="button" onClick={() => onDeleteConversation(conversation.id)} className="hidden rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 group-hover:block" aria-label={`Delete ${conversation.title}`}>
                  <LuTrash2 className="text-sm" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
        {!isConversationsLoading && hasMoreConversations && (
          <button
            type="button"
            onClick={onLoadMoreConversations}
            disabled={isLoadingMoreConversations}
            className="mt-2 w-full rounded-lg px-2 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-white hover:text-slate-800 disabled:cursor-wait disabled:opacity-60"
          >
            {isLoadingMoreConversations ? 'Chargement…' : 'Afficher plus de conversations'}
          </button>
        )}
      </div>
      {user && <div className="flex items-center gap-2.5 border-t border-slate-200 bg-white px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">{displayName[0]?.toUpperCase()}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-700">{displayName}</span><span className="block truncate text-xs text-slate-400">{user.email}</span></span>
          <button type="button" onClick={handleLogout} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-rose-600 transition-colors hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200" aria-label="Se déconnecter" title="Se déconnecter"><GoSignOut className="h-4 w-4" aria-hidden="true" /></button>
      </div>}

    </aside>
  );
});

GeneralChatSidebar.displayName = 'GeneralChatSidebar';
