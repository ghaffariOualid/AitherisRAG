import React from 'react';
import { LuFileText, LuMessageSquare, LuUpload, LuX } from 'react-icons/lu';
import { RiDeleteBin6Line } from 'react-icons/ri';

export const DocumentManagerModal = React.memo(({
  isOpen,
  files,
  fileStatuses,
  isUploading,
  uploadProgress,
  onClose,
  onUpload,
  onOpenDocumentChat,
  onDelete,
  onRetry,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Manage documents">
      <section className="flex max-h-[min(44rem,calc(100vh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-900/20">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Documents</h2>
            <p className="mt-0.5 text-sm text-slate-500">Ajoutez, préparez et ouvrez vos sources.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Close documents">
            <LuX className="text-lg" aria-hidden="true" />
          </button>
        </header>

        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-4 text-sm font-medium text-slate-600 transition-colors hover:border-slate-500 hover:bg-slate-50 ${isUploading ? 'pointer-events-none opacity-60' : ''}`}>
            <LuUpload className="text-base" aria-hidden="true" />
            {isUploading
              ? `Importation ${uploadProgress?.current || 1}/${uploadProgress?.total || 1}`
              : 'Importer des documents'}
            <input type="file" className="sr-only" accept=".pdf,.txt,.csv,.md" multiple disabled={isUploading} onChange={(event) => onUpload(event.target.files, event)} />
          </label>
          <p className="mt-2 text-center text-xs text-slate-400">
            {isUploading && uploadProgress?.fileName
              ? `En cours : ${uploadProgress.fileName}`
              : 'Sélectionnez un ou plusieurs fichiers · PDF, TXT, CSV ou MD · 200 Mo maximum par fichier'}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 sm:px-6">
          {files.length === 0 ? (
            <div className="py-14 text-center text-sm text-slate-500">Importez un document pour commencer.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {files.map((file) => {
                const status = fileStatuses[file.id]?.status || file.processing_status || (file.processed ? 'completed' : 'processing');
                const isReady = status === 'completed' || file.processed;
                const isFailed = status === 'failed';
                return (
                  <li key={file.id} className="flex items-center gap-3 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><LuFileText aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{file.file_name}</p>
                      <p className={`mt-0.5 text-xs ${isReady ? 'text-emerald-600' : isFailed ? 'text-rose-600' : 'text-amber-600'}`}>
                        {isReady ? 'Prêt pour le chat' : isFailed ? 'La préparation a échoué' : 'Préparation du document…'}
                      </p>
                    </div>
                    {isReady && <button type="button" onClick={() => onOpenDocumentChat(file)} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700"><LuMessageSquare aria-hidden="true" /> Ouvrir les conversations</button>}
                    {isFailed && <button type="button" onClick={() => onRetry(file.id)} className="rounded-lg px-2 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50">Réessayer</button>}
                    <button type="button" onClick={() => onDelete(file.id)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Delete ${file.file_name}`}><RiDeleteBin6Line aria-hidden="true" /></button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
});

DocumentManagerModal.displayName = 'DocumentManagerModal';
