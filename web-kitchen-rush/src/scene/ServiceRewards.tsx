import { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { engine } from '@/game/engine';
import { sampleServiceReward, type ServiceReward } from '@/game/service-reward';
import { useReducedMotionQuery } from '@/hooks/use-reduced-motion';
import { ServiceRewardPopup } from '@/components/ServiceRewardPopup';

/** Station-local rewards use simulation time, so pause and restart cannot leave stray animations. */
export function ServiceRewards() {
  return engine.state.phase === 'playing' ? <>{engine.serviceRewards.map(reward => <RewardView key={reward.id} reward={reward} />)}</> : null;
}

const RewardView = memo(function RewardView({ reward }: { reward: ServiceReward }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionQuery();
  useFrame(() => {
    const node = ref.current;
    if (!node) return;
    const pose = sampleServiceReward(reward, engine.state.elapsed, reduced.matches);
    // Clear even before the next throttled React snapshot on restart/navigation.
    const active = engine.state.phase === 'playing' && engine.serviceRewards.includes(reward);
    node.style.opacity = String(active ? pose.opacity : 0);
    node.style.transform = `translateY(${pose.y}px) scale(${pose.scale})`;
    const glints = node.querySelector<HTMLElement>('[data-reward-glints]');
    if (glints) glints.style.opacity = String(pose.glint);
  });
  return <Html center position={[reward.x - 1.4, 2.9, reward.z]} zIndexRange={[18, 14]} pointerEvents="none">
    <ServiceRewardPopup ref={ref} reward={reward} />
  </Html>;
});
