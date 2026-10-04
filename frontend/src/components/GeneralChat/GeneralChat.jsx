import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import useFetch from "../../hooks/useFetch";
import Loading from "../ui/Loading";
import useAxiosPrivate from "../../hooks/useAxiosPrivate";
import { useToast } from "../Toast/ToastContext";
import { useTypingAnimation } from "../../hooks/useTypingAnimation";
import { useFileHelpers } from "../../hooks/useFileHelpers";
import useFileStore from "../../stores/fileStore";
import { DocumentViewer } from "../ChatSpace/DocumentViewer";
import { CustomPanelResizeHandle } from "../ChatSpace/PanelResizeHandle";
import { BASE_URL } from "../../utils/axios";
import { LuPanelRightClose } from "react-icons/lu";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { GeneralChatSidebar } from "./GeneralChatSidebar";
import { SourcesSidebar } from "./SourcesSidebar";
import { GeneralChatMessages } from "./GeneralChatMessages";
import { GeneralChatInput } from "./GeneralChatInput";
import { DocumentManagerModal } from "./DocumentManagerModal";

// Constants
const POLL_INTERVAL = 3000; // 3 seconds
const POLL_TIMEOUT = 1800000; // 30 minutes for large documents (200+ pages)
const DOCUMENT_SPLIT_MIN_WIDTH = 1280;
const CONVERSATIONS_PAGE_SIZE = 20;
const CHAT_HISTORY_PAGE_SIZE = 20;
const DOCUMENT_CONVERSATIONS_PAGE_SIZE = 20;
const SOURCES_SIDEBAR_DEFAULT_MIN_WIDTH = 1100;
const MAX_DOCUMENTS = 20;

