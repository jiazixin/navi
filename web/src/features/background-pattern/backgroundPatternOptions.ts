import type { CatalogBackgroundPattern } from '../../app/api/backgroundPattern';

type BackgroundPatternOption = {
  id: CatalogBackgroundPattern;
  label: string;
  description: string;
};

const defaultBackgroundPatternOption: BackgroundPatternOption = {
  id: 'meridian-grid',
  label: '经纬阵',
  description: '经纬、轴线与透视秩序',
};

export const backgroundPatternOptions: readonly BackgroundPatternOption[] = [
  {
    id: 'none',
    label: '素幕',
    description: '留白画布，不显示线条',
  },
  defaultBackgroundPatternOption,
  {
    id: 'orbital-rings',
    label: '天游环',
    description: '星盘轨道与天体节点',
  },
  {
    id: 'pisces',
    label: '双鱼宫',
    description: '双鱼、星点与回环水线',
  },
  {
    id: 'sagittarius',
    label: '天弓宫',
    description: '弓弦、箭矢与星座连线',
  },
  {
    id: 'roman-meander',
    label: '回廊纹',
    description: '古典回纹与建筑分度',
  },
  {
    id: 'rose-window',
    label: '玫瑰窗',
    description: '放射花瓣与同心圆环',
  },
  {
    id: 'eight-point-star',
    label: '八芒阵',
    description: '八芒星与菱形镶嵌',
  },
  {
    id: 'star-trails',
    label: '星轨幕',
    description: '左下星轨沿弧线缓慢流转',
  },
];

export function getBackgroundPatternOption(
  pattern: CatalogBackgroundPattern,
): BackgroundPatternOption {
  return (
    backgroundPatternOptions.find((option) => option.id === pattern) ??
    defaultBackgroundPatternOption
  );
}
