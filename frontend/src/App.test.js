import { render, screen } from '@testing-library/react';
import App from './App';

test('renders navigation tabs', () => {
  render(<App />);
  expect(screen.getByText('Voice Triage')).toBeInTheDocument();
  expect(screen.getByText('Staff Inventory')).toBeInTheDocument();
});