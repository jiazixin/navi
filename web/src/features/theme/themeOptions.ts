import type { CatalogTheme } from '../../shared/api/theme';

type ThemeOption = {
  id: CatalogTheme;
  label: string;
  description: string;
  colors: readonly [string, string, string];
  metaColor: string;
};

const defaultThemeOption: ThemeOption = {
  id: 'default',
  label: '默认',
  description: '跟随系统的黑白主题',
  colors: ['#0a0a0a', '#ffffff', '#737373'],
  metaColor: '#0a0a0a',
};

export const themeOptions: readonly ThemeOption[] = [
  defaultThemeOption,
  {
    id: 'navy-blossom',
    label: '绀樱夜',
    description: '深海蓝与樱粉',
    colors: ['#063c85', '#f7c3d9', '#bb5799'],
    metaColor: '#063c85',
  },
  {
    id: 'mint-tide',
    label: '薄荷汐',
    description: '薄荷青与电光蓝',
    colors: ['#a1feef', '#658ae4', '#28314e'],
    metaColor: '#a1feef',
  },
  {
    id: 'moss-court',
    label: '苔庭青',
    description: '苔绿与温柔叶影',
    colors: ['#d3f2de', '#99c39e', '#506850'],
    metaColor: '#d3f2de',
  },
  {
    id: 'tea-mist',
    label: '茶雾青',
    description: '纸白、陶棕与橄榄',
    colors: ['#faf3e9', '#a8703f', '#5c614d'],
    metaColor: '#faf3e9',
  },
  {
    id: 'amber-tide',
    label: '琥珀潮',
    description: '蜜金、珊瑚与深青',
    colors: ['#fff1c6', '#f0603c', '#0b5d66'],
    metaColor: '#fff1c6',
  },
  {
    id: 'sunny-coast',
    label: '晴海橙',
    description: '晴空蓝与跃动橙',
    colors: ['#eaf5ff', '#3478f6', '#ff8a3d'],
    metaColor: '#eaf5ff',
  },
  {
    id: 'violet-lime',
    label: '藤萝青',
    description: '藤紫与新芽绿',
    colors: ['#f3edff', '#7950c8', '#b7e34b'],
    metaColor: '#f3edff',
  },
];

export function getThemeOption(theme: CatalogTheme): ThemeOption {
  return themeOptions.find((option) => option.id === theme) ?? defaultThemeOption;
}
