import { Outlines } from '@react-three/drei';
import { useThree } from '@react-three/fiber';

/** Two thin silhouette layers give selectable food a glow without a full-scene bloom pass. */
export function IngredientOutline() {
  const dpr = useThree(state => state.viewport.dpr);
  // Drei's default projection measures thickness in drawing-buffer pixels.
  return <>
    <Outlines name="ingredient-glow" color="#F2B743" thickness={3 * dpr} opacity={.16} transparent toneMapped={false} angle={0} renderOrder={1} />
    <Outlines name="ingredient-outline" color="#F2B743" thickness={1.1 * dpr} opacity={.85} transparent toneMapped={false} angle={0} renderOrder={2} />
  </>;
}
