import type { ChangeEvent, KeyboardEvent, RefObject } from 'react';
import { Search } from 'lucide-react';
import styles from './SearchField.module.css';

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onEscape?: () => void;
  onMoveToResults?: () => void;
  onOpenFirstResult?: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
};

export function SearchField({
  value,
  onChange,
  onEscape,
  onMoveToResults,
  onOpenFirstResult,
  inputRef,
  autoFocus = false,
}: SearchFieldProps): React.JSX.Element {
  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(event.target.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      onEscape?.();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      onMoveToResults?.();
      return;
    }

    if (event.key === 'Enter' && value.trim().length > 0) {
      event.preventDefault();
      onOpenFirstResult?.();
    }
  }

  return (
    <label className={styles.field}>
      <Search aria-hidden="true" className={styles.icon} size={18} strokeWidth={1.8} />
      <input
        ref={inputRef}
        aria-label="搜索导航"
        autoComplete="off"
        autoFocus={autoFocus}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="筛选导航"
        spellCheck={false}
        type="search"
        value={value}
      />
    </label>
  );
}
