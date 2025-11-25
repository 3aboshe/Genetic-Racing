// Main simulation script for GA F1 Racing
// Lightweight single-file implementation for teaching

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// UI elements
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const speedEl = document.getElementById('speed');
const speedVal = document.getElementById('speedVal');
const popSizeEl = document.getElementById('popSize');
const genEl = document.getElementById('gen');
const bestEl = document.getElementById('best');
const aliveEl = document.getElementById('alive');
const inputsEl = document.getElementById('inputs');
const weightsEl = document.getElementById('weights');
const actsEl = document.getElementById('activations');
const fitnessEl = document.getElementById('fitnessCalc');
const mutRateEl = document.getElementById('mutRate');
const crossRateEl = document.getElementById('crossRate');

// Load assets
const carImages = {
  red: new Image(),
  yellow: new Image(),
  orange: new Image(),
  green: new Image()
};
carImages.red.src = 'assets/redf1.png';
carImages.yellow.src = 'assets/yellowf1.png';
carImages.orange.src = 'assets/orangef1.png';
carImages.green.src = 'assets/greenf1.png';

let running = false;
let frame = 0;
let simSpeed = Number(speedEl.value);
let populationSize = Number(popSizeEl.value);

// Track definition
const track = {
  centerLine: [],
  innerWall: [],
  outerWall: [],
  checkpoints: [],
  start: {x: 100, y: 100, angle: 0},
  width: 50 // half-width
};

// Build a complex track with walls
(function buildTrack(){
  // Define center path points (Moderate difficulty: Oval with a slight twist)
  const points = [
    {x: 150, y: 360}, // Start
    {x: 350, y: 150}, // Top Left
    {x: 700, y: 150}, // Top Right (Start of twist)
    {x: 850, y: 250}, // Dip
    {x: 1000, y: 150}, // Up again
    {x: 1100, y: 360}, // Far Right
    {x: 900, y: 570}, // Bottom Right
    {x: 350, y: 570}  // Bottom Left
  ];
  
  // Catmull-Rom Spline Interpolation for smooth curves
  function spline(p0, p1, p2, p3, t) {
    const tt = t * t;
    const ttt = tt * t;
    return {
      x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * ttt),
      y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * ttt)
    };
  }

  // Generate dense smooth path
  for(let i=0; i<points.length; i++){
    const p0 = points[(i - 1 + points.length) % points.length];
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const p3 = points[(i + 2) % points.length];
    
    const steps = 50; // High resolution for smoothness
    for(let j=0; j<steps; j++){
      const t = j/steps;
      track.centerLine.push(spline(p0, p1, p2, p3, t));
    }
  }

  // Generate walls
  const w = 45; // Slightly wider (Easier)
  for(let i=0; i<track.centerLine.length; i++){
    const p1 = track.centerLine[i];
    const p2 = track.centerLine[(i+1)%track.centerLine.length];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const nx = -dy/len; // normal
    const ny = dx/len;
    
    track.innerWall.push({x: p1.x + nx*w, y: p1.y + ny*w});
    track.outerWall.push({x: p1.x - nx*w, y: p1.y - ny*w});
    
    // Checkpoints
    if(i % 30 === 0) track.checkpoints.push(p1);
  }
  
  track.start = {x: track.centerLine[0].x, y: track.centerLine[0].y, angle: Math.atan2(track.centerLine[1].y - track.centerLine[0].y, track.centerLine[1].x - track.centerLine[0].x)};
})();

// Utility functions
function rand(min=-1,max=1){return Math.random()*(max-min)+min}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function lerp(a,b,t){return a+(b-a)*t}

// Line intersection
function getIntersection(A, B, C, D) {
  const tTop = (D.x - C.x) * (A.y - C.y) - (D.y - C.y) * (A.x - C.x);
  const uTop = (C.y - A.y) * (A.x - B.x) - (C.x - A.x) * (A.y - B.y);
  const bottom = (D.y - C.y) * (B.x - A.x) - (D.x - C.x) * (B.y - A.y);
  if (bottom !== 0) {
    const t = tTop / bottom;
    const u = uTop / bottom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return { x: lerp(A.x, B.x, t), y: lerp(A.y, B.y, t), offset: t };
    }
  }
  return null;
}

