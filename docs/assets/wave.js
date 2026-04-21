const COMPUTE_SHADER_CODE = `
struct Uniforms {
    time: f32,
    domain_length: f32,
    num_particles: u32,
    grid_size: u32,
};

struct Camera {
    view_proj: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<uniform> camera: Camera;

struct Particle {
    pos_x: f32,
    pos_y: f32,
    pos_z: f32,
    vel_x: f32,
    vel_y: f32,
    vel_z: f32,
    state: f32,
    life: f32,
};

@group(0) @binding(2) var<storage, read_write> particles: array<Particle>;

struct WaveData {
    data0: vec4<f32>, // x: bottom_z, y: amplitude, z: phase, w: k
    data1: vec4<f32>, // x: c, y: H_max, z: -, w: -
};

@group(0) @binding(3) var<storage, read> wave_grid: array<WaveData>;

// Pseudorandom number generator
fn rand(co: vec2<f32>) -> f32 {
    return fract(sin(dot(co.xy, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

fn get_wave_data(x: f32) -> WaveData {
    let normalized_x = clamp(x / uniforms.domain_length, 0.0, 0.9999);
    let idx = u32(normalized_x * f32(uniforms.grid_size));
    return wave_grid[idx];
}

@compute @workgroup_size(256)
fn compute_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    if (index >= uniforms.num_particles) {
        return;
    }

    var p = particles[index];
    let dt = 0.016; 

    let wd = get_wave_data(p.pos_x);
    let bottom_z = wd.data0.x;
    
    if (p.state == 3.0) {
        p.pos_z = bottom_z - 0.2;
        particles[index] = p;
        return;
    }

    let A = wd.data0.y;
    let phase = wd.data0.z;
    let k = wd.data0.w;
    let c = wd.data1.x;
    let max_H = wd.data1.y;

    let omega = 2.0 * 3.14159265 / 14.0;
    
    // Time for wave to reach this x:
    let travel_time = phase / omega;
    let pulse_period = 10.0;
    
    var wave_vel_x = 0.0;
    var wave_vel_z = 0.0;
    var surface_z = 0.0;
    
    for (var i = -1; i <= 2; i = i + 1) {
        let pulse_index = floor(uniforms.time / pulse_period) + f32(i);
        let pulse_emission_time = pulse_index * pulse_period;
        
        let time_diff = uniforms.time - pulse_emission_time - travel_time;
        // Spatial distance from pulse center (approximate)
        let dist = time_diff * c;
        
        // Gaussian envelope (width of the packet)
        let envelope = exp(- (dist * dist) / (30.0 * 30.0)); 
        
        // Carrier phase
        let p_phase = phase - omega * (uniforms.time - pulse_emission_time);
        
        let d = max(-bottom_z, 0.1);
        let depth_factor = p.pos_z + d; 
        
        let sinh_kd = sinh(k * d);
        let cosh_kzd = cosh(k * depth_factor);
        let sinh_kzd = sinh(k * depth_factor);
        
        let u = A * omega * cos(p_phase) * cosh_kzd / max(sinh_kd, 0.001) * envelope;
        let w = A * omega * sin(p_phase) * sinh_kzd / max(sinh_kd, 0.001) * envelope;
        
        wave_vel_x += u;
        wave_vel_z += w;
        
        surface_z += A * cos(p_phase) * envelope;
    }

    if (p.state == 0.0) {
        let depth_col = clamp((p.pos_z - bottom_z) / 10.0, 0.0, 1.0);
        let speed_col = clamp(length(vec3<f32>(p.vel_x, p.vel_y, p.vel_z)) / max(wd.data1.x, 0.001), 0.0, 1.0);
        out.color = vec4<f32>(0.0, 0.2 + 0.5 * speed_col, 0.4 + 0.6 * depth_col, 0.5);
    } else if (p.state == 3.0) {
        let depth_col = clamp((p.pos_z + 10.0) / 10.0, 0.0, 1.0);
        out.color = vec4<f32>(0.1 + 0.1*depth_col, 0.2 + 0.1*depth_col, 0.3 + 0.2*depth_col, 0.8);
    } else {
        let intensity = clamp(p.life / 2.0, 0.0, 1.0);
        out.color = vec4<f32>(0.8 * intensity, 0.9 * intensity, 1.0 * intensity, intensity * 0.8);
    }
    
    return out;
}

@fragment
fn fragment_main(in: VertexOutput) -> @location(0) vec4<f32> {
    return in.color;
}
`;

