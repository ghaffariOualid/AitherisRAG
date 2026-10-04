import React from 'react';
import parse from 'html-react-parser';
import { LuChevronDown, LuFileText } from 'react-icons/lu';
import sanitizeHtml from '../../utils/sanitizeHtml';
import { time } from '../../utils/time';

/**
 * Shared MessageBubble component for consistent message rendering
 * @param {Object} props
 * @param {boolean} props.isUser - Whether the message is from the user
 * @param {string} props.content - Message content
 * @param {string} props.timestamp - Message timestamp
 * @param {boolean} props.showTyping - Whether to show typing animation
 * @param {number} props.typingIndex - Current typing index
 * @param {Array} props.documentsUsed - Array of documents used (optional)
 * @param {React.Ref} props.chatEndRef - Ref to scroll to bottom
 * @param {boolean} props.isLastMessage - Whether this is the last message
 */
export const MessageBubble = React.memo(({
  isUser,
  content,
  timestamp,
  showTyping = false,
  typingIndex = 0,
  documentsUsed = null,
  chatEndRef = null,
  isLastMessage = false,
}) => {
  const displayContent = showTyping && isLastMessage
    ? content.slice(0, typingIndex + 1)
    : content;
  // Older responses may contain the server's previous inline source footer.
  // Sources now live in the disclosure beneath the answer instead.
  const answerContent = isUser
    ? displayContent
    : displayContent.replace(/<p>\s*<strong>\s*Sources:\s*.*?<\/strong>\s*<\/p>\s*/is, '');
  const sourcePages = (pages) => {
    if (!Array.isArray(pages) || pages.length === 0) return null;
    return `${pages.length === 1 ? 'Page' : 'Pages'} ${pages.join(', ')}`;
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        ref={isLastMessage ? chatEndRef : null}
        className={`${isUser ? 'max-w-[80%] rounded-2xl px-5 py-3' : 'w-full py-2'} ${
          isUser
            ? "bg-[#f4f4f4] text-slate-800"
            : "text-slate-800"
        }`}
        role="article"
        aria-label={isUser ? "Your message" : "Assistant message"}
      >
        <div className="text-sm">
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{displayContent}</p>
          ) : (
            <div>
              <div className="prose prose-sm max-w-none response_style">
                {parse(sanitizeHtml(answerContent))}
              </div>
              {documentsUsed && documentsUsed.length > 0 && (
                <details className="group mt-4 border-t border-slate-100 pt-3">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800">
                    <LuFileText className="text-sm" aria-hidden="true" />
                    <span>Voir les sources</span>
                    <span className="text-slate-400">({documentsUsed.length})</span>
                    <LuChevronDown className="ml-0.5 text-sm transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <ul className="mt-3 space-y-1.5">
                    {documentsUsed.map((doc, index) => (
                      <li key={doc.id || index} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <span className="truncate">{doc.name || doc}</span>
                        {sourcePages(doc.pages) && <span className="ml-auto shrink-0 text-slate-400">{sourcePages(doc.pages)}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
        {timestamp && (
          <div className={`mt-2 text-xs ${isUser ? "text-slate-400" : "text-gray-400"}`}>
            {time(timestamp)}
          </div>
        )}
      </div>
    </div>
  );
});

MessageBubble.displayName = "MessageBubble";