// Car physics and drawing
class Car {
  constructor(brain, generation=0){
    this.pos = {x: track.start.x, y: track.start.y};
    this.vel = {x:0,y:0};
    this.angle = track.start.angle;
    this.steer = 0;
    this.throttle = 0;
    this.width = 20; 
    this.length = 40;
    this.maxSpeed = 12.0; // Faster = Harder to control
    this.alive = true;
    this.age = 0;
    this.brain = brain || new Brain();
    this.generation = generation;
    this.distance = 0;
    this.checkpointIndex = 0;
    this.fitness = 0;
    this.sensors = [];
  }

  reset(){
    this.pos = {x: track.start.x, y: track.start.y};
    this.vel = {x:0,y:0};
    this.angle = track.start.angle;
    this.alive = true; this.age=0; this.distance=0; this.checkpointIndex=0; this.fitness=0;
    this.vel.x = Math.cos(this.angle)*2; // give a little push
    this.vel.y = Math.sin(this.angle)*2;
  }

  step(dt){
    if(!this.alive) return;
    this.age += dt;

    // Kill if too slow (prevent crawling)
    const currentSpeed = Math.hypot(this.vel.x, this.vel.y);
    if(this.age > 20 && currentSpeed < 1.5) this.alive = false;

    // Sensors (Ray casting)
    const rays = 9; // More eyes = better vision
    const maxDist = 180;
    this.sensors = [];
    
    for(let i=0;i<rays;i++){
      const a = lerp(-Math.PI/1.5, Math.PI/1.5, i/(rays-1)); // Wider field of view
      const angle = this.angle + a;
      const start = {x: this.pos.x, y: this.pos.y};
      const end = {x: this.pos.x + Math.cos(angle)*maxDist, y: this.pos.y + Math.sin(angle)*maxDist};
      
      let minD = 1.0; // normalized
      
      // Check against all wall segments
      // Optimization: only check nearby segments? For now check all (simpler)
      const walls = [...track.innerWall, ...track.outerWall]; // This is points, need segments
      
      // Helper to check a polyline
      const checkPoly = (poly) => {
        for(let j=0; j<poly.length-1; j++){
          const hit = getIntersection(start, end, poly[j], poly[j+1]);
          if(hit && hit.offset < minD) minD = hit.offset;
        }
        // close loop
        const hit = getIntersection(start, end, poly[poly.length-1], poly[0]);
        if(hit && hit.offset < minD) minD = hit.offset;
      };
      
      checkPoly(track.innerWall);
      checkPoly(track.outerWall);
      
      this.sensors.push(minD);
    }

    // Check collision (if any sensor is very close to 0)
    if(this.sensors.some(s => s < 0.05)) this.alive = false;

    // Inputs
    const inputs = [...this.sensors, this.throttle, this.steer]; // 9 + 2 = 11 inputs
    const out = this.brain.predict(inputs);
    
    this.steer = clamp(out[0]*2-1, -1, 1); // -1 to 1
    this.throttle = clamp(out[1], 0.2, 1); // always at least a little gas

    // Physics
    const speed = Math.hypot(this.vel.x, this.vel.y);
    
    // Turning
    this.angle += this.steer * 0.1 * (speed/this.maxSpeed);
    
    // Acceleration
    const force = {x: Math.cos(this.angle)*this.throttle*0.5, y: Math.sin(this.angle)*this.throttle*0.5};
    this.vel.x += force.x;
    this.vel.y += force.y;
    
    // Friction (Grippier)
    this.vel.x *= 0.95;
    this.vel.y *= 0.95;
    
    this.pos.x += this.vel.x;
    this.pos.y += this.vel.y;

    // Checkpoints & Fitness
    // Find closest checkpoint
    // We assume sequential progress
    const nextCpIdx = (this.checkpointIndex + 1) % track.checkpoints.length;
    const nextCp = track.checkpoints[nextCpIdx];
    const distToNext = Math.hypot(nextCp.x - this.pos.x, nextCp.y - this.pos.y);
    
    if(distToNext < 40){
      this.checkpointIndex++;
      this.age = 0; // reset age on progress to prevent timeout
    }
    
    // Fitness: Checkpoints passed + progress to next
    this.fitness = this.checkpointIndex + (1 - distToNext/200);
    
    // Timeout
    if(this.age > 100) this.alive = false; // Die if stuck for too long
  }

