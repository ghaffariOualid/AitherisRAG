import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './components/landing';
import './index.css';
import Loading from './components/ui/Loading';
import RegisterComponents from './components/register';
import Login from './components/login';
import useAuthStore from './stores/authStore';
import ErrorBoundary from './components/ErrorBoundary';
import AdminRoute from './components/Admin/AdminRoute';

const RagWorkflowsPage = lazy(() => import('./components/RagWorkflowsPage'));
const GeneralChatPage = lazy(() => import('./components/GeneralChatPage'));
const LLMGatewayPage = lazy(() => import('./components/Admin/LLMGatewayPage'));
const SkillsManagerPage = lazy(() => import('./components/Admin/SkillsManagerPage'));
const ObservabilityPage = lazy(() => import('./components/Admin/ObservabilityPage'));

function PrivateRoute({ element, ...rest }) {
  const token = useAuthStore((state) => state.token);

  return token ? (
    element
  ) : (
    <Navigate to="/user/login" replace />
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <ErrorBoundary>
          <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loading padding={8} /></div>}>
            <Routes>
              <Route exact path="/" element={<ErrorBoundary><Landing /></ErrorBoundary>} />
              <Route exact path="/user/register" element={<ErrorBoundary><RegisterComponents /></ErrorBoundary>} />
              <Route exact path="/user/login" element={<ErrorBoundary><Login /></ErrorBoundary>} />
              
              <Route path="/rag-workflows" element={<ErrorBoundary><PrivateRoute element={<RagWorkflowsPage />} /></ErrorBoundary>} />
              <Route path="/general-chat" element={<ErrorBoundary><PrivateRoute element={<GeneralChatPage />} /></ErrorBoundary>} />
              <Route path="/admin/llm-gateway" element={<ErrorBoundary><AdminRoute element={<LLMGatewayPage />} /></ErrorBoundary>} />
              <Route path="/admin/llm" element={<Navigate to="/admin/llm-gateway" replace />} />
              <Route path="/admin/skills" element={<ErrorBoundary><PrivateRoute element={<SkillsManagerPage />} /></ErrorBoundary>} />
              <Route path="/admin/observability" element={<ErrorBoundary><AdminRoute element={<ObservabilityPage />} /></ErrorBoundary>} />
              <Route path="/admin/langfuse" element={<Navigate to="/admin/observability" replace />} />
              <Route path="/chatroom" element={<Navigate to="/general-chat" replace />} />
              <Route path="/chatroom/:id" element={<Navigate to="/general-chat" replace />} />
              <Route path="/multi-chat" element={<Navigate to="/general-chat" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
