/* =====================================================================
   G2Point — Hero Scene 3D
   Three.js vanilla : grille de particules réactive à la souris
   Performance : ~3000 particules, optimisé requestAnimationFrame
   ===================================================================== */
(function () {
  'use strict';

  // Ne rien faire si l'élément hero n'existe pas (page de jeu par ex.)
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;

  // Respecter prefers-reduced-motion
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  // Chargement dynamique de Three.js
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';

  import(THREE_URL).then(THREE => {
    initScene(THREE);
  }).catch(err => {
    console.warn('[G2Point HeroScene] Three.js non chargé, fond statique conservé.', err);
  });

  function initScene(THREE) {
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050410, 0.045);

    const camera = new THREE.PerspectiveCamera(
      60,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 4.5, 11);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.setClearColor(0x000000, 0);

    /* ---- Particules formant une grille néon ---- */
    const PARTICLE_COUNT = 1800;
    const GRID_WIDTH = 30;
    const GRID_DEPTH = 30;
    const SPACING = 1;

    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const originalPositions = new Float32Array(PARTICLE_COUNT * 3);

    // Palette néon
    const palette = [
      new THREE.Color(0x05d9e8), // cyan
      new THREE.Color(0xff2a6d), // hot pink
      new THREE.Color(0x7c5cff), // violet
      new THREE.Color(0x39ff14)  // vert
    ];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ix = i % GRID_WIDTH;
      const iz = Math.floor(i / GRID_WIDTH) % GRID_DEPTH;
      const iy = Math.floor(i / (GRID_WIDTH * GRID_DEPTH));

      const x = (ix - GRID_WIDTH / 2) * SPACING + (Math.random() - 0.5) * 0.3;
      const y = (iy - 0.5) * 0.6 + (Math.random() - 0.5) * 0.4;
      const z = (iz - GRID_DEPTH / 2) * SPACING + (Math.random() - 0.5) * 0.3;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      originalPositions[i * 3] = x;
      originalPositions[i * 3 + 1] = y;
      originalPositions[i * 3 + 2] = z;

      const color = palette[i % palette.length];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Texture circulaire pour particules douces
    const particleTexture = createCircleTexture(THREE);

    const material = new THREE.PointsMaterial({
      size: 0.18,
      map: particleTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    /* ---- Lignes néon discrètes (wireframe) ---- */
    const wireGeometry = new THREE.PlaneGeometry(40, 40, 20, 20);
    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0x05d9e8,
      wireframe: true,
      transparent: true,
      opacity: 0.06
    });
    const wirePlane = new THREE.Mesh(wireGeometry, wireMaterial);
    wirePlane.rotation.x = -Math.PI / 2;
    wirePlane.position.y = -2.5;
    scene.add(wirePlane);

    /* ---- Lumières ---- */
    const ambient = new THREE.AmbientLight(0x6a5cff, 0.4);
    scene.add(ambient);

    const pointLight1 = new THREE.PointLight(0x05d9e8, 2, 30);
    pointLight1.position.set(-8, 6, 5);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xff2a6d, 1.6, 30);
    pointLight2.position.set(8, 4, -3);
    scene.add(pointLight2);

    /* ---- État souris pour interactivité ---- */
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    let isVisible = true;

    window.addEventListener('pointermove', (e) => {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    // Pause quand le hero sort de l'écran (perf)
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => { isVisible = entry.isIntersecting; });
      }, { threshold: 0 });
      observer.observe(canvas);
    }

    /* ---- Resize ---- */
    function resize() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    /* ---- Animation loop ---- */
    const clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);
      if (!isVisible) return;

      const t = clock.getElapsedTime();

      // Lerp souris
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;

      // Vagues sur les particules
      const posAttr = geometry.attributes.position;
      const arr = posAttr.array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const ox = originalPositions[i * 3];
        const oy = originalPositions[i * 3 + 1];
        const oz = originalPositions[i * 3 + 2];

        const wave = Math.sin(t * 0.8 + (ox + oz) * 0.4) * 0.35;
        const wave2 = Math.cos(t * 0.5 + ox * 0.3) * 0.2;
        arr[i * 3 + 1] = oy + wave + wave2;

        // Influence souris (élévation locale)
        const dx = ox - mouse.x * 6;
        const dz = oz - mouse.y * 6;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const mouseFactor = Math.max(0, 1 - dist / 5);
        arr[i * 3 + 1] += mouseFactor * 1.5;
      }
      posAttr.needsUpdate = true;

      // Rotation lente du nuage
      points.rotation.y = t * 0.04;
      points.rotation.x = Math.sin(t * 0.1) * 0.05;

      // Mouvement camera (parallax souris)
      camera.position.x += (mouse.x * 2 - camera.position.x) * 0.04;
      camera.position.y += (4.5 - mouse.y * 1.5 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);

      // Lumières orbitales
      pointLight1.position.x = Math.sin(t * 0.4) * 9;
      pointLight1.position.z = Math.cos(t * 0.4) * 9;
      pointLight2.position.x = Math.sin(t * 0.4 + Math.PI) * 9;
      pointLight2.position.z = Math.cos(t * 0.4 + Math.PI) * 9;

      renderer.render(scene, camera);
    }
    animate();
  }

  /* ---- Texture particule douce (cercle dégradé) ---- */
  function createCircleTexture(THREE) {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2
    );
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.8)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.2)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }
})();
