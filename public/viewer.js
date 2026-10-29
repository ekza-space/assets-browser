import { t } from './i18n.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { configureAvatarVrmLoader, detectVrmKind, disposeVrm, getSharedAvatarClips, measureAvatarSpatialBounds, normalizeAvatarBounds, fitAvatarPreviewCamera } from '@ekza/avatar-renderer/runtime';

export class AssetViewer {
  constructor(mount, { onProgress = () => {}, interactive = true } = {}) {
    this.mount = mount; this.onProgress = onProgress; this.generation = 0; this.speed = 1; this.playing = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, .01, 100);
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0, 0); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', t('Интерактивная 3D-модель'));
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enabled = interactive; this.controls.enableDamping = true; this.controls.autoRotateSpeed = .75;
    this.scene.add(new THREE.AmbientLight(0xffffff, .9));
    for (const [color, power, position] of [[0xfff5e4, 1.25, [2, 4, 4]], [0xd4e7ff, .45, [-3, 2, 1]], [0xe9ffd1, .65, [1, 3, -3]]]) {
      const light = new THREE.DirectionalLight(color, power); light.position.set(...position); this.scene.add(light);
    }
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(mount); this.resize();
    let last = performance.now();
    this.renderer.setAnimationLoop(time => {
      const dt = Math.min((time-last)/1000, .05); last = time;
      if (this.playing) { this.mixer?.update(dt*this.speed); this.vrm?.update(dt*this.speed); }
      this.controls.update(); this.renderer.render(this.scene, this.camera);
      if (this.action) this.onProgress(this.action.time / this.action.getClip().duration);
    });
  }
  resize() {
    const width = Math.max(1, this.mount.clientWidth), height = Math.max(1, this.mount.clientHeight);
    this.renderer.setSize(width, height, false); this.camera.aspect = width/height;
    this.camera.updateProjectionMatrix(); if(this.bounds) this.fit();
  }
  clear() {
    this.generation++;
    this.mixer?.stopAllAction(); if(this.model) this.mixer?.uncacheRoot(this.model);
    if(this.helper) { this.scene.remove(this.helper); this.helper.dispose(); }
    if(this.root) this.scene.remove(this.root);
    if(this.vrm) disposeVrm(this.vrm); else if(this.model) this.disposeObject(this.model);
    this.vrm = this.model = this.root = this.mixer = this.action = this.helper = this.bounds = null;
    this.clips = []; this.renderer.renderLists.dispose();
  }
  disposeObject(model) {
    const textures = new Set();
    model.traverse(o => { if(!o.isMesh) return; o.geometry.dispose(); for(const m of Array.isArray(o.material) ? o.material : [o.material]) { for(const v of Object.values(m)) if(v?.isTexture) textures.add(v); m.dispose(); } });
    for(const t of textures) t.dispose();
  }
  async load(url) {
    this.clear(); const generation = this.generation;
    const gltf = await configureAvatarVrmLoader(new GLTFLoader()).loadAsync(url);
    const vrm = gltf.userData.vrm;
    const dispose = () => vrm ? disposeVrm(vrm) : this.disposeObject(gltf.scene);
    if (generation !== this.generation) { dispose(); return null; }
    const kind = detectVrmKind(gltf.parser.json);
    let clips = gltf.animations; const embedded = clips.length > 0;
    try { if (!embedded && vrm) clips = await getSharedAvatarClips({ vrm, vrmKind: kind, hipsPosition: false }); }
    catch(error) { dispose(); throw error; }
    if (generation !== this.generation) { dispose(); return null; }
    this.vrm = vrm; this.model = vrm?.scene || gltf.scene; this.clips = clips;
    if(vrm) vrm.humanoid.autoUpdateHumanBones = !embedded;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.root = new THREE.Group(); this.root.rotation.y = kind === 'vrm0' ? Math.PI : 0; this.root.add(this.model);
    this.scene.add(this.root);
    this.setAnimation(clips.findIndex(c => c.name.toLowerCase() === 'idle') >= 0 ? clips.findIndex(c => c.name.toLowerCase() === 'idle') : clips.length ? 0 : -1);
    const bounds = measureAvatarSpatialBounds(this.model);
    const normalized = normalizeAvatarBounds({ minY: bounds.minY, maxY: bounds.maxY, targetHeight: 1.7 });
    this.root.scale.setScalar(normalized.scale); this.root.position.y = normalized.positionY;
    this.root.updateMatrix();
    const box = new THREE.Box3(new THREE.Vector3(bounds.minX,bounds.minY,bounds.minZ),new THREE.Vector3(bounds.maxX,bounds.maxY,bounds.maxZ)).applyMatrix4(this.root.matrix);
    this.bounds = { minX:box.min.x,minY:box.min.y,minZ:box.min.z,maxX:box.max.x,maxY:box.max.y,maxZ:box.max.z };
    this.fit(); this.setWireframe(false); this.controls.autoRotate = false;
    let triangles = 0, meshes = 0, bones = 0;
    this.model.traverse(o => { if(o.isMesh) {meshes++; triangles += (o.geometry.index?.count || o.geometry.attributes.position?.count || 0)/3;} if(o.isBone) bones++; });
    this.renderer.render(this.scene, this.camera);
    return { clips: clips.map(c => c.name), embedded, kind, triangles: Math.round(triangles), meshes, bones, expressions: Object.keys(vrm?.expressionManager?.expressionMap || {}) };
  }
  fit() {
    if(!this.bounds) return;
    const f=fitAvatarPreviewCamera({bounds:this.bounds,aspect:this.camera.aspect,verticalFovDegrees:this.camera.fov,padding:1.04});
    this.controls.target.set(f.target.x,f.target.y,f.target.z);
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3(.12,.03,1).normalize().multiplyScalar(f.distance));
    this.camera.near=.01; this.camera.far=f.far; this.controls.minDistance=f.radius*.4; this.controls.maxDistance=f.maxDistance;
    this.camera.updateProjectionMatrix(); this.controls.update(); this.controls.saveState();
  }
  setAnimation(index) {
    this.mixer?.stopAllAction(); this.action = null;
    this.vrm?.humanoid?.resetNormalizedPose(); this.vrm?.humanoid?.resetRawPose();
    if(this.clips?.[index]) this.action = this.mixer.clipAction(this.clips[index]).reset().play();
    this.mixer?.update(0); this.vrm?.update(0);
  }
  seek(fraction) {
    if(!this.action) return;
    this.action.time = fraction*this.action.getClip().duration; this.mixer.update(0); this.vrm?.update(0);
  }
  setWireframe(enabled) { this.model?.traverse(o => { if(o.isMesh) for(const material of Array.isArray(o.material)?o.material:[o.material]) material.wireframe=enabled; }); }
  setSkeleton(enabled) {
    if(!this.model) return;
    if(enabled && !this.helper) { this.helper=new THREE.SkeletonHelper(this.model); this.helper.material.depthTest=false; this.helper.renderOrder=10; this.scene.add(this.helper); }
    if(this.helper) this.helper.visible=enabled;
  }
  setExpression(name,value) { this.vrm?.expressionManager?.setValue(name,value); this.vrm?.update(0); }
  async snapshot() {
    this.renderer.render(this.scene,this.camera);
    return new Promise((resolve,reject) => this.renderer.domElement.toBlob(blob => blob?resolve(blob):reject(new Error(t('Не удалось создать PNG'))), 'image/png'));
  }
  dispose() { this.clear(); this.resizeObserver.disconnect(); this.controls.dispose(); this.renderer.setAnimationLoop(null); this.renderer.dispose(); this.renderer.domElement.remove(); }
}
