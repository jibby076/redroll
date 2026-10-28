import * as THREE from 'three';
import * as CANNON from 'cannon-es';

let scene, camera, renderer;
let world;
let ballBody, ballMesh;
let platforms = [];
let goalMesh, goalBody;
let goalReached = false;
let keys = {};
let canJump = false;

const startPos = new CANNON.Vec3(0, 5, 0);

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 10, 50);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 8, 12);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    scene.add(directionalLight);

    // Physics World
    world = new CANNON.World();
    world.gravity.set(0, -20, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 10;

    // Ball
    const ballShape = new CANNON.Sphere(1);
    ballBody = new CANNON.Body({ mass: 5, shape: ballShape });
    ballBody.position.copy(startPos);
    ballBody.linearDamping = 0.4;
    ballBody.angularDamping = 0.4;
    world.addBody(ballBody);

    const ballGeo = new THREE.SphereGeometry(1, 32, 32);
    const ballMat = new THREE.MeshPhongMaterial({ color: 0xff0000, shininess: 50 });
    ballMesh = new THREE.Mesh(ballGeo, ballMat);
    ballMesh.castShadow = true;
    scene.add(ballMesh);

    // Create Level
    createLevel();

    // Goal
    createGoal();

    // Controls
    document.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        if (e.key.toLowerCase() === 'r' && goalReached) {
            resetGame();
        }
        if (e.code === 'Space' && canJump && !goalReached) {
            const jumpDir = new CANNON.Vec3(0, 0, 0);
            if (keys['arrowup'] || keys['w']) jumpDir.z -= 1;
            if (keys['arrowdown'] || keys['s']) jumpDir.z += 1;
            if (keys['arrowleft'] || keys['a']) jumpDir.x -= 1;
            if (keys['arrowright'] || keys['d']) jumpDir.x += 1;
            if (jumpDir.length() > 0) jumpDir.normalize();
            ballBody.applyImpulse(new CANNON.Vec3(jumpDir.x * 20, 40, jumpDir.z * 20), ballBody.position);
            canJump = false;
        }
    });
    document.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
    });

    window.addEventListener('resize', onWindowResize);

    animate();
}

function createPlatform(x, y, z, width, depth) {
    const shape = new CANNON.Box(new CANNON.Vec3(width/2, 0.5, depth/2));
    const body = new CANNON.Body({ mass: 0, shape: shape });
    body.position.set(x, y, z);
    world.addBody(body);

    const geo = new THREE.BoxGeometry(width, 1, depth);
    const mat = new THREE.MeshPhongMaterial({ color: 0x228B22 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(body.position);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
    platforms.push({ body, mesh });
}

function createLevel() {
    // Starting platform
    createPlatform(0, 0, 0, 10, 10);
    
    // Path to goal - closer platforms for easier jumping
    createPlatform(0, 0, -10, 8, 6);
    createPlatform(0, 0.5, -18, 7, 6);
    createPlatform(0, 1, -26, 7, 6);
    createPlatform(0, 1.5, -34, 6, 6);
    createPlatform(0, 2, -42, 6, 6);
    createPlatform(0, 2.5, -50, 8, 6);
}

function createGoal() {
    const shape = new CANNON.Cylinder(2, 2, 0.2, 16);
    const body = new CANNON.Body({ mass: 0, shape: shape });
    body.position.set(0, 3.1, -58);
    world.addBody(body);

    const geo = new THREE.CylinderGeometry(2, 2, 0.2, 16);
    const mat = new THREE.MeshPhongMaterial({ 
        color: 0x00ff00, 
        emissive: 0x00ff00,
        emissiveIntensity: 0.5
    });
    goalMesh = new THREE.Mesh(geo, mat);
    goalMesh.position.copy(body.position);
    goalMesh.receiveShadow = true;
    scene.add(goalMesh);
    goalBody = body;
}

function resetGame() {
    ballBody.position.copy(startPos);
    ballBody.velocity.set(0, 0, 0);
    ballBody.angularVelocity.set(0, 0, 0);
    goalReached = false;
    document.getElementById('winScreen').style.display = 'none';
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function updatePhysics() {
    if (goalReached) {
        world.fixedStep();
        return;
    }

    const force = 15;
    if (keys['arrowup'] || keys['w']) {
        ballBody.applyForce(new CANNON.Vec3(0, 0, -force), ballBody.position);
    }
    if (keys['arrowdown'] || keys['s']) {
        ballBody.applyForce(new CANNON.Vec3(0, 0, force), ballBody.position);
    }
    if (keys['arrowleft'] || keys['a']) {
        ballBody.applyForce(new CANNON.Vec3(-force, 0, 0), ballBody.position);
    }
    if (keys['arrowright'] || keys['d']) {
        ballBody.applyForce(new CANNON.Vec3(force, 0, 0), ballBody.position);
    }

    // Ground check for jumping using contacts
    canJump = false;
    for (let i = 0; i < world.contacts.length; i++) {
        const contact = world.contacts[i];
        if (contact.bi.id === ballBody.id || contact.bj.id === ballBody.id) {
            let normal = contact.ni;
            if (contact.bj.id === ballBody.id) {
                normal = new CANNON.Vec3(-contact.ni.x, -contact.ni.y, -contact.ni.z);
            }
            if (normal.y > 0.5) {
                canJump = true;
                break;
            }
        }
    }

    // Check if fallen off
    if (ballBody.position.y < -10) {
        resetGame();
    }

    // Check goal
    const dist = ballBody.position.distanceTo(goalBody.position);
    if (dist < 3 && !goalReached) {
        goalReached = true;
        document.getElementById('winScreen').style.display = 'block';
    }

    world.fixedStep();
}

function updateCamera() {
    const ballPos = ballBody.position;
    const targetX = ballPos.x;
    const targetY = ballPos.y + 6;
    const targetZ = ballPos.z + 10;
    
    camera.position.x += (targetX - camera.position.x) * 0.1;
    camera.position.y += (targetY - camera.position.y) * 0.1;
    camera.position.z += (targetZ - camera.position.z) * 0.1;
    
    camera.lookAt(ballPos.x, ballPos.y, ballPos.z);
}

function animate() {
    requestAnimationFrame(animate);
    
    updatePhysics();
    updateCamera();
    
    // Update ball mesh
    ballMesh.position.copy(ballBody.position);
    ballMesh.quaternion.copy(ballBody.quaternion);
    
    renderer.render(scene, camera);
}

init();
