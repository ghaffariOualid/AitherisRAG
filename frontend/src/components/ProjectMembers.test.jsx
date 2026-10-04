import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProjectMembers from './ProjectMembers';

test('owner shares with an existing account and can revoke access', async () => {
  const api = { get: jest.fn().mockResolvedValue({ data: { members: [{ user_id: 1, user_name: 'owner', role: 'owner' }] } }),
    put: jest.fn().mockResolvedValue({ data: { user_id: 2, user_name: 'alice', role: 'reader' } }),
    delete: jest.fn().mockResolvedValue({ data: { removed: true } }) };
  render(<ProjectMembers api={api} projectId="p1" role="owner" />);
  await screen.findByText('owner');
  fireEvent.click(screen.getByText(/Membres et partage/));
  fireEvent.change(screen.getByLabelText('Identifiant du collaborateur'), { target: { value: 'alice' } });
  fireEvent.click(screen.getByRole('button', { name: 'Partager le projet' }));
  const remove = await screen.findByRole('button', { name: 'Retirer alice' });
  expect(api.put).toHaveBeenCalledWith('/api/projects/p1/members', { user_name: 'alice', role: 'reader' });
  fireEvent.click(remove);
  await waitFor(() => expect(screen.queryByText('alice')).not.toBeInTheDocument());
  expect(api.delete).toHaveBeenCalledWith('/api/projects/p1/members/2');
});

test('administrator sees members without membership management controls', async () => {
  const api = { get: jest.fn().mockResolvedValue({ data: { members: [{ user_id: 2, user_name: 'alice', role: 'admin' }] } }) };
  render(<ProjectMembers api={api} projectId="p1" role="admin" />);
  await screen.findByText('alice');
  expect(screen.queryByLabelText('Identifiant du collaborateur')).not.toBeInTheDocument();
  expect(screen.queryByText('Retirer alice')).not.toBeInTheDocument();
});