let waveAnimFrame = null;
let waveRunning = false;
let waveInitialized = false;

window.waveStart = async function() {
    waveRunning = true;
    
    const canvas = document.getElementById('wave-canvas');
    if (!canvas) return;

    if (waveInitialized) {
        return; // Frame loop is still active but blocked by waveRunning
    }

    if (!navigator.gpu) {
        console.warn("WebGPU not supported. Running 2D fallback.");
        runFallback2D(canvas);
        return;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        console.warn("No WebGPU adapter found. Running 2D fallback.");
        runFallback2D(canvas);
        return;
    }

    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');

    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device,
        format: presentationFormat,
        alphaMode: 'premultiplied',
    });

    const numParticles = 250000;
    const domainLength = 200.0;
    const gridSize = 1024;

    const particleBuffer = device.createBuffer({
        size: numParticles * 32,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });

    const particleData = new Float32Array(particleBuffer.getMappedRange());
    for (let i = 0; i < numParticles; i++) {
        const isFloor = i >= 200000;
        const x = Math.random() * domainLength;
        const y = (Math.random() - 0.5) * (isFloor ? 60.0 : 40.0);
        const z = -Math.random() * 10.0;
        
        particleData[i * 8 + 0] = x;
        particleData[i * 8 + 1] = y;
        particleData[i * 8 + 2] = isFloor ? -10.0 : z;
        particleData[i * 8 + 3] = 0;
        particleData[i * 8 + 4] = 0;
        particleData[i * 8 + 5] = 0;
        particleData[i * 8 + 6] = isFloor ? 3.0 : 0.0;
        particleData[i * 8 + 7] = z;
    }
    particleBuffer.unmap();

    const waveGridBuffer = device.createBuffer({
        size: gridSize * 32,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const waveGridData = new Float32Array(gridSize * 8);
    let phase = 0;
    const omega = 2.0 * Math.PI / 14.0;
    const base_d = 10.0;
    const c_base = Math.sqrt(9.81 * base_d);
    const base_amplitude = 1.5;

    for (let i = 0; i < gridSize; i++) {
        let x = (i / gridSize) * domainLength;
        let d = 10.0;
        if (x > 70 && x < 90) d = 10.0 - 8.0 * ((x - 70) / 20.0);
        else if (x >= 90 && x <= 110) d = 2.0;
        else if (x > 110 && x < 130) d = 2.0 + 8.0 * ((x - 110) / 20.0);
        
        let c = Math.sqrt(9.81 * d);
        let k = omega / c;
        let amp = base_amplitude * Math.sqrt(c_base / c);
        
        const max_H = 0.78 * d;
        if (amp * 2.0 > max_H) amp = max_H / 2.0;
        
        waveGridData[i * 8 + 0] = -d;
        waveGridData[i * 8 + 1] = amp;
        waveGridData[i * 8 + 2] = phase;
        waveGridData[i * 8 + 3] = k;
        waveGridData[i * 8 + 4] = c;
        waveGridData[i * 8 + 5] = max_H;
        
        phase += k * (domainLength / gridSize);
    }
    device.queue.writeBuffer(waveGridBuffer, 0, waveGridData);

    const uniformBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const cameraBuffer = device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    function perspective(fov, aspect, near, far) {
        const f = 1.0 / Math.tan(fov / 2);
        const out = new Float32Array(16);
        out[0] = f / aspect;
        out[5] = f;
        out[10] = far / (near - far);
        out[11] = -1;
        out[14] = (near * far) / (near - far);
        out[15] = 0;
        return out;
    }

    function lookAt(eye, center, up) {
        const z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
        let len = Math.hypot(z0, z1, z2);
        const zx = z0 / len, zy = z1 / len, zz = z2 / len;
        
        let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
        len = Math.hypot(xx, xy, xz);
        xx /= len; xy /= len; xz /= len;
        
        const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
        
        const out = new Float32Array(16);
        out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
        out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
        out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
        out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
        out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
        out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
        out[15] = 1;
        return out;
    }

    function multiply(a, b) {
        const out = new Float32Array(16);
        for(let col=0; col<4; col++) {
            for(let row=0; row<4; row++) {
                out[col*4+row] = 
                    a[0*4+row]*b[col*4+0] + 
                    a[1*4+row]*b[col*4+1] + 
                    a[2*4+row]*b[col*4+2] + 
                    a[3*4+row]*b[col*4+3];
            }
        }
        return out;
    }

    function updateCamera(time) {
        const aspect = canvas.width / canvas.height;
        const proj = perspective(Math.PI / 4, aspect, 0.1, 1000.0);
        const cx = 100.0 + Math.sin(time * 0.1) * 15.0;
        const view = lookAt([cx, -45, 12], [cx + 10.0, 0, -1], [0, 0, 1]);
        const viewProj = multiply(proj, view);
        device.queue.writeBuffer(cameraBuffer, 0, viewProj);
    }

    const shaderModule = device.createShaderModule({ code: COMPUTE_SHADER_CODE });
    const renderShaderModule = device.createShaderModule({ code: RENDER_SHADER_CODE });

    const computePipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: shaderModule, entryPoint: 'compute_main' },
    });

    

    const renderPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: renderShaderModule,
            entryPoint: 'vertex_main',
        },
        fragment: {
            module: renderShaderModule,
            entryPoint: 'fragment_main',
            targets: [{
                format: presentationFormat,
                blend: {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
                }
            }],
        },
        primitive: { topology: 'triangle-list' },
        
    });

    const bindGroupCompute = device.createBindGroup({
        layout: computePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 2, resource: { buffer: particleBuffer } },
            { binding: 3, resource: { buffer: waveGridBuffer } },
        ],
    });
    
    const bindGroupRender = device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: { buffer: cameraBuffer } },
            { binding: 2, resource: { buffer: particleBuffer } },
            { binding: 3, resource: { buffer: waveGridBuffer } },
        ],
    });

    let startTime = performance.now();
    waveInitialized = true;

    function frame() {
        if (!waveRunning) {
            waveAnimFrame = requestAnimationFrame(frame);
            return;
        }

        const now = performance.now();
        const time = (now - startTime) / 1000.0;

        device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([time, domainLength]));
        device.queue.writeBuffer(uniformBuffer, 8, new Uint32Array([numParticles, gridSize]));

        updateCamera(time);

        const commandEncoder = device.createCommandEncoder();

        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(computePipeline);
        computePass.setBindGroup(0, bindGroupCompute);
        const workgroupCount = Math.ceil(numParticles / 256);
        computePass.dispatchWorkgroups(workgroupCount);
        computePass.end();

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
            
        });
        renderPass.setPipeline(renderPipeline);
        renderPass.setBindGroup(0, bindGroupRender);
        renderPass.draw(6, numParticles, 0, 0); 
        renderPass.end();

        device.queue.submit([commandEncoder.finish()]);
        waveAnimFrame = requestAnimationFrame(frame);
    }

    frame();
}

