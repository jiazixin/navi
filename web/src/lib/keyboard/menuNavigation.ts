const menuNavigationKeys = ['ArrowDown', 'ArrowUp', 'Home', 'End'] as const;
type MenuNavigationKey = (typeof menuNavigationKeys)[number];

export function isMenuNavigationKey(key: string): key is MenuNavigationKey {
  return menuNavigationKeys.some((navigationKey) => navigationKey === key);
}

export function getNextMenuIndex(
  key: MenuNavigationKey,
  currentIndex: number,
  optionCount: number,
): number {
  const lastIndex = optionCount - 1;
  switch (key) {
    case 'Home':
      return 0;
    case 'End':
      return lastIndex;
    case 'ArrowDown':
      return currentIndex >= lastIndex ? 0 : currentIndex + 1;
    case 'ArrowUp':
      return currentIndex <= 0 ? lastIndex : currentIndex - 1;
  }
}