  draw(ctx, highlight=false){
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle); // No offset for landscape images

    // Select image based on generation/performance
    // Red -> Yellow -> Orange -> Green
    let img = carImages.red;
    if(this.generation > 5) img = carImages.yellow;
    if(this.generation > 15) img = carImages.orange;
    if(this.generation > 30) img = carImages.green;
    
    // Draw image (Landscape: Length is width, Width is height)
    const w = this.length;
    const h = this.width;
    try {
        ctx.drawImage(img, -w/2, -h/2, w, h);
    } catch(e) {
        // Fallback if image not loaded
        ctx.fillStyle = 'red';
        ctx.fillRect(-w/2, -h/2, w, h);
    }

    if(highlight){
      ctx.strokeStyle = '#0071e3'; ctx.lineWidth=2; // Apple blue highlight
      ctx.strokeRect(-w/2 - 2, -h/2 - 2, w+4, h+4);
    }
    ctx.restore();
    
    // Sensors
    if(highlight){
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 113, 227, 0.4)'; // Apple blue, semi-transparent
        for(let i=0;i<this.sensors.length;i++){
            const a = lerp(-Math.PI/2.5, Math.PI/2.5, i/(this.sensors.length-1));
            const angle = this.angle + a;
            const dist = this.sensors[i] * 150;
            ctx.beginPath();
            ctx.moveTo(this.pos.x, this.pos.y);
            ctx.lineTo(this.pos.x + Math.cos(angle)*dist, this.pos.y + Math.sin(angle)*dist);
            ctx.stroke();
        }
        ctx.restore();
    }
  }
}

// Brain (Neural Network)
class Brain {
  constructor(inputSize=11, hiddenSize=12, outputSize=2, weights){ // 9 sensors + 2 inputs
    this.i = inputSize; this.h = hiddenSize; this.o = outputSize;
    if(weights) this.weights = weights.slice();
    else{
      this.weights = [];
      for(let k=0;k<(this.i+1)*this.h + (this.h+1)*this.o; k++) this.weights.push(rand()*2);
    }
  }

  clone(){ return new Brain(this.i,this.h,this.o,this.weights); }
  getGenes(){ return this.weights.slice(); }
  setGenes(arr){ this.weights = arr.slice(); }

  predict(inputs){
    // Simple dense layer implementation
    let wIdx = 0;
    const hid = [];
    for(let h=0; h<this.h; h++){
      let sum = 0;
      for(let i=0; i<this.i; i++) sum += inputs[i] * this.weights[wIdx++];
      sum += this.weights[wIdx++]; // bias
      hid.push(Math.tanh(sum));
    }
    
    const out = [];
    for(let o=0; o<this.o; o++){
      let sum = 0;
      for(let h=0; h<this.h; h++) sum += hid[h] * this.weights[wIdx++];
      sum += this.weights[wIdx++]; // bias
      out.push(Math.tanh(sum)); // -1 to 1
    }
    
    this.lastInputs = inputs;
    this.lastHidden = hid;
    this.lastOutput = out;
    return out;
  }
}

// GA
function mutate(genes, rate=0.1){
  return genes.map(g => Math.random()<rate ? g + rand()*0.5 : g);
}

function crossover(a, b){
  const pt = Math.floor(Math.random()*a.length);
  return a.slice(0,pt).concat(b.slice(pt));
}

let population = [];
let generation = 0;
let bestCar = null;

