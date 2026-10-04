import { GoArrowRight, GoFile, GoSearch, GoShieldCheck, GoUpload } from "react-icons/go";
import useFileStore from '../stores/fileStore';
import useAuthStore from '../stores/authStore';
import { Link, useNavigate } from 'react-router-dom';
import NavBar from "./shared/navBar.jsx";
import Loading from "./ui/Loading.jsx";
import { useCallback, useEffect, useRef, useState } from 'react';
import useAxiosPrivate from "../hooks/useAxiosPrivate";
import { useToast } from './Toast/ToastContext';

const Landing = () => {
  const handleUploads = useFileStore((state) => state.handleUploads);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const navigate = useNavigate();
  const axiosInstance = useAxiosPrivate();
  const toast = useToast();
  const uploadInProgressRef = useRef(false);
  const pendingUploadAttemptedRef = useRef(false);

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });

  const base64ToFile = (base64, filename) => {
    const [metadata, data] = base64.split(',');
    const mime = metadata.match(/:(.*?);/)?.[1];
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new File([bytes], filename, { type: mime });
  };

  const uploadFiles = useCallback(async (selectedFiles) => {
    const files = Array.from(selectedFiles || []).filter(Boolean);
    if (files.length === 0 || uploadInProgressRef.current) return false;

    uploadInProgressRef.current = true;
    setIsUploading(true);
    setUploadProgress({ current: 0, total: files.length, fileName: files[0]?.name || '' });

    try {
      const results = await handleUploads(files, axiosInstance, ({ current, total, file }) => {
        setUploadProgress({ current, total, fileName: file.name });
      });
      const successfulUploads = results.filter((result) => result.response).length;
      const failedUploads = results.length - successfulUploads;

      if (successfulUploads > 0) {
        toast.success(
          `${successfulUploads} document${successfulUploads > 1 ? 's' : ''} ajouté${successfulUploads > 1 ? 's' : ''}. La préparation démarre automatiquement.`,
          'Importation terminée'
        );
      }
      if (failedUploads > 0) {
        toast.error(
          `${failedUploads} document${failedUploads > 1 ? 's n’ont' : ' n’a'} pas pu être importé${failedUploads > 1 ? 's' : ''}.`,
          'Importation incomplète'
        );
      }
      return successfulUploads > 0;
    } finally {
      uploadInProgressRef.current = false;
      setIsUploading(false);
      setUploadProgress(null);
    }
  }, [axiosInstance, handleUploads, toast]);

  useEffect(() => {
    const uploadPendingFile = async () => {
      const storedFile = localStorage.getItem('pendingFile');
      if (!storedFile || !token || !user || pendingUploadAttemptedRef.current) return;

      pendingUploadAttemptedRef.current = true;
      try {
        const { base64, name } = JSON.parse(storedFile);
        const didUpload = await uploadFiles([base64ToFile(base64, name)]);
        if (didUpload) {
          localStorage.removeItem('pendingFile');
          navigate('/general-chat');
        }
      } catch (error) {
        toast.error('Le fichier enregistré avant la connexion ne peut pas être relu. Choisissez-le à nouveau.', 'Importation impossible');
      }
    };

    void uploadPendingFile();
  }, [navigate, toast, token, uploadFiles, user]);

  const processFiles = async (selectedFiles) => {
    const files = Array.from(selectedFiles || []).filter(Boolean);
    if (files.length === 0) return;

    if (token && user) {
      const didUpload = await uploadFiles(files);
      if (didUpload) {
        navigate('/general-chat');
      }
      return;
    }

    if (files.length > 1) {
      toast.info('Connectez-vous, puis sélectionnez vos documents pour les importer ensemble.', 'Connexion requise');
      navigate('/user/login');
      return;
    }

    try {
      const [file] = files;
      const base64 = await fileToBase64(file);
      localStorage.setItem('pendingFile', JSON.stringify({ base64, name: file.name }));
      navigate('/user/login');
    } catch (error) {
      toast.error('Impossible de préparer ce fichier pour la connexion. Choisissez-le à nouveau.', 'Importation impossible');
    }
  };

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length > 0) void processFiles(files);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length > 0) void processFiles(files);
  };

  const scrollToUpload = () => document.getElementById('upload')?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <div className="aitheris-landing min-h-screen scroll-smooth overflow-x-hidden bg-[#fdfdfd] text-slate-900">
      <NavBar />

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-4 px-5 pb-16 pt-11 sm:px-8 md:pb-24 md:pt-16 lg:grid-cols-[0.83fr_1.17fr] lg:gap-0">
          <div className="relative z-10 max-w-xl lg:pb-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">RAG · vos documents, en conversation</p>
            <h1 className="mt-5 text-5xl font-semibold tracking-[-0.065em] text-slate-900 sm:text-6xl sm:leading-[1.02]">
              Transformez vos documents en <span className="text-primary">réponses fiables.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              RAG comprend vos fichiers, retrouve l’essentiel et vous aide à avancer avec des réponses reliées à vos sources.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button type="button" onClick={scrollToUpload} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/35 focus:ring-offset-2">
                Essayer maintenant
                <GoArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              {token && user && (
                <Link to="/general-chat" className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300">
                  Ouvrir mes conversations
                </Link>
              )}
            </div>
            <p className="mt-4 text-xs text-slate-400">Aucune carte bancaire · PDF, TXT, CSV ou MD</p>

            <div id="fonctionnalites" className="mt-9 grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600"><GoFile className="text-primary" aria-hidden="true" /> Réponses sourcées</div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600"><GoSearch className="text-primary" aria-hidden="true" /> Recherche ciblée</div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600"><GoShieldCheck className="text-primary" aria-hidden="true" /> Espace personnel</div>
            </div>
          </div>

          <div className="aitheris-hero-art">
            <img src={`${process.env.PUBLIC_URL}/aitheris-logo.png`} alt="Logo RAG — Aitheris" className="w-full select-none" draggable="false" />
          </div>
        </section>

        <section id="comment-ca-marche" className="border-t border-slate-200 bg-slate-50/55 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="mx-auto mb-10 max-w-xl text-center sm:mb-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Comment ça marche</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Quatre étapes simples, des réponses <span className="text-primary">utiles.</span></h2>
            </div>

            <div className="space-y-4">
              <article id="upload" className="scroll-mt-24 grid overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-2">
                <div className="flex flex-col justify-center px-6 py-9 sm:px-10 sm:py-12">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">01 — Ajouter</p>
                  <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Commencez par ce que vous avez déjà.</h3>
                  <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">Rapport, note ou export : déposez votre fichier. RAG prépare le contenu automatiquement pour le chat.</p>

                  <label
                    htmlFor="dropzone-file"
                    className={`mt-7 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-left transition-colors ${
                      isDragging ? 'border-primary bg-primary/5' : 'border-slate-300 hover:border-primary/60 hover:bg-slate-50'
                    } ${isUploading ? 'pointer-events-none opacity-70' : ''}`}
                    onDrop={handleDrop}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isDragging ? 'bg-primary text-white' : 'bg-slate-100 text-primary'}`}>
                      <GoUpload className="h-4 w-4" aria-hidden="true" />
                    </span>
                    {isUploading ? (
                      <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-700"><Loading /> <span className="truncate">Importation {uploadProgress?.current || 1}/{uploadProgress?.total || 1} · {uploadProgress?.fileName}</span></span>
                    ) : (
                      <span className="min-w-0"><span className="block text-sm font-medium text-slate-700">{isDragging ? 'Déposez vos documents ici' : 'Glissez vos fichiers ou cliquez pour parcourir'}</span><span className="mt-0.5 block text-xs text-slate-400">PDF, TXT, CSV ou MD · jusqu’à 200 Mo par fichier</span></span>
                    )}
                    <input id="dropzone-file" type="file" className="sr-only" accept=".pdf,.txt,.csv,.md" multiple disabled={isUploading} onChange={handleFileChange} />
                  </label>

                  {!token && <p className="mt-4 text-xs text-slate-500">Vous avez déjà un compte ? <Link to="/user/login" className="font-semibold text-primary hover:underline">Se connecter</Link></p>}
                </div>
                <div className="flex items-center bg-slate-50/70 px-5 py-7 sm:px-8">
                  <div className="aitheris-preview"><span className="aitheris-preview-label">✦ VOTRE BIBLIOTHÈQUE</span><h4>Vos connaissances, réunies.</h4><div className="aitheris-preview-row"><span>01</span>Rapport annuel.pdf</div><div className="aitheris-preview-row"><span>02</span>Notes de recherche.md</div><div className="aitheris-preview-row"><span>03</span>Données de suivi.csv</div></div>
                </div>
              </article>

              <article className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-2">
                <div className="flex items-center bg-slate-50/70 px-5 py-7 sm:px-8 lg:order-1">
                  <div className="aitheris-preview"><span className="aitheris-preview-label">✦ LECTURE INTELLIGENTE</span><h4>L’essentiel prend forme.</h4><div className="aitheris-preview-row"><span>01</span>Explorer le contenu</div><div className="aitheris-preview-row"><span>02</span>Identifier les idées clés</div><div className="aitheris-preview-row"><span>03</span>Relier les informations</div></div>
                </div>
                <div className="flex flex-col justify-center px-6 py-9 sm:px-10 sm:py-12 lg:order-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">02 — Comprendre</p>
                  <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Le contenu devient navigable.</h3>
                  <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">RAG repère les passages utiles pour vous aider à retrouver une information sans parcourir chaque page.</p>
                  <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-500"><span className="rounded-md border border-slate-200 px-2.5 py-1.5">Lecture des sources</span><span className="rounded-md border border-slate-200 px-2.5 py-1.5">Passages pertinents</span></div>
                </div>
              </article>

              <article className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-2">
                <div className="flex flex-col justify-center px-6 py-9 sm:px-10 sm:py-12">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">03 — Interroger</p>
                  <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Posez la question qui vous intéresse.</h3>
                  <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">Obtenez une réponse claire à partir de vos documents, puis ouvrez les pages citées pour vérifier ou approfondir.</p>
                  <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-500"><span className="rounded-md border border-slate-200 px-2.5 py-1.5">Réponses contextualisées</span><span className="rounded-md border border-slate-200 px-2.5 py-1.5">Sources et pages</span></div>
                </div>
                <div className="flex items-center bg-slate-50/70 px-5 py-7 sm:px-8">
                  <div className="aitheris-preview"><span className="aitheris-preview-label">✦ RÉPONSES SOURCÉES</span><h4>De la question à la clarté.</h4><div className="aitheris-preview-row"><span>01</span>Posez votre question</div><div className="aitheris-preview-row"><span>02</span>Retrouvez une réponse contextualisée</div><div className="aitheris-preview-row"><span>03</span>Consultez les passages cités</div></div>
                </div>
              </article>

              <article className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-2">
                <div className="flex items-center bg-slate-50/70 px-5 py-7 sm:px-8 lg:order-1">
                  <div className="aitheris-preview"><span className="aitheris-preview-label">✦ VOTRE ESPACE RAG</span><h4>Une pensée bien organisée.</h4><div className="aitheris-preview-row"><span>01</span>Documents et sources</div><div className="aitheris-preview-row"><span>02</span>Historique des conversations</div><div className="aitheris-preview-row"><span>03</span>Une recherche à poursuivre</div></div>
                </div>
                <div className="flex flex-col justify-center px-6 py-9 sm:px-10 sm:py-12 lg:order-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">04 — Continuer</p>
                  <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Votre espace reste organisé.</h3>
                  <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">Retrouvez vos documents et poursuivez vos conversations au même endroit, à votre rythme.</p>
                  {token && user && <Link to="/general-chat" className="mt-7 inline-flex w-fit items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700">Ouvrir mes conversations <GoArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
                </div>
              </article>
            </div>

            <section className="mt-12 rounded-2xl bg-primary px-6 py-8 text-white sm:mt-16 sm:flex sm:items-center sm:justify-between sm:px-10 sm:py-10">
              <div className="max-w-xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">Prêt à essayer ?</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Donnez une nouvelle voix à vos documents.</h2>
                <p className="mt-2 text-sm leading-6 text-white/80">Ajoutez un fichier et commencez votre première conversation.</p>
              </div>
              <button type="button" onClick={scrollToUpload} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-slate-100 sm:mt-0">Commencer <GoArrowRight className="h-4 w-4" aria-hidden="true" /></button>
            </section>
          </div>
        </section>


      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-7 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© 2026 RAG</p>
          <p>Vos documents, une conversation à la fois.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