function GeneralChat() {
  const {
    data: filesData,
    isLoading: filesIsLoading,
    fetchData: fetchFiles,
  } = useFetch('/api/document/files');

  const [excludedFiles, setExcludedFiles] = useState([]);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState("Auto-detect");
  const [model, setModel] = useState("Mistral");
  const [skills, setSkills] = useState([]);
  const [activeSkill, setActiveSkill] = useState(null);
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [isConversationsLoading, setIsConversationsLoading] = useState(true);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [nextConversationOffset, setNextConversationOffset] = useState(null);
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isSourcesSidebarOpen, setIsSourcesSidebarOpen] = useState(() => window.innerWidth >= SOURCES_SIDEBAR_DEFAULT_MIN_WIDTH);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [activeDocument, setActiveDocument] = useState(null);
  const [documentConversations, setDocumentConversations] = useState([]);
  const [activeDocumentConversationId, setActiveDocumentConversationId] = useState(null);
  const [isDocumentConversationsLoading, setIsDocumentConversationsLoading] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [nextMessageBeforeId, setNextMessageBeforeId] = useState(null);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [isDesktopDocumentLayout, setIsDesktopDocumentLayout] = useState(() => window.innerWidth >= DOCUMENT_SPLIT_MIN_WIDTH);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const chatEndRef = useRef(null);
  const axiosInstance = useAxiosPrivate();
  const toast = useToast();
  const handleUploads = useFileStore((state) => state.handleUploads);

  const { allFiles, processedFiles, unprocessedFiles } = useFileHelpers(filesData);
  const { currentIndex, showingLetters, setShowingLetters } = useTypingAnimation(
    messages.length > 0 && !messages[messages.length - 1]?.is_user_message, // isActive
    messages,
    10, // baseDelay
    5,  // delayRange
    5,  // baseIncrement
    4   // incrementRange
  );

  // Track file processing statuses: { fileId: { status, message, error, startTime } }
  const [fileStatuses, setFileStatuses] = useState({});
  const fileStatusesRef = useRef({});
  // Store interval IDs for cleanup
  const pollIntervalsRef = useRef({});

  useEffect(() => {
    fileStatusesRef.current = fileStatuses;
  }, [fileStatuses]);

  useEffect(() => {
    const updateDocumentLayout = () => setIsDesktopDocumentLayout(window.innerWidth >= DOCUMENT_SPLIT_MIN_WIDTH);
    window.addEventListener('resize', updateDocumentLayout);
    return () => window.removeEventListener('resize', updateDocumentLayout);
  }, []);

  useEffect(() => {
    if (activeDocument && isViewerOpen && window.innerWidth < 1600) {
      setIsSourcesSidebarOpen(false);
    }
  }, [activeDocument, isViewerOpen]);

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(pollIntervalsRef.current).forEach(intervalId => {
        clearInterval(intervalId);
      });
    };
  }, []);

  // Fetch available AI skills (SKILL.md)
  useEffect(() => {
    let isMounted = true;
    const loadSkills = async () => {
      try {
        const response = await axiosInstance.get('/api/skills');
        if (isMounted && response.data && Array.isArray(response.data)) {
          setSkills(response.data);
          const defaultSkill = response.data.find((s) => s.slug === 'cyber-audit-dnssi') || response.data[0];
          setActiveSkill((prev) => prev || defaultSkill);
        }
      } catch (err) {
        console.warn("Failed to load skills:", err);
      }
    };
    loadSkills();
    return () => { isMounted = false; };
  }, [axiosInstance]);

  // Check initial statuses when files load (for files that might be processing)
  useEffect(() => {
    if (!filesData || filesIsLoading) return;

    const checkInitialStatuses = async () => {
      const allFileIds = [];
      Object.values(filesData).forEach(fileList => {
        fileList.forEach(file => {
          // Only check files that aren't already marked as processed
          if (!file.processed) {
            allFileIds.push(file.id);
          }
        });
      });

      // Check status for unprocessed files
      for (const fileId of allFileIds) {
        try {
          const response = await axiosInstance.get(`/api/document/process/status/${fileId}`);
          const statusData = response.data;

          // If file is currently processing, start polling
          if (statusData.status === 'processing') {
            setFileStatuses(prev => ({
              ...prev,
              [fileId]: { ...statusData, startTime: Date.now() }
            }));
            startPolling(fileId);
          }
        } catch (error) {
          // Ignore errors for initial check
        }
      }
    };

    checkInitialStatuses();
  }, [filesData, filesIsLoading, axiosInstance]);

  const loadConversations = useCallback(async ({ offset = 0, append = false } = {}) => {
    if (append) setIsLoadingMoreConversations(true);
    else setIsConversationsLoading(true);
    try {
      const response = await axiosInstance.get('/api/chat/general/conversations', {
        params: { limit: CONVERSATIONS_PAGE_SIZE, offset },
      });
      const page = response.data?.conversations || [];
      setConversations((current) => append ? [...current, ...page] : page);
      setHasMoreConversations(Boolean(response.data?.has_more));
      setNextConversationOffset(response.data?.next_offset ?? null);
    } catch (error) {
      toast.error('Unable to load your conversation history.', 'Chat history');
    } finally {
      if (append) setIsLoadingMoreConversations(false);
      else setIsConversationsLoading(false);
    }
  }, [axiosInstance, toast]);

  // Load files and durable conversation history.
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const openDocuments = () => setIsDocumentModalOpen(true);
    window.addEventListener('ragio:open-documents', openDocuments);
    return () => window.removeEventListener('ragio:open-documents', openDocuments);
  }, []);

  useEffect(() => {
    const toggleSources = () => setIsSourcesSidebarOpen((isOpen) => !isOpen);
    window.addEventListener('ragio:toggle-sources', toggleSources);
    return () => window.removeEventListener('ragio:toggle-sources', toggleSources);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('ragio:sources-state', {
      detail: { isOpen: isSourcesSidebarOpen },
    }));
  }, [isSourcesSidebarOpen]);

  // Files that are currently included (not excluded)
  const includedFiles = useMemo(() =>
    processedFiles.filter(f => !excludedFiles.includes(f.id)),
    [processedFiles, excludedFiles]
  );
  const activeDocumentViewUrl = useMemo(
    () => activeDocument ? `${BASE_URL}/api/document/file/${activeDocument.id}/view` : '',
    [activeDocument]
  );

  // Toggle file inclusion/exclusion
  const handleFileToggle = useCallback((fileId) => {
    setExcludedFiles(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)  // Remove from excluded (include it)
        : [...prev, fileId]                  // Add to excluded (exclude it)
    );
  }, []);

  // Include all files (clear exclusions)
  const handleIncludeAll = useCallback(() => {
    setExcludedFiles([]);
  }, []);

  // Exclude all files
  const handleExcludeAll = useCallback(() => {
    setExcludedFiles(processedFiles.map(f => f.id));
  }, [processedFiles]);

  const handleSubmit = async (question_p = "") => {
    const activeFilesCount = activeDocument ? 1 : includedFiles.length;

    if (activeFilesCount === 0) {
      alert("Veuillez inclure au moins un document pour discuter.");
      return;
    }

    const finalQuestion = question_p.trim() || question.trim();
    if (!finalQuestion) {
      alert("Veuillez saisir une question.");
      return;
    }

    setShowingLetters(false);
    setIsLoading(true);
    const currentTime = new Date();
    const formattedTime = currentTime.toISOString();

    setMessages((previousMessages) => [
      ...previousMessages,
      { message: finalQuestion, is_user_message: true, create_at: formattedTime },
    ]);

    setQuestion("");

    try {
      const response = activeDocument
        ? await axiosInstance.post(`/api/chat/${activeDocument.id}`, {
            question: finalQuestion,
            document: activeDocument.id,
            language: language,
            model: model,
            skill_slug: activeSkill?.slug,
            skill_id: activeSkill?.id,
            conversation_id: activeDocumentConversationId,
          })
        : await axiosInstance.post('/api/chat/general', {
            question: finalQuestion,
            excluded_file_ids: excludedFiles,
            conversation_id: activeConversationId,
            language: language,
            model: model,
            skill_slug: activeSkill?.slug,
            skill_id: activeSkill?.id,
          });

      const responseTime = new Date();
      const responseFormattedTime = responseTime.toISOString();

      const newMessage = {
        message: response.data.message,
        is_user_message: false,
        create_at: responseFormattedTime,
        documents_used: activeDocument
          ? [{ id: activeDocument.id, name: activeDocument.file_name }]
          : response.data.documents_used,
        total_documents: response.data.total_documents,
      };

      setMessages((prevMessages) => [...prevMessages, newMessage]);
      if (!activeDocument && response.data.conversation_id) {
        setActiveConversationId(response.data.conversation_id);
      }
      if (activeDocument && response.data.conversation_id) {
        setActiveDocumentConversationId(response.data.conversation_id);
        setDocumentConversations((current) => {
          const existingConversation = current.find((conversation) => conversation.id === response.data.conversation_id);
          if (!existingConversation) {
            return [{
              id: response.data.conversation_id,
              file_id: activeDocument.id,
              title: finalQuestion.slice(0, 120),
              created_at: responseFormattedTime,
              updated_at: responseFormattedTime,
            }, ...current];
          }
          return current.map((conversation) => (
            conversation.id === response.data.conversation_id
              ? { ...conversation, title: conversation.title === 'Nouvelle conversation' ? finalQuestion.slice(0, 120) : conversation.title, updated_at: responseFormattedTime }
              : conversation
          ));
        });
      }
      if (!activeDocument) await loadConversations();
      setShowingLetters(true); // Trigger typing animation
    } catch (error) {
      const errorMessage = error.response?.data?.detail || "Une erreur s'est produite. Veuillez réessayer.";
      setMessages((prevMessages) => [
        ...prevMessages,
        {
          message: errorMessage,
          is_user_message: false,
          create_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Poll status for a specific file
  const pollStatus = async (fileId) => {
    try {
      const response = await axiosInstance.get(`/api/document/process/status/${fileId}`);
      const statusData = response.data;

      const currentStatus = fileStatusesRef.current[fileId] || {};
      const startTime = currentStatus.startTime || Date.now();
      const wasProcessing = currentStatus.status === 'processing';
      let nextStatus = { ...statusData, startTime };

      if (Date.now() - startTime > POLL_TIMEOUT) {
        stopPolling(fileId);
        nextStatus = {
          ...statusData,
          status: 'failed',
          error: 'Processing timed out. Please try again.',
          startTime
        };
        toast.error('Processing timed out. Please try again.', 'Timeout');
      } else if (statusData.status === 'completed' || statusData.status === 'failed') {
        stopPolling(fileId);
        if (statusData.status === 'completed') {
          fetchFiles();
          if (wasProcessing) {
            toast.success('Document processed successfully! Ready to chat.', 'Complete');
          }
        } else if (wasProcessing) {
          toast.error(statusData.error || 'Processing failed. Please try again.', 'Failed');
        }
      }

      fileStatusesRef.current = {
        ...fileStatusesRef.current,
        [fileId]: nextStatus
      };
      setFileStatuses((previous) => ({
        ...previous,
        [fileId]: nextStatus
      }));

      return statusData;
    } catch (error) {
      return null;
    }
  };

  // Stop polling for a file
  const stopPolling = (fileId) => {
    if (pollIntervalsRef.current[fileId]) {
      clearInterval(pollIntervalsRef.current[fileId]);
      delete pollIntervalsRef.current[fileId];
    }
  };

  // Start polling for a file
  const startPolling = (fileId) => {
    // Clear any existing polling for this file
    stopPolling(fileId);

    // Start new polling interval
    pollIntervalsRef.current[fileId] = setInterval(() => {
      pollStatus(fileId);
    }, POLL_INTERVAL);
  };

  // Handle file processing
  const handleProcessFile = async (fileId) => {
    try {
      // Set initial processing state
      setFileStatuses(prev => ({
        ...prev,
        [fileId]: {
          status: 'processing',
          message: 'Starting processing...',
          startTime: Date.now()
        }
      }));

      toast.info('Retrying document processing. This may take a few moments...', 'Retrying');

      // Call the process endpoint
      const response = await axiosInstance.get(`/api/document/process/${fileId}`);
      const result = response.data;

      if (result.status === 'completed') {
        // Already completed
        setFileStatuses(prev => ({
          ...prev,
          [fileId]: { ...result, startTime: prev[fileId]?.startTime }
        }));
        await fetchFiles();
        toast.success('Document processed successfully!', 'Complete');
      } else if (result.status === 'processing' || result.status === 'started' || result.status === 'pending') {
        // Start polling
        setFileStatuses(prev => ({
          ...prev,
          [fileId]: {
            ...result,
            status: 'processing',
            message: result.message || 'Processing document...',
            startTime: prev[fileId]?.startTime
          }
        }));
        startPolling(fileId);
        // Do an immediate status check
        await pollStatus(fileId);
      }
    } catch (error) {
      setFileStatuses(prev => ({
        ...prev,
        [fileId]: {
          status: 'failed',
          error: error.response?.data?.detail || 'Failed to start processing'
        }
      }));
      toast.error(
        error.response?.data?.detail || 'Failed to start processing. Please try again.',
        'Processing Failed'
      );
    }
  };

  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
    setActiveDocument(null);
    setDocumentConversations([]);
    setActiveDocumentConversationId(null);
    setIsViewerOpen(false);
    setMessages([]);
    setHasOlderMessages(false);
    setNextMessageBeforeId(null);
    setQuestion('');
    setShowingLetters(false);
  }, []);

  const handleOpenDocumentChat = useCallback(async (file) => {
    setIsViewerOpen(true);
    setActiveConversationId(null);
    setQuestion('');
    setShowingLetters(false);
    setIsDocumentModalOpen(false);
    setMessages([]);
    setHasOlderMessages(false);
    setNextMessageBeforeId(null);
    setIsDocumentConversationsLoading(true);
    try {
      const [documentResponse, conversationsResponse] = await Promise.all([
        axiosInstance.get(`/api/document/file/${file.id}`),
        axiosInstance.get(`/api/chat/documents/${file.id}/conversations`, {
          params: { limit: DOCUMENT_CONVERSATIONS_PAGE_SIZE },
        }),
      ]);
      let conversationsPage = conversationsResponse.data?.conversations || [];
      let conversation = conversationsPage[0];
      const messagesResponse = conversation
        ? await axiosInstance.get(
            `/api/chat/documents/${file.id}/conversations/${conversation.id}`,
            { params: { limit: CHAT_HISTORY_PAGE_SIZE } },
          )
        : null;
      setActiveDocument({ ...file, ...documentResponse.data });
      setDocumentConversations(conversationsPage);
      setActiveDocumentConversationId(conversation?.id ?? null);
      setMessages(messagesResponse?.data?.messages || []);
      setHasOlderMessages(Boolean(messagesResponse?.data?.has_more));
      setNextMessageBeforeId(messagesResponse?.data?.next_before_id ?? null);
    } catch (error) {
      setActiveDocument(file);
      setDocumentConversations([]);
      setActiveDocumentConversationId(null);
      setMessages([]);
      toast.error('Unable to load this document chat.', 'Document chat');
    } finally {
      setIsDocumentConversationsLoading(false);
    }
  }, [axiosInstance, toast]);

  const handleSelectDocumentConversation = useCallback(async (conversationId) => {
    if (!activeDocument || conversationId === activeDocumentConversationId) return;
    setMessages([]);
    setHasOlderMessages(false);
    setNextMessageBeforeId(null);
    try {
      const response = await axiosInstance.get(
        `/api/chat/documents/${activeDocument.id}/conversations/${conversationId}`,
        { params: { limit: CHAT_HISTORY_PAGE_SIZE } },
      );
      setActiveDocumentConversationId(response.data.id);
      setMessages(response.data.messages || []);
      setHasOlderMessages(Boolean(response.data?.has_more));
      setNextMessageBeforeId(response.data?.next_before_id ?? null);
      if (response.data?.skill_slug || response.data?.skill_id) {
        const found = skills.find(s => s.slug === response.data.skill_slug || s.id === response.data.skill_id);
        if (found) setActiveSkill(found);
      }
      setShowingLetters(false);
    } catch (error) {
      toast.error('Unable to open this document conversation.', 'Document chat');
    }
  }, [activeDocument, activeDocumentConversationId, axiosInstance, skills, toast]);

  const handleNewDocumentConversation = useCallback(async () => {
    if (!activeDocument) return;
    setActiveDocumentConversationId(null);
    setMessages([]);
    setHasOlderMessages(false);
    setNextMessageBeforeId(null);
    setQuestion('');
    setShowingLetters(false);
  }, [activeDocument]);

  const handleDeleteDocumentConversation = useCallback(async (conversationId) => {
    if (!activeDocument || !window.confirm('Delete this conversation?')) return;
    try {
      await axiosInstance.delete(`/api/chat/documents/${activeDocument.id}/conversations/${conversationId}`);
      const remaining = documentConversations.filter((conversation) => conversation.id !== conversationId);
      setDocumentConversations(remaining);
      if (conversationId === activeDocumentConversationId) {
        setActiveDocumentConversationId(null);
        setMessages([]);
        setHasOlderMessages(false);
        setNextMessageBeforeId(null);
        if (remaining[0]) {
          await handleSelectDocumentConversation(remaining[0].id);
        }
      }
      toast.success('Document conversation deleted.', 'Document chat');
    } catch (error) {
      toast.error('Unable to delete this document conversation.', 'Document chat');
    }
  }, [activeDocument, activeDocumentConversationId, axiosInstance, documentConversations, handleSelectDocumentConversation, toast]);

  const handleUploadDocument = useCallback(async (selectedFiles, event) => {
    const requestedFiles = Array.from(selectedFiles || []).filter(Boolean);
    if (requestedFiles.length === 0) return;

    const availableSlots = Math.max(0, MAX_DOCUMENTS - allFiles.length);
    const filesToUpload = requestedFiles.slice(0, availableSlots);
    if (filesToUpload.length === 0) {
      toast.warning(`Votre espace contient déjà ${MAX_DOCUMENTS} documents. Supprimez-en un avant d’en ajouter.`, 'Limite atteinte');
      if (event?.target) event.target.value = '';
      return;
    }
    if (filesToUpload.length < requestedFiles.length) {
      toast.warning(`Seuls ${filesToUpload.length} documents peuvent être ajoutés avec les places restantes.`, 'Limite de documents');
    }

    setIsUploading(true);
    setUploadProgress({ current: 0, total: filesToUpload.length, fileName: filesToUpload[0]?.name || '' });
    try {
      const results = await handleUploads(filesToUpload, axiosInstance, ({ current, total, file, response }) => {
        setUploadProgress({ current, total, fileName: file.name });
        const uploadedFile = response?.data?.file;
        if (!uploadedFile?.id) return;

        const status = uploadedFile.processing_status || 'processing';
        setFileStatuses((previous) => ({
          ...previous,
          [uploadedFile.id]: { status, error: response?.data?.processing_error, startTime: Date.now() }
        }));
        if (status === 'processing') {
          startPolling(uploadedFile.id);
          void pollStatus(uploadedFile.id);
        }
      });

      await fetchFiles();

      const successfulUploads = results.filter((result) => result.response).length;
      const failedUploads = results.length - successfulUploads;
      if (successfulUploads > 0) {
        toast.success(
          `${successfulUploads} document${successfulUploads > 1 ? 's' : ''} ajouté${successfulUploads > 1 ? 's' : ''}. La préparation a démarré automatiquement.`,
          'Importation terminée'
        );
      }
      if (failedUploads > 0) {
        toast.error(
          `${failedUploads} document${failedUploads > 1 ? 's n’ont' : ' n’a'} pas pu être importé${failedUploads > 1 ? 's' : ''}.`,
          'Importation incomplète'
        );
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (event?.target) event.target.value = '';
    }
  }, [allFiles.length, axiosInstance, fetchFiles, handleUploads, toast]);

  const handleDeleteDocument = useCallback(async (fileId) => {
    try {
      await axiosInstance.delete(`/api/document/file/${fileId}`);
      if (activeDocument?.id === fileId) handleNewChat();
      setFileStatuses((previous) => {
        const next = { ...previous };
        delete next[fileId];
        return next;
      });
      await fetchFiles();
      toast.success('Document deleted.', 'Document');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Unable to delete this document.', 'Document');
    }
  }, [activeDocument, axiosInstance, fetchFiles, handleNewChat, toast]);

  const handleSelectConversation = useCallback(async (conversationId) => {
    if (conversationId === activeConversationId) return;
    setMessages([]);
    setHasOlderMessages(false);
    setNextMessageBeforeId(null);
    try {
      const response = await axiosInstance.get(`/api/chat/general/conversations/${conversationId}`, {
        params: { limit: CHAT_HISTORY_PAGE_SIZE },
      });
      setActiveConversationId(response.data.id);
      setActiveDocument(null);
      setIsViewerOpen(false);
      setMessages(response.data.messages || []);
      setHasOlderMessages(Boolean(response.data?.has_more));
      setNextMessageBeforeId(response.data?.next_before_id ?? null);
      if (response.data?.skill_slug || response.data?.skill_id) {
        const found = skills.find(s => s.slug === response.data.skill_slug || s.id === response.data.skill_id);
        if (found) setActiveSkill(found);
      }
      setShowingLetters(false);
    } catch (error) {
      toast.error('Unable to open this conversation.', 'Chat history');
    }
  }, [activeConversationId, axiosInstance, skills, toast]);

  const handleLoadMoreConversations = useCallback(() => {
    if (!hasMoreConversations || nextConversationOffset === null || isLoadingMoreConversations) return;
    loadConversations({ offset: nextConversationOffset, append: true });
  }, [hasMoreConversations, isLoadingMoreConversations, loadConversations, nextConversationOffset]);

  const handleLoadOlderMessages = useCallback(async () => {
    if (!hasOlderMessages || nextMessageBeforeId === null || isLoadingOlderMessages) return;

    const endpoint = activeDocument
      ? activeDocumentConversationId
        ? `/api/chat/documents/${activeDocument.id}/conversations/${activeDocumentConversationId}`
        : null
      : activeConversationId
        ? `/api/chat/general/conversations/${activeConversationId}`
        : null;
    if (!endpoint) return;

    setIsLoadingOlderMessages(true);
    try {
      const response = await axiosInstance.get(endpoint, {
        params: { limit: CHAT_HISTORY_PAGE_SIZE, before_id: nextMessageBeforeId },
      });
      const olderMessages = response.data?.messages || [];
      setMessages((current) => [...olderMessages, ...current]);
      setHasOlderMessages(Boolean(response.data?.has_more));
      setNextMessageBeforeId(response.data?.next_before_id ?? null);
    } catch (error) {
      toast.error('Unable to load older messages.', 'Chat history');
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [activeConversationId, activeDocument, activeDocumentConversationId, axiosInstance, hasOlderMessages, isLoadingOlderMessages, nextMessageBeforeId, toast]);

  const handleDeleteConversation = useCallback(async (conversationId) => {
    if (!window.confirm('Delete this conversation?')) return;
    try {
      await axiosInstance.delete(`/api/chat/general/conversations/${conversationId}`);
      if (conversationId === activeConversationId) {
        handleNewChat();
      }
      await loadConversations();
    } catch (error) {
      toast.error('Unable to delete this conversation.', 'Chat history');
    }
  }, [activeConversationId, axiosInstance, handleNewChat, loadConversations, toast]);

  if (filesIsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loading padding={3} />
      </div>
    );
  }

  const chatPanel = (
    <div className="flex min-w-0 h-full flex-1 flex-col bg-white">
      <GeneralChatMessages
        messages={messages}
        isLoading={isLoading}
        showingLetters={showingLetters}
        currentIndex={currentIndex}
        chatEndRef={chatEndRef}
        onSuggestionClick={handleSubmit}
        documentName={activeDocument?.file_name}
        hasOlderMessages={hasOlderMessages}
        isLoadingOlderMessages={isLoadingOlderMessages}
        onLoadOlderMessages={handleLoadOlderMessages}
        hasAvailableSources={processedFiles.length > 0}
        onAddDocument={() => setIsDocumentModalOpen(true)}
      />
      <GeneralChatInput
        question={question}
        setQuestion={setQuestion}
        isLoading={isLoading}
        includedFilesCount={includedFiles.length}
        onSubmit={() => handleSubmit()}
        onKeyPress={handleKeyPress}
        documentName={activeDocument?.file_name}
        skills={skills}
        activeSkill={activeSkill}
        onSelectSkill={setActiveSkill}
      />
    </div>
  );

  const viewerPanel = activeDocument && (
    <aside className="flex h-full min-w-0 flex-col bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <p className="min-w-0 truncate text-sm font-medium text-slate-700">{activeDocument.file_name}</p>
        <button type="button" onClick={() => setIsViewerOpen(false)} className="ml-3 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Hide document viewer">
          <LuPanelRightClose className="text-lg" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 p-3">
        <DocumentViewer
          fileData={activeDocument}
          fileViewUrl={activeDocumentViewUrl}
          needsProcessing={!activeDocument.processed}
          processingStatus={activeDocument.processing_status}
          isProcessing={false}
          onProcess={() => handleProcessFile(activeDocument.id)}
        />
      </div>
    </aside>
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-white">
      {/* Sidebar: Documents */}
      <GeneralChatSidebar
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        conversations={conversations}
        activeConversationId={activeConversationId}
        isConversationsLoading={isConversationsLoading}
        hasMoreConversations={hasMoreConversations}
        isLoadingMoreConversations={isLoadingMoreConversations}
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onLoadMoreConversations={handleLoadMoreConversations}
        activeDocument={activeDocument}
        documentConversations={documentConversations}
        activeDocumentConversationId={activeDocumentConversationId}
        isDocumentConversationsLoading={isDocumentConversationsLoading}
        onReturnToGeneral={handleNewChat}
        onNewDocumentConversation={handleNewDocumentConversation}
        onSelectDocumentConversation={handleSelectDocumentConversation}
        onDeleteDocumentConversation={handleDeleteDocumentConversation}
        isViewerOpen={isViewerOpen}
        onToggleViewer={() => setIsViewerOpen((isOpen) => !isOpen)}
      />
      {activeDocument && isViewerOpen && isDesktopDocumentLayout ? (
        <PanelGroup direction="horizontal" className="flex min-w-0 flex-1">
          <Panel defaultSize={58} minSize={35}>{chatPanel}</Panel>
          <PanelResizeHandle className="shrink-0">
            <CustomPanelResizeHandle isViewerCollapsed={false} onToggle={() => setIsViewerOpen(false)} />
          </PanelResizeHandle>
          <Panel defaultSize={42} minSize={25} maxSize={65}>{viewerPanel}</Panel>
        </PanelGroup>
      ) : chatPanel}
      {isSourcesSidebarOpen && <SourcesSidebar
        includedFiles={includedFiles}
        processedFiles={processedFiles}
        unprocessedFiles={unprocessedFiles}
        excludedFiles={excludedFiles}
        fileStatuses={fileStatuses}
        onFileToggle={handleFileToggle}
        onIncludeAll={handleIncludeAll}
        onExcludeAll={handleExcludeAll}
        onProcessFile={handleProcessFile}
        onOpenDocuments={() => setIsDocumentModalOpen(true)}
        onOpenDocumentChat={handleOpenDocumentChat}
        onClose={() => setIsSourcesSidebarOpen(false)}
      />}
      <DocumentManagerModal
        isOpen={isDocumentModalOpen}
        files={allFiles}
        fileStatuses={fileStatuses}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
        onClose={() => setIsDocumentModalOpen(false)}
        onUpload={handleUploadDocument}
        onOpenDocumentChat={handleOpenDocumentChat}
        onDelete={handleDeleteDocument}
        onRetry={handleProcessFile}
      />
    </div>
  );
}

export default GeneralChat;
