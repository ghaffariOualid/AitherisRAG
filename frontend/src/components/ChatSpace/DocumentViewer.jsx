import React, { Suspense, useEffect, useMemo, useState } from 'react';
import PdfViewer from '../Viewers/pdf_viewer';
import CSVViewer from '../Viewers/csv_viewer';
import TxtViewer from '../Viewers/txt_viewer';
import MdViewer from '../Viewers/md_viewer';
import Loading from '../ui/Loading';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';

/**
 * Document Viewer component that renders the appropriate viewer based on file type
 */
export const DocumentViewer = React.memo(({
  fileData,
  fileViewUrl,
  needsProcessing,
  processingStatus,
  isProcessing,
  onProcess
}) => {
  const fileType = useMemo(() => fileData?.file_type, [fileData?.file_type]);
  const axiosPrivate = useAxiosPrivate();
  const [securedFileUrl, setSecuredFileUrl] = useState('');
  const [isViewLoading, setIsViewLoading] = useState(false);
  const [viewError, setViewError] = useState('');

  useEffect(() => {
    if (!fileViewUrl) {
      setSecuredFileUrl('');
      return undefined;
    }

    let objectUrl = '';
    let isCurrent = true;
    setIsViewLoading(true);
    setViewError('');

    axiosPrivate.get(fileViewUrl, { responseType: 'blob' })
      .then((response) => {
        const nextObjectUrl = URL.createObjectURL(response.data);
        if (isCurrent) {
          objectUrl = nextObjectUrl;
          setSecuredFileUrl(nextObjectUrl);
        } else {
          URL.revokeObjectURL(nextObjectUrl);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setSecuredFileUrl('');
          setViewError('Unable to load this document. Please try again.');
        }
      })
      .finally(() => {
        if (isCurrent) setIsViewLoading(false);
      });

    return () => {
      isCurrent = false;
      // Give the viewer time to unmount before revoking the blob URL. Some
      // browser PDF/Markdown loaders read the URL asynchronously.
      if (objectUrl) {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
    };
  }, [axiosPrivate, fileViewUrl]);

  const renderViewer = () => {
    if (isViewLoading) {
      return (
        <div className="flex h-full items-center justify-center">
          <Loading padding={3} />
        </div>
      );
    }

    if (viewError) {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
          {viewError}
        </div>
      );
    }

    switch (fileType) {
      case 'PDF':
        return (
          <Suspense fallback={
            <div className="flex items-center justify-center h-full">
              <Loading padding={3} />
            </div>
          }>
            <PdfViewer url={securedFileUrl} />
          </Suspense>
        );
      case 'CSV':
        return <CSVViewer url={securedFileUrl} />;
      case 'TXT':
        return <TxtViewer url={securedFileUrl} />;
      case 'MD':
        return <MdViewer url={securedFileUrl} />;
      default:
        return null;
    }
  };

  if (!fileData) return null;

  return (
    <div className="relative h-full w-full">
      {renderViewer()}

      {/* Processing Overlay */}
      {needsProcessing && (
        <div
          className="absolute inset-0 flex justify-center items-center z-50 bg-black/65"
          role="dialog"
          aria-label="Document processing overlay"
        >
          {isProcessing || processingStatus !== 'failed' ? (
            <div className="flex flex-col items-center gap-3 text-center text-white">
              <Loading color="#ffffff" />
              <p className="text-sm font-medium">Preparing your document for chat…</p>
            </div>
          ) : (
            <button
              onClick={onProcess}
              className="border-dashed border-2 border-white py-3 px-8 rounded-lg text-white hover:bg-white/10 transition-colors"
              aria-label="Retry document processing"
            >
              Retry processing
            </button>
          )}
        </div>
      )}
    </div>
  );
});

DocumentViewer.displayName = "DocumentViewer";
