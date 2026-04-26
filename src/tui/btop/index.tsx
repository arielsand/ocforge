import { render } from 'ink';
import App from './app';

export function runBtopTUI(): void {
  // Check if stdin is a TTY (Ink requires raw mode)
  if (!process.stdin.isTTY) {
    console.error('\x1b[31mError:\x1b[0m The btop TUI requires an interactive terminal.');
    console.error('Please run this command directly in your terminal, not via a pipe or script.');
    console.error('\nTip: Use --web for web UI or run without flags for the simple TUI.');
    process.exit(1);
  }
  
  const { waitUntilExit } = render(<App />);
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled error:', err);
  });
  
  waitUntilExit().then(() => {
    process.exit(0);
  });
}
