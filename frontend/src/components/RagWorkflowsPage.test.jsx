import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import RagWorkflowsPage from './RagWorkflowsPage';

const mockApi = { get: jest.fn(), post: jest.fn() };
jest.mock('../hooks/useAxiosPrivate', () => () => mockApi);
jest.mock('./shared/navBar', () => () => <nav>Aitheris</nav>);

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => 'test-run' } });
});

test('loads grouped documents and submits only selected ready sources with review', async () => {
  mockApi.get.mockImplementation(url => Promise.resolve({ data:
    url.endsWith('/projects') ? { projects: [{ id: 'p1', name: 'Audit', role: 'owner' }] } : (url.endsWith('/files') || url.endsWith('/documents')) ? { files: [
      { id: 1, file_name: 'Politique.pdf', processed: true, processing_status: 'completed' },
      { id: 2, file_name: 'En attente.pdf', processed: false, processing_status: 'pending' },
    ] } : url.endsWith('/capabilities') ? { ready: true } : { runs: [] },
  }));
  mockApi.post.mockRejectedValue({ response: { data: { detail: 'Test réseau' } } });
  render(<MemoryRouter initialEntries={['/?project=p1']}><RagWorkflowsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Politique.pdf'));
  expect(screen.queryByText('En attente.pdf')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Que souhaitez-vous comprendre ?'), { target: { value: 'Quelle fréquence ?' } });
  fireEvent.click(screen.getByLabelText(/Relire avant de finaliser/));
  fireEvent.click(screen.getByRole('button', { name: /Analyser les documents/ }));
  await screen.findByText('Test réseau');
  await waitFor(() => expect(screen.getByRole('button', { name: /Analyser les documents/ })).toBeEnabled());
  expect(mockApi.post).toHaveBeenCalledWith('/api/rag-workflows/runs', {
    id: 'test-run', project_id: 'p1', question: 'Quelle fréquence ?', file_ids: [1], require_review: true,
  }, { timeout: 200000 });
});

test('switching projects clears selected documents and scopes history', async () => {
  mockApi.get.mockImplementation(url => Promise.resolve({ data:
    url.endsWith('/projects') ? { projects: [{ id: 'p1', name: 'Audit', role: 'owner' }, { id: 'p2', name: 'Finance', role: 'owner' }] }
    : url === '/api/projects/p1/documents' ? { files: [{ id: 1, file_name: 'Audit.pdf', processed: true, processing_status: 'completed' }] }
    : url === '/api/projects/p2/documents' ? { files: [{ id: 2, file_name: 'Finance.pdf', processed: true, processing_status: 'completed' }] }
    : url.endsWith('/capabilities') ? { ready: true } : url.endsWith('/files') ? {} : { runs: [] },
  }));
  render(<MemoryRouter initialEntries={['/?project=p1']}><RagWorkflowsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Audit.pdf'));
  fireEvent.change(screen.getByLabelText('Projet'), { target: { value: 'p2' } });
  expect(await screen.findByLabelText('Finance.pdf')).not.toBeChecked();
  expect(screen.queryByLabelText('Audit.pdf')).not.toBeInTheDocument();
  expect(mockApi.get).toHaveBeenCalledWith('/api/rag-workflows/runs?project_id=p2');
});

test('reopens a pending review and sends its exact draft version', async () => {
  const run = { id: 'saved', project_id: 'p1', question: 'Fréquence ?', status: 'awaiting_review',
    created_at: '2026-09-19T00:00:00Z', result: { draft_hash: 'abc',
      claims: [{ text: 'Chaque jour.', evidence: [{ source_id: 'S1', quote: 'Sauvegarde quotidienne' }] }] } };
  mockApi.get.mockImplementation(url => Promise.resolve({ data: url.endsWith('/saved') ? run
    : url.endsWith('/projects') ? { projects: [{ id: 'p1', name: 'Audit', role: 'owner' }] } : url.endsWith('/capabilities') ? { ready: true } : url.endsWith('/files') ? {} : { runs: [run] } }));
  mockApi.post.mockResolvedValue({ data: { ...run, status: 'completed' } });
  render(<MemoryRouter initialEntries={['/?project=p1&run=saved']}><RagWorkflowsPage /></MemoryRouter>);
  const approve = await screen.findByRole('button', { name: /Approuver cette réponse/ });
  await waitFor(() => expect(approve).toBeEnabled());
  fireEvent.click(approve);
  await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/api/rag-workflows/runs/saved/review',
    { action: 'approve', draft_hash: 'abc' }, { timeout: 200000 }));
  expect(await screen.findByText('Chaque jour.')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('button', { name: /Approuver cette réponse/ })).not.toBeInTheDocument());
});