function init(){
  population = [];
  for(let i=0; i<populationSize; i++) population.push(new Car(null, 0));
  generation = 0;
}

function evolve(){
  population.sort((a,b) => b.fitness - a.fitness);
  bestCar = population[0];
  
  const newPop = [];
  // Elitism
  newPop.push(new Car(population[0].brain.clone(), generation));
  newPop.push(new Car(population[1].brain.clone(), generation));
  
  while(newPop.length < populationSize){
    const p1 = population[Math.floor(Math.random()*population.length/2)]; // Top 50%
    const p2 = population[Math.floor(Math.random()*population.length/2)];
    const childGenes = mutate(crossover(p1.brain.getGenes(), p2.brain.getGenes()), Number(mutRateEl.value));
    const childBrain = new Brain();
    childBrain.setGenes(childGenes);
    newPop.push(new Car(childBrain, generation+1));
  }
  population = newPop;
  generation++;
  population.forEach(c => c.reset());
  updateUI();
}

// Loop
function loop(){
  if(running){
    for(let s=0; s<simSpeed; s++){
      let active = 0;
      population.forEach(c => {
        c.step(0.5);
        if(c.alive) active++;
      });
      aliveEl.textContent = active;
      if(active === 0) evolve();
    }
  }
  
  // Render
  // Clear background (White for light theme)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,W,H);
  
  // Draw Track
  // Walls
  ctx.strokeStyle = '#d1d1d6'; // Light gray border
  ctx.lineWidth = 3;
  
  // Inner wall
  ctx.beginPath();
  track.innerWall.forEach((p,i) => i==0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
  ctx.closePath(); ctx.stroke();
  
  // Outer wall
  ctx.beginPath();
  track.outerWall.forEach((p,i) => i==0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
  ctx.closePath(); ctx.stroke();
  
  // Track surface (Light concrete/asphalt)
  ctx.save();
  ctx.beginPath();
  track.outerWall.forEach((p,i) => i==0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
  ctx.closePath();
  ctx.fillStyle = '#f2f2f7'; // Very light gray track
  ctx.fill();
  
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  track.innerWall.forEach((p,i) => i==0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  
  // Draw Checkpoints (debug)
  // ctx.fillStyle = 'rgba(0,255,0,0.1)';
  // track.checkpoints.forEach(p => { ctx.beginPath(); ctx.arc(p.x,p.y,5,0,Math.PI*2); ctx.fill(); });

  // Draw Cars
  let best = population[0];
  population.forEach(c => {
    if(c.fitness > best.fitness) best = c;
    c.draw(ctx, false);
  });
  best.draw(ctx, true); // Draw best on top
  
  // Update Math UI (Throttle to every 5 frames)
  if(frame % 5 === 0 && best.brain.lastInputs){
    const fmt = arr => arr.map(n => n.toFixed(2)).join(', ');
    inputsEl.textContent = fmt(best.brain.lastInputs);
    weightsEl.textContent = fmt(best.brain.weights.slice(0,10)) + '...';
    actsEl.textContent = 'Hidden: ' + fmt(best.brain.lastHidden) + '\nOutput: ' + fmt(best.brain.lastOutput);
    fitnessEl.textContent = `Checkpoints: ${best.checkpointIndex}\nDist Score: ${(best.fitness - best.checkpointIndex).toFixed(3)}\nTotal: ${best.fitness.toFixed(3)}`;
  }
  frame++;

  requestAnimationFrame(loop);
}

// UI
startBtn.onclick = () => { running = true; };
pauseBtn.onclick = () => { running = false; };
resetBtn.onclick = () => { 
  populationSize = Number(popSizeEl.value);
  init(); 
  updateUI();
};
speedEl.oninput = () => { simSpeed = Number(speedEl.value); speedVal.textContent = simSpeed; };
popSizeEl.onchange = () => {
  populationSize = Number(popSizeEl.value);
  init();
  updateUI();
};

function updateUI(){
  genEl.textContent = generation;
  if(bestCar) bestEl.textContent = bestCar.fitness.toFixed(2);
}

init();
loop();
