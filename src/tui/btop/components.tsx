import React from 'react';
import { Box, Text } from 'ink';
import { THEME, BORDER_STYLE } from './theme';

interface BoxPanelProps {
  title: string;
  width?: string | number;
  height?: string | number;
  children: React.ReactNode;
  focused?: boolean;
}

export function BoxPanel({ title, width = '100%', height = '100%', children, focused = false }: BoxPanelProps) {
  const b = BORDER_STYLE.single;
  const borderColor = focused ? THEME.border : THEME.borderDim;
  const titleColor = focused ? THEME.panelHeader : THEME.textMuted;

  return (
    <Box flexDirection="column" width={width} height={height} borderStyle="single" borderColor={borderColor}>
      <Box marginLeft={1} marginTop={-1} >
        <Text color={titleColor}> {title} </Text>
      </Box>
      <Box flexDirection="column" paddingX={1} paddingY={0}>
        {children}
      </Box>
    </Box>
  );
}

interface SelectableRowProps {
  selected: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

export function SelectableRow({ selected, children }: SelectableRowProps) {
  return (
    <Box
      backgroundColor={selected ? THEME.selectedBg : undefined}
      width="100%"
    >
      <Text color={selected ? THEME.selectedFg : THEME.textPrimary}>
        {selected ? '> ' : '  '}
        {children}
      </Text>
    </Box>
  );
}

export function KeyHint({ shortcut, label }: { shortcut: string; label: string }) {
  return (
    <Box gap={1}>
      <Text color={THEME.highlight}>[{shortcut}]</Text>
      <Text color={THEME.textSecondary}>{label}</Text>
    </Box>
  );
}

export function StatusMessage({ message, type }: { message: string; type: 'success' | 'error' | 'info' | 'warning' }) {
  const color = type === 'success' ? THEME.success : type === 'error' ? THEME.error : THEME.info;
  return (
    <Box
      width="100%"
      backgroundColor={color}
      paddingX={1}
    >
      <Text color="#000" bold>{message}</Text>
    </Box>  );
}
