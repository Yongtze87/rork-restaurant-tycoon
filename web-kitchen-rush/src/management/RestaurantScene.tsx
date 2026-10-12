import { Component, memo, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { Batch, Box, Cylinder, type InstanceSpec } from '@/scene/Primitives';
import { CATALOG, CELL, HEIGHT, guestPatienceSeconds, width, type Furniture, type Point, type RestaurantState } from './types';
import { restaurant } from './engine';
import { placementError, localPoint, accessPoints } from './layout';
import { Customer, Employee } from './Agents';
import { RestaurantLabels, RestaurantLabelPositions } from './RestaurantLabels';
import { FurnitureBody, FurnitureView, Meal, RestaurantSign } from './FurnitureView';
import { BuildGrid, PlacementFootprint } from './BuildGrid';
import { CityScenery } from './CityScenery';
import { CityLife } from './CityLife';
import { CityPark } from './CityPark';
import { CityBulletin } from './CityBulletin';
import { cityMapBounds, type CityDistrict } from './city-map';
import { CityWeather } from './CityWeather';
import type { WeatherKind, WeatherMode } from './weather';

interface SceneProps { state: RestaurantState; building: boolean; draft: Furniture | null; selected: number | null; zoom: number; angle: number; cityView?: boolean; cityDistrict?: CityDistrict; trafficAudio?: boolean; weatherMode: WeatherMode; onWeatherChange: (kind: WeatherKind) => void; onTile: (point: Point) => void; onSelect: (id: number) => void; }
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { restaurant.pause(true); }
  render() { return this.state.failed ? <div className="flex h-full items-center justify-center p-6"><div className="paper max-w-sm p-6 text-center"><h2 className="text-2xl">Let’s reopen the rooftop</h2><p className="my-3">The 3D scene could not load. Your saved restaurant is safe. Check your connection and WebGL support.</p><button className="game-button mx-auto" onClick={() => window.location.reload()}>Reload</button></div></div> : this.props.children; }
}
function SceneClock({ columns, zoom, angle, cityView, cityDistrict, building }: { columns: number; zoom: number; angle: number; cityView: boolean; cityDistrict: CityDistrict; building: boolean }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const wide = cityView && !building;
    const neighborhood = cityMapBounds(columns, cityDistrict);
    const cam = camera as THREE.OrthographicCamera, center = new THREE.Vector3(wide ? (neighborhood.left + neighborhood.right) / 2 : (columns - 1) * CELL / 2, wide ? (neighborhood.height - 1) / 2 : 1.6, wide ? (neighborhood.back + neighborhood.front) / 2 : 6.3);
    const yaw = Math.PI / 6 + angle * Math.PI / 2, distance = wide ? 85 : 24;
    camera.position.set(center.x + Math.sin(yaw) * distance, center.y + distance * 22 / 24, center.z + Math.cos(yaw) * distance); camera.lookAt(center); camera.updateMatrixWorld(true);
    camera.userData.viewDistance = camera.position.distanceTo(center);
    const bounds = new THREE.Box3();
    for (const x of wide ? [neighborhood.left, neighborhood.right] : [-1.2, columns * CELL - .2]) for (const y of [-1, wide ? neighborhood.height : 4.3]) for (const z of wide ? [neighborhood.back, neighborhood.front] : [-1.3, 14.4]) bounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
    const extent = bounds.getSize(new THREE.Vector3());
    cam.zoom = Math.min(size.width / (extent.x + 1.3), size.height / (extent.y + 1.3)) * zoom * (wide || building ? 1 : .86); cam.updateProjectionMatrix();
    camera.userData.cityView = wide; camera.userData.district = wide ? cityDistrict : 'restaurant';
  }, [camera, size, columns, zoom, angle, cityView, cityDistrict, building]);
  useFrame((_, dt) => restaurant.update(dt), -2);
  return null;
}
const Terrace = memo(function Terrace({ columns, name }: { columns: number; name: string }) {
  const center = (columns - 1) * CELL / 2;
  const tiles = useMemo<InstanceSpec[]>(() => {
    const result: InstanceSpec[] = [];
    for (let x = 0; x < columns; x++) for (let z = 0; z < HEIGHT; z++) {
      const kitchen = x < 5 && z < 4;
      result.push({ position: [x * CELL, .015, z * CELL], scale: [CELL - .025, .08, CELL - .025], color: kitchen ? (x + z) % 2 ? '#E9D7B6' : '#FFF2D7' : ['#bd7757', '#c7865e', '#c17e58'][(x * 17 + z * 3) % 3] });
    } return result;
  }, [columns]);
  const cable = useMemo<[number, number, number][]>(() => Array.from({ length: 30 }, (_, i) => [-.5 + (columns * CELL) * i / 29, 4.1 - Math.sin(i / 29 * Math.PI) * .6, -.7]), [columns]);
  return <>
    <Box position={[center, -.48, 6.3]} size={[columns * CELL + .5, .9, 14.55]} color="#224F4A" />
    <Box position={[center, -.04, 6.3]} size={[columns * CELL + .7, .16, 14.65]} color="#F6E7CA" />
    <Batch items={tiles} />
    <Box position={[center, .56, -.9]} size={[columns * CELL + .6, 1.2, .35]} color="#B76544" />
    <Box position={[center, 1.21, -.9]} size={[columns * CELL + .8, .16, .6]} color="#F0AB70" />
    <Box position={[-.9, .45, 6.3]} size={[.32, .9, 14.2]} color="#B76544" />
    <Box position={[columns * CELL - .5, .45, 6.3]} size={[.32, .9, 14.2]} color="#B76544" />
    <group position={[center, -.43, 13.65]} scale={.7}><RestaurantSign name={name} /></group>
    <group position={[4 * CELL, .1, 13.4]}><Box size={[1.45, .12, 1.2]} color="#F6E7CA" /><Box position={[0, -.16, .7]} size={[1.7, .18, .4]} color="#dbbd94" /></group>
    <Line points={cable} color="#233D3B" lineWidth={2} />{cable.filter((_, i) => i % 3 === 0).map((p, i) => <group key={i} position={p}><Cylinder position={[0, -.09, 0]} radius={.05} height={.15} color="#224F4A" /><mesh position={[0, -.22, 0]}><sphereGeometry args={[.105, 12, 8]} /><meshStandardMaterial color="#FFF2D7" emissive="#F2B743" emissiveIntensity={2} /></mesh></group>)}
    {[-.5, columns * CELL - .5].map(x => <Box key={x} position={[x, 2, -.7]} size={[.12, 4.2, .12]} color="#224F4A" />)}
    <group position={[5.5, 0, -.46]}><Box position={[0, 1.7, 0]} size={[3.7, .16, .28]} color="#224F4A" />{Array.from({ length: 7 }, (_, i) => <Cylinder key={i} position={[-1.4 + i * .45, 1.95, 0]} radius={.12} height={.38} color={i % 2 ? '#FFF2D7' : '#F2B743'} />)}</group>
  </>;
});
function Ghost({ item, valid }: { item: Furniture; valid: boolean }) {
  const n = CATALOG[item.kind].size;
  return <group name="placement-preview">
    <PlacementFootprint item={item} valid={valid} />
    <group position={[(item.x + (n - 1) / 2) * CELL, .13, (item.z + (n - 1) / 2) * CELL]} rotation={[0, -item.rotation * Math.PI / 2, 0]}>
      <group position={[0, .04, 0]}><FurnitureBody kind={item.kind} /></group>
    </group>
    {accessPoints(item).map((p, i) => <mesh key={i} position={[p.x * CELL, .11, p.z * CELL]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.2, .29, 20]} /><meshBasicMaterial color={valid ? '#F2B743' : '#DC533C'} /></mesh>)}
  </group>;
}
export default function RestaurantScene(props: SceneProps) {
  const { state, draft, building, selected, onTile, onSelect, zoom, angle, cityView = false, cityDistrict = 'city', trafficAudio = true, weatherMode, onWeatherChange } = props;
  const [lost, setLost] = useState<boolean>(false), columns = width(state), patienceSeconds = guestPatienceSeconds(state);
  const labels = useRef<Map<string, HTMLDivElement>>(new Map());
  return <SceneBoundary><div className="relative h-full w-full"><Canvas orthographic shadows dpr={[1, 1.5]} camera={{ position: [18, 22, 28], zoom: 35, near: .1, far: 250 }} gl={{ antialias: true, alpha: false }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.12; gl.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); restaurant.pause(true); setLost(true); }); }}>
    <CityWeather columns={columns} mode={weatherMode} building={building} onChange={onWeatherChange} />
    <SceneClock columns={columns} zoom={zoom} angle={angle} cityView={cityView} cityDistrict={cityDistrict} building={building} /><CityScenery columns={columns} /><CityPark /><CityBulletin /><CityLife columns={columns} audioEnabled={trafficAudio} building={building} /><Terrace columns={columns} name={state.name} />
    {state.furniture.filter(f => f.id !== draft?.id).map(item => <FurnitureView key={item.id} item={item} selected={selected === item.id} onSelect={id => { if (draft) { const f = state.furniture.find(f => f.id === id); if (f) onTile({ x: f.x, z: f.z }); } else onSelect(id); }} />)}
    {building && <BuildGrid columns={columns} draft={draft} onTile={onTile} />}
    {draft && <Ghost item={draft} valid={!placementError(state, draft)} />}
    {state.staff.map(member => <Employee key={member.id} member={member} />)}
    {state.guests.map(guest => <Customer key={guest.id} guest={guest} patienceSeconds={patienceSeconds} />)}
    {state.guests.filter(g => g.stage === 'eating').map(g => {
      const table = state.furniture.find(f => f.id === g.tableId); if (!table) return null;
      const p = localPoint(table, g.seat === 0 ? .18 : .82, .4);
      return <group key={g.id} position={[p.x * CELL, 1.115, p.z * CELL]}><Meal dish={g.dish} /></group>;
    })}
    {state.dirty.map(key => { const [id, seat] = key.split(':').map(Number), table = state.furniture.find(f => f.id === id); if (!table) return null; const p = localPoint(table, seat ? .82 : .18, .4); return <group key={key} position={[p.x * CELL, 1.115, p.z * CELL]}><Cylinder radius={.22} height={.035} color="#B9AD94" /></group>; })}
    <RestaurantLabelPositions labels={labels} />
    <Suspense fallback={null} />
  </Canvas><RestaurantLabels state={state} labels={labels} receipts={restaurant.incomeReceipts} paused={restaurant.paused} speed={restaurant.speed} />{lost && <div className="absolute inset-0 grid place-items-center bg-ink/70 p-4"><div className="paper p-6"><h2>Graphics paused</h2><p className="my-3">Reload to reconnect to your saved restaurant.</p><button className="game-button" onClick={() => window.location.reload()}>Reload restaurant</button></div></div>}</div></SceneBoundary>;
}
