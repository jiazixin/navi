import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import styles from './IconButton.module.css';

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string;
  children: ReactNode;
  buttonRef?: Ref<HTMLButtonElement>;
  tooltipAlign?: 'center' | 'end';
};

export function IconButton({
  label,
  children,
  className,
  buttonRef,
  tooltipAlign = 'center',
  type = 'button',
  ...props
}: IconButtonProps): React.JSX.Element {
  const classes = [
    styles.button,
    tooltipAlign === 'end' ? styles.tooltipEnd : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...props}
      aria-label={label}
      className={classes}
      data-tooltip={label}
      ref={buttonRef}
      type={type}
    >
      {children}
    </button>
  );
}
