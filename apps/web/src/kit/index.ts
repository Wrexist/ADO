/**
 * The shared component kit (Prompt 1.0). RULE: views compose ONLY kit components —
 * a view-specific one-off must be promoted here before use. Every component renders
 * every state (happy / running / failed / idle / empty / degraded); see the /kit route.
 */
export { cx } from './cx';
export { toneText, toneBg, toneTint, type Tone } from './tones';
export { Icon, type IconName } from './Icon';
export { Card, HoverCard } from './Card';
export { IconTile } from './IconTile';
export { StatusDot } from './StatusDot';
export { Chip, CountBadge } from './Chip';
export { GradientProgress } from './GradientProgress';
export { Sparkline } from './Sparkline';
export { RadialRing } from './RadialRing';
export { MiniArea } from './MiniArea';
export { AvatarStack } from './AvatarStack';
export { SectionHeader } from './SectionHeader';
export { StatCard } from './StatCard';
export { FeedRow } from './FeedRow';
export { AgentTile } from './AgentTile';
export { EmptyState } from './EmptyState';