window.waveStop = function() {
    waveRunning = false;
}

function runFallback2D(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
    canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
    
    const numParticles = 8000;
    const particles = [];
    const domainLength = canvas.width;
    const shoalStart = domainLength * 0.4;
    const shoalEnd = domainLength * 0.6;
    
    for (let i = 0; i < numParticles; i++) {
        particles.push({
            x: Math.random() * domainLength,
            y: (Math.random() - 0.5) * canvas.height * 0.5,
            vx: 0,
            vy: 0,
            state: 0, // 0 = fluid, 1 = foam
            life: 0
        });
    }
    
    let startTime = performance.now();
    waveInitialized = true;
    
    function frame() {
        if (!waveRunning) {
            waveAnimFrame = requestAnimationFrame(frame);
            return;
        }
        
        const time = (performance.now() - startTime) / 1000.0;
        ctx.fillStyle = 'rgba(10, 15, 30, 1.0)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.globalCompositeOperation = 'lighter';
        
        const omega = 2.0 * Math.PI / 14.0;
        const A = canvas.height * 0.15;
        const pulse_period = 10.0;
        
        for (let i = 0; i < numParticles; i++) {
            let p = particles[i];
            
            // simple depth proxy based on x
            let d = 1.0;
            if (p.x > shoalStart && p.x < shoalEnd) d = 0.2;
            else if (p.x >= shoalEnd) d = 1.0;
            
            let c = Math.sqrt(9.81 * d) * 100;
            let k = omega / c;
            
            let wave_vx = 0;
            let wave_vy = 0;
            let surface_y = 0;
            
            for(let p_idx = -1; p_idx <= 1; p_idx++) {
                let pulse_t = Math.floor(time / pulse_period) * pulse_period + p_idx * pulse_period;
                let dt = time - pulse_t;
                let phase = k * p.x - omega * dt;
                
                let dist = p.x - c * dt;
                let env = Math.exp(- (dist*dist) / (canvas.width * canvas.width * 0.05));
                
                wave_vx += A * omega * Math.cos(phase) * env * (1.0 / d);
                wave_vy -= A * omega * Math.sin(phase) * env * (1.0 / d); // -y is up
                surface_y += A * Math.cos(phase) * env;
            }
            
            if (p.state === 0) {
                p.vx = p.vx * 0.9 + wave_vx * 0.1;
                p.vy = p.vy * 0.9 + wave_vy * 0.1;
                
                p.x += p.vx * 0.016;
                p.y += p.vy * 0.016;
                
                // Return to rest
                p.y = p.y * 0.98 + (Math.random() - 0.5) * canvas.height * 0.5 * 0.02;
                
                let is_near_surface = p.y < surface_y + canvas.height * 0.1; // 2D canvas origin top-left
                if (is_near_surface && p.vx > c * 0.6 && d < 0.5) {
                    p.state = 1;
                    p.vx += c * 0.2;
                    p.vy -= c * 0.2;
                    p.life = 1.0 + Math.random();
                }
                
                if (p.x > domainLength) p.x -= domainLength;
                if (p.x < 0) p.x += domainLength;
                
                ctx.fillStyle = 'rgba(0, ' + Math.floor(100 + p.vx/c*100) + ', 255, 0.4)';
                ctx.fillRect(p.x, canvas.height/2 + p.y, 2, 2);
            } else {
                p.vy += 981 * 0.016; // gravity
                p.x += p.vx * 0.016;
                p.y += p.vy * 0.016;
                
                if (p.y > surface_y) {
                    p.y = surface_y;
                    p.vy *= -0.5;
                    p.vx *= 0.8;
                }
                
                p.life -= 0.016;
                if (p.life <= 0) {
                    p.state = 0;
                    p.y = surface_y + Math.random() * canvas.height * 0.2;
                }
                
                let alpha = Math.max(0, p.life);
                ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha + ')';
                ctx.fillRect(p.x, canvas.height/2 + p.y, 3, 3);
            }
        }
        
        ctx.globalCompositeOperation = 'source-over';
        waveAnimFrame = requestAnimationFrame(frame);
    }
    
    frame();
}
