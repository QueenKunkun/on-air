import { h, render } from 'preact';
import { FileTree } from './FileTree';

const root = document.getElementById('ft-preact-root');
if (root) {
  const id = root.getAttribute('data-id') || '';
  render(<FileTree id={id} />, root);
}
