import React from 'react';
import { GoCheck } from 'react-icons/go';
import { LuFileText, LuMessageSquare, LuPanelRightClose, LuPlus } from 'react-icons/lu';
import { MdOutlineDeselect, MdOutlinePlayCircle, MdOutlineSelectAll } from 'react-icons/md';

export const SourcesSidebar = React.memo(({
  includedFiles,
  processedFiles,
  unprocessedFiles,
  excludedFiles,
  fileStatuses,
  onFileToggle,
  onIncludeAll,
  onExcludeAll,
  onProcessFile,
  onOpenDocuments,
  onOpenDocumentChat,
  onClose,
}) => (
  <aside className="flex w-[20rem] shrink-0 flex-col border-l border-slate-200 bg-white" aria-label="Sources">
    <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><LuFileText className="text-base text-primary" aria-hidden="true" /> Sources</p>
        <p className="mt-0.5 text-xs text-slate-400">{includedFiles.length} sur {processedFiles.length} incluses</p>
      </div>
      <div className="mb-3 flex items-center justify-end gap-1">
        <button type="button" onClick={onIncludeAll} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-primary focus:outline-none focus:ring-2 focus:ring-slate-300" aria-label="Tout inclure" title="Tout inclure">
          <MdOutlineSelectAll className="text-lg" aria-hidden="true" />
        </button>
        <button type="button" onClick={onExcludeAll} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300" aria-label="Tout exclure" title="Tout exclure">
          <MdOutlineDeselect className="text-lg" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">


      <div className="space-y-1.5" aria-label="Sources disponibles">
        {processedFiles.length === 0 ? (
          <div className="rounded-xl bg-slate-50 px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-700">Ajoutez votre premier document</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">Il sera préparé automatiquement pour le chat.</p>
            <button type="button" onClick={onOpenDocuments} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-700">
              <LuPlus className="text-sm" aria-hidden="true" />
              Ajouter un document
            </button>
          </div>
        ) : processedFiles.map((file) => {
          const isIncluded = !excludedFiles.includes(file.id);
          return (
            <div key={file.id} className={`group flex items-center gap-1.5 rounded-xl px-2 py-2 text-sm transition-colors ${isIncluded ? 'bg-slate-50 text-slate-700' : 'text-slate-400 hover:bg-slate-50'}`}>
              <button type="button" onClick={() => onFileToggle(file.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1.5 text-left">
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${isIncluded ? 'bg-primary text-white' : 'border border-slate-300 bg-white'}`}>
                  {isIncluded && <GoCheck className="text-xs" aria-hidden="true" />}
                </span>
                <span className="truncate">{file.file_name}</span>
              </button>
              <button type="button" onClick={() => onOpenDocumentChat(file)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-primary focus:outline-none focus:ring-2 focus:ring-slate-300" aria-label={`Ouvrir le chat de ${file.file_name}`} title="Ouvrir le chat de document">
                <LuMessageSquare className="text-base" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      {unprocessedFiles.filter((file) => (fileStatuses[file.id]?.status || file.processing_status) === 'failed').map((file) => (
        <div key={file.id} className="mt-2 flex items-center gap-2 rounded-lg bg-rose-50 px-2.5 py-2 text-xs text-rose-700">
          <span className="min-w-0 flex-1 truncate">{file.file_name}</span>
          <button type="button" onClick={() => onProcessFile(file.id)} className="flex shrink-0 items-center gap-1 font-medium hover:text-rose-900">
            <MdOutlinePlayCircle aria-hidden="true" /> Réessayer
          </button>
        </div>
      ))}
    </div>

    <footer className="space-y-2 border-t border-slate-100 px-3 py-3">
      <button type="button" onClick={onOpenDocuments} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300">
        <LuFileText className="text-base" aria-hidden="true" />
        Gérer les documents
      </button>
      <button type="button" onClick={onOpenDocuments} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400">
        <LuPlus className="text-base" aria-hidden="true" />
        Ajouter un document
      </button>
    </footer>
  </aside>
));

SourcesSidebar.displayName = 'SourcesSidebar';
