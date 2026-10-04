import React, { useEffect, useRef } from 'react';
import { MessageBubble } from '../shared/MessageBubble';
import { HiOutlineSparkles } from "react-icons/hi";
import { LuFileText, LuHistory, LuUpload } from 'react-icons/lu';
import Loading from '../ui/Loading';

/**
 * Messages component for GeneralChat
 */
export const GeneralChatMessages = React.memo(({
  messages,
  isLoading,
  showingLetters,
  currentIndex,
  chatEndRef,
  onSuggestionClick,
  documentName,
  hasOlderMessages,
  isLoadingOlderMessages,
  onLoadOlderMessages,
  hasAvailableSources,
  onAddDocument,
}) => {
  const scrollContainerRef = useRef(null);
  const preserveScrollPositionRef = useRef(false);

  useEffect(() => {
    if (!preserveScrollPositionRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatEndRef]);

  const handleLoadOlderMessages = async () => {
    const scrollContainer = scrollContainerRef.current;
    const previousHeight = scrollContainer?.scrollHeight || 0;
    const previousTop = scrollContainer?.scrollTop || 0;
    preserveScrollPositionRef.current = true;

    await onLoadOlderMessages?.();

    requestAnimationFrame(() => {
      if (scrollContainer) {
        scrollContainer.scrollTop = previousTop + scrollContainer.scrollHeight - previousHeight;
      }
      preserveScrollPositionRef.current = false;
    });
  };

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6" aria-live="polite" aria-label="Chat messages">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col space-y-5">
        {messages.length > 0 && hasOlderMessages && (
          <div className="flex justify-center pb-1">
            <button
              type="button"
              onClick={handleLoadOlderMessages}
              disabled={isLoadingOlderMessages}
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-wait disabled:opacity-60"
            >
              <LuHistory className="text-sm" aria-hidden="true" />
              {isLoadingOlderMessages ? 'Chargement…' : 'Afficher les messages précédents'}
            </button>
          </div>
        )}
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-6">
            {documentName || !hasAvailableSources
              ? <LuFileText className="text-primary text-4xl" aria-hidden="true" />
              : <HiOutlineSparkles className="text-primary text-4xl" aria-hidden="true" />
            }
          </div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">{documentName ? 'Chat de document' : hasAvailableSources ? 'Chat Général' : 'Ajoutez votre premier document'}</h3>
          <p className="text-gray-500 max-w-md mb-6">
            {documentName
              ? <>Posez vos questions sur <span className="font-medium text-slate-700">{documentName}</span>.</>
              : hasAvailableSources
                ? <>Posez des questions sur l'ensemble de vos documents. L'IA analysera vos fichiers pour vous donner des réponses complètes.</>
                : <>Importez un document pour commencer. Il sera préparé automatiquement pour le chat.</>
            }
          </p>
          {!documentName && !hasAvailableSources ? (
            <button onClick={onAddDocument} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700">
              <LuUpload className="text-base" aria-hidden="true" />
              Ajouter un document
            </button>
          ) : <div className="flex flex-wrap gap-2 justify-center">
            <button 
              onClick={() => onSuggestionClick?.("Résumez les points clés de mes documents")}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-700 transition-colors"
              aria-label="Résumer les points clés"
            >
              Résumer les points clés
            </button>
            <button 
              onClick={() => onSuggestionClick?.("Quels sont les thèmes communs dans mes documents ?")}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-700 transition-colors"
              aria-label="Thèmes communs"
            >
              Thèmes communs
            </button>
            <button 
              onClick={() => onSuggestionClick?.("Comparez les informations dans mes différents documents")}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-700 transition-colors"
              aria-label="Comparer les documents"
            >
              Comparer les documents
            </button>
          </div>}
          </div>
        ) : (
          messages.map((message, index) => {
            const isLastMessage = index === messages.length - 1;
            return (
              <MessageBubble
                key={message.id || `${message.create_at}-${index}`}
                isUser={message.is_user_message}
                content={message.message}
                timestamp={message.create_at}
                showTyping={showingLetters && isLastMessage}
                typingIndex={currentIndex}
                documentsUsed={message.documents_used}
                chatEndRef={chatEndRef}
                isLastMessage={isLastMessage}
              />
            );
          })
        )}
        {isLoading && (
          <div className="w-[4rem]">
            <Loading color="#9ca3af" />
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
    </div>
  );
});

GeneralChatMessages.displayName = "GeneralChatMessages";
