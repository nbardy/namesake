const COMPUTE_SHADER_CODE = `
struct Uniforms {
    time: f32,
    domain_length: f32,
    num_particles: u32,
    grid_res_x: u32,
    grid_res_y: u32,
    grid_res_z: u32,
    h: f32,
    mass: f32,
    rest_density: f32,
    dt: f32,
};

struct Camera {
    view_proj: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<uniform> camera: Camera;

struct Particle {
    pos_x: f32, pos_y: f32, pos_z: f32,
    vel_x: f32, vel_y: f32, vel_z: f32,
    pred_x: f32, pred_y: f32, pred_z: f32,
    density: f32, lambda: f32, state: f32,
};

@group(0) @binding(2) var<storage, read_write> particles: array<Particle>;

// Grid buffers
@group(0) @binding(3) var<storage, read_write> grid_counters: array<atomic<u32>>;

struct Cell {
    p_ids: array<u32, 64>,
};
@group(0) @binding(4) var<storage, read_write> grid_cells: array<Cell>;

fn get_cell_coords(pos: vec3<f32>) -> vec3<i32> {
    return vec3<i32>(
        i32(pos.x / uniforms.h),
        i32((pos.y + 40.0) / uniforms.h), // Offset Y to make it positive
        i32((pos.z + 20.0) / uniforms.h)  // Offset Z
    );
}

fn get_cell_index(coords: vec3<i32>) -> u32 {
    let cx = clamp(coords.x, 0, i32(uniforms.grid_res_x) - 1);
    let cy = clamp(coords.y, 0, i32(uniforms.grid_res_y) - 1);
    let cz = clamp(coords.z, 0, i32(uniforms.grid_res_z) - 1);
    return u32(cx) + u32(cy) * uniforms.grid_res_x + u32(cz) * uniforms.grid_res_x * uniforms.grid_res_y;
}

@compute @workgroup_size(256)
fn clear_grid(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let total_cells = uniforms.grid_res_x * uniforms.grid_res_y * uniforms.grid_res_z;
    if (index >= total_cells) { return; }
    atomicStore(&grid_counters[index], 0u);
}

@compute @workgroup_size(256)
fn predict_and_bin(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    if (index >= uniforms.num_particles) { return; }

    var p = particles[index];
    
    // Apply gravity and predict
    p.vel_z -= 9.81 * uniforms.dt;
    p.pred_x = p.pos_x + p.vel_x * uniforms.dt;
    p.pred_y = p.pos_y + p.vel_y * uniforms.dt;
    p.pred_z = p.pos_z + p.vel_z * uniforms.dt;

    // Boundary conditions
    if (p.pred_z < -10.0) { p.pred_z = -10.0; p.vel_z *= -0.5; }
    if (p.pred_x < 0.0) { p.pred_x += uniforms.domain_length; }
    if (p.pred_x > uniforms.domain_length) { p.pred_x -= uniforms.domain_length; }
    
    particles[index] = p;

    // Binning
    let coords = get_cell_coords(vec3<f32>(p.pred_x, p.pred_y, p.pred_z));
    let cell_idx = get_cell_index(coords);
    
    let offset = atomicAdd(&grid_counters[cell_idx], 1u);
    if (offset < 64u) {
        grid_cells[cell_idx].p_ids[offset] = index;
    }
}


const W_POLY6_COEFF = 1.56668147106; // 315 / (64 * pi)
fn W_poly6(r2: f32, h: f32) -> f32 {
    let h2 = h * h;
    if (r2 >= h2 || r2 < 0.0) { return 0.0; }
    let term = h2 - r2;
    return (W_POLY6_COEFF / pow(h, 9.0)) * term * term * term;
}

const W_SPIKY_GRAD_COEFF = -14.3239448782; // -45 / pi
fn W_spiky_grad(r_vec: vec3<f32>, r: f32, h: f32) -> vec3<f32> {
    if (r >= h || r <= 0.0001) { return vec3<f32>(0.0); }
    let term = h - r;
    return (W_SPIKY_GRAD_COEFF / pow(h, 6.0)) * term * term * normalize(r_vec);
}

@compute @workgroup_size(256)
fn compute_lambda(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    if (index >= uniforms.num_particles) { return; }

    var p = particles[index];
    let p_pos = vec3<f32>(p.pred_x, p.pred_y, p.pred_z);
    let coords = get_cell_coords(p_pos);
    
    var density = 0.0;
    var grad_c_i_sum = vec3<f32>(0.0);
    var sum_grad_c_sq = 0.0;
    
    let h = uniforms.h;
    let h2 = h * h;
    
    // Analytical Shoal Floor Approximation
    let shoal_x = 100.0;
    let dx = p_pos.x - shoal_x;
    let floor_z = -10.0 + 8.0 * exp(-(dx * dx) / 200.0);
    let dist_to_floor = p_pos.z - floor_z;
    if (dist_to_floor < h) {
        let ratio = max(0.0, 1.0 - max(dist_to_floor, 0.0) / h);
        density += uniforms.rest_density * 0.8 * ratio * ratio * ratio;
    }

    for (var dz = -1; dz <= 1; dz++) {
        for (var dy = -1; dy <= 1; dy++) {
            for (var dx_c = -1; dx_c <= 1; dx_c++) {
                let cell = coords + vec3<i32>(dx_c, dy, dz);
                let cell_idx = get_cell_index(cell);
                let count = min(grid_counters[cell_idx], 64u);
                
                for (var i = 0u; i < count; i++) {
                    let j = grid_cells[cell_idx].p_ids[i];
                    let n = particles[j];
                    let n_pos = vec3<f32>(n.pred_x, n.pred_y, n.pred_z);
                    
                    let r_vec = p_pos - n_pos;
                    let r2 = dot(r_vec, r_vec);
                    
                    if (r2 < h2) {
                        density += uniforms.mass * W_poly6(r2, h);
                        
                        if (index != j) {
                            let r = sqrt(max(r2, 0.0001));
                            let grad_j = (uniforms.mass / uniforms.rest_density) * W_spiky_grad(r_vec, r, h);
                            grad_c_i_sum += grad_j;
                            sum_grad_c_sq += dot(grad_j, grad_j);
                        }
                    }
                }
            }
        }
    }
    
    sum_grad_c_sq += dot(grad_c_i_sum, grad_c_i_sum);
    
    // Only enforce constraint if density is higher than rest density (fluid is compressible inwards slightly, but resists outward expansion and compression)
    let C = max(density / uniforms.rest_density - 1.0, 0.0);
    p.density = density;
    
    let eps = 100.0;
    p.lambda = -C / (sum_grad_c_sq + eps);
    
    particles[index] = p;
}

@compute @workgroup_size(256)
fn compute_delta(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    if (index >= uniforms.num_particles) { return; }

    var p = particles[index];
    let p_pos = vec3<f32>(p.pred_x, p.pred_y, p.pred_z);
    let coords = get_cell_coords(p_pos);
    
    var delta_p = vec3<f32>(0.0);
    let h = uniforms.h;
    let h2 = h * h;
    
    let k_art = 0.0001;
    let dq = 0.2 * h;
    let w_dq = W_poly6(dq*dq, h);
    
    for (var dz = -1; dz <= 1; dz++) {
        for (var dy = -1; dy <= 1; dy++) {
            for (var dx_c = -1; dx_c <= 1; dx_c++) {
                let cell = coords + vec3<i32>(dx_c, dy, dz);
                let cell_idx = get_cell_index(cell);
                let count = min(grid_counters[cell_idx], 64u);
                
                for (var i = 0u; i < count; i++) {
                    let j = grid_cells[cell_idx].p_ids[i];
                    if (index == j) { continue; }
                    
                    let n = particles[j];
                    let n_pos = vec3<f32>(n.pred_x, n.pred_y, n.pred_z);
                    
                    let r_vec = p_pos - n_pos;
                    let r2 = dot(r_vec, r_vec);
                    
                    if (r2 < h2) {
                        let r = sqrt(max(r2, 0.0001));
                        
                        // Artificial pressure
                        let scorr = -k_art * pow(W_poly6(r2, h) / max(w_dq, 0.001), 4.0);
                        
                        let term = p.lambda + n.lambda + scorr;
                        delta_p += (uniforms.mass / uniforms.rest_density) * term * W_spiky_grad(r_vec, r, h);
                    }
                }
            }
        }
    }
    
    // Analytical Collision Penalty
    let shoal_x = 100.0;
    let dx_val = p_pos.x - shoal_x;
    let floor_z = -10.0 + 8.0 * exp(-(dx_val * dx_val) / 200.0);
    let dist_to_floor = p_pos.z - floor_z;
    
    if (dist_to_floor < 0.0) {
        let deriv_x = 8.0 * (-dx_val / 100.0) * exp(-(dx_val * dx_val) / 200.0);
        let normal = normalize(vec3<f32>(-deriv_x, 0.0, 1.0));
        delta_p += normal * (-dist_to_floor * 1.5);
    }
    
    p.pred_x += delta_p.x;
    p.pred_y += delta_p.y;
    p.pred_z += delta_p.z;
    
    particles[index] = p;
}


@compute @workgroup_size(256)
fn update_velocity(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    if (index >= uniforms.num_particles) { return; }
    var p = particles[index];
    
    p.vel_x = (p.pred_x - p.pos_x) / uniforms.dt;
    p.vel_y = (p.pred_y - p.pos_y) / uniforms.dt;
    p.vel_z = (p.pred_z - p.pos_z) / uniforms.dt;
    
    // Add wave generator logic here?
    // Let's create a wave maker paddle on the left boundary
    if (p.pred_x < 5.0) {
        let paddle_vel = 3.0 * cos(uniforms.time * 2.0 * 3.14159 / 10.0);
        p.vel_x = max(p.vel_x, paddle_vel);
    }
    
    // Velocity cap for stability
    let speed_sq = p.vel_x*p.vel_x + p.vel_y*p.vel_y + p.vel_z*p.vel_z;
    if (speed_sq > 400.0) {
        let factor = 20.0 / sqrt(speed_sq);
        p.vel_x *= factor;
        p.vel_y *= factor;
        p.vel_z *= factor;
    }
    
    p.pos_x = p.pred_x;
    p.pos_y = p.pred_y;
    p.pos_z = p.pred_z;
    
    particles[index] = p;
}
`;

const RENDER_SHADER_CODE = `
struct Uniforms {
    time: f32,
    domain_length: f32,
    num_particles: u32,
    grid_res_x: u32,
    grid_res_y: u32,
    grid_res_z: u32,
    h: f32,
    mass: f32,
    rest_density: f32,
    dt: f32,
};

struct Camera {
    view_proj: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<uniform> camera: Camera;

struct Particle {
    pos_x: f32, pos_y: f32, pos_z: f32,
    vel_x: f32, vel_y: f32, vel_z: f32,
    pred_x: f32, pred_y: f32, pred_z: f32,
    density: f32, lambda: f32, state: f32,
};

@group(0) @binding(2) var<storage, read> particles: array<Particle>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vertex_main(@builtin(vertex_index) vertex_index: u32, @builtin(instance_index) instance_index: u32) -> VertexOutput {
    let p = particles[instance_index];
    
    var quad_pos = vec2<f32>(0.0);
    if (vertex_index == 0u) { quad_pos = vec2<f32>(-1.0, -1.0); }
    if (vertex_index == 1u) { quad_pos = vec2<f32>( 1.0, -1.0); }
    if (vertex_index == 2u) { quad_pos = vec2<f32>(-1.0,  1.0); }
    if (vertex_index == 3u) { quad_pos = vec2<f32>( 1.0,  1.0); }
    if (vertex_index == 4u) { quad_pos = vec2<f32>(-1.0,  1.0); }
    if (vertex_index == 5u) { quad_pos = vec2<f32>( 1.0, -1.0); }
    
    let size = 0.15;
    let world_pos = vec3<f32>(p.pos_x, p.pos_y, p.pos_z) + vec3<f32>(quad_pos.x * size, 0.0, quad_pos.y * size);
    
    var out: VertexOutput;
    out.position = camera.view_proj * vec4<f32>(world_pos, 1.0);
    let depth_col = clamp((p.pos_z + 10.0) / 10.0, 0.0, 1.0);
    out.color = vec4<f32>(0.0, 0.4 + 0.4 * depth_col, 0.8 + 0.2 * depth_col, 0.6);
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
        return;
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

    const device = await adapter.requestDevice({
        requiredLimits: {
            maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize
        }
    });
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

    const numParticles = 100000; // Reduced for PBF to ensure 60fps initially
    const domainLength = 200.0;
    const h = 1.0; // Smoothing radius
    const gridResX = Math.ceil(domainLength / h);
    const gridResY = Math.ceil(80.0 / h);
    const gridResZ = Math.ceil(40.0 / h);
    const numCells = gridResX * gridResY * gridResZ;

    // Buffer setups
    const particleBuffer = device.createBuffer({
        size: numParticles * 48, // 12 f32s per particle
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });

    const particleData = new Float32Array(particleBuffer.getMappedRange());
    for (let i = 0; i < numParticles; i++) {
        // Drop particles in a block
        const x = Math.random() * 40.0 + 20.0;
        const y = (Math.random() - 0.5) * 40.0;
        const z = Math.random() * 10.0;
        
        particleData[i * 12 + 0] = x;
        particleData[i * 12 + 1] = y;
        particleData[i * 12 + 2] = z;
        // vel
        particleData[i * 12 + 3] = 0;
        particleData[i * 12 + 4] = 0;
        particleData[i * 12 + 5] = 0;
        // pred
        particleData[i * 12 + 6] = 0;
        particleData[i * 12 + 7] = 0;
        particleData[i * 12 + 8] = 0;
        // density, lambda, state
        particleData[i * 12 + 9] = 0;
        particleData[i * 12 + 10] = 0;
        particleData[i * 12 + 11] = 0;
    }
    particleBuffer.unmap();

    // Grid buffers
    const gridCountersBuffer = device.createBuffer({
        size: numCells * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const gridCellsBuffer = device.createBuffer({
        size: numCells * 256, // 64 u32s per cell
        usage: GPUBufferUsage.STORAGE,
    });

    const uniformBuffer = device.createBuffer({
        size: 40, // 10 * 4 bytes
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
        const cx = 100.0;
        const view = lookAt([cx, -60, 15], [cx + 10.0, 0, -1], [0, 0, 1]);
        const viewProj = multiply(proj, view);
        device.queue.writeBuffer(cameraBuffer, 0, viewProj);
    }

    const shaderModule = device.createShaderModule({ code: COMPUTE_SHADER_CODE });
    const renderShaderModule = device.createShaderModule({ code: RENDER_SHADER_CODE });

    const computeBindGroupLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
            { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
            { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
            { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        ]
    });
    
    const computePipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [computeBindGroupLayout]
    });

    const pipelineClearGrid = device.createComputePipeline({ layout: computePipelineLayout, compute: { module: shaderModule, entryPoint: 'clear_grid' } });
    const pipelinePredictBin = device.createComputePipeline({ layout: computePipelineLayout, compute: { module: shaderModule, entryPoint: 'predict_and_bin' } });
    const pipelineLambda = device.createComputePipeline({ layout: computePipelineLayout, compute: { module: shaderModule, entryPoint: 'compute_lambda' } });
    const pipelineDelta = device.createComputePipeline({ layout: computePipelineLayout, compute: { module: shaderModule, entryPoint: 'compute_delta' } });
    const pipelineVelocity = device.createComputePipeline({ layout: computePipelineLayout, compute: { module: shaderModule, entryPoint: 'update_velocity' } });

    const renderPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: renderShaderModule, entryPoint: 'vertex_main' },
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
        primitive: { topology: 'triangle-list' }
    });

    const bindGroupCompute = device.createBindGroup({
        layout: computeBindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 2, resource: { buffer: particleBuffer } },
            { binding: 3, resource: { buffer: gridCountersBuffer } },
            { binding: 4, resource: { buffer: gridCellsBuffer } },
        ],
    });
    
    const bindGroupRender = device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 1, resource: { buffer: cameraBuffer } },
            { binding: 2, resource: { buffer: particleBuffer } },
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
        
        // time, domain, num_particles, resX
        // resY, resZ, h, mass
        // rest_density, dt
        const uniformData = new ArrayBuffer(40);
        const floatView = new Float32Array(uniformData);
        const uintView = new Uint32Array(uniformData);
        
        floatView[0] = time;
        floatView[1] = domainLength;
        uintView[2] = numParticles;
        uintView[3] = gridResX;
        uintView[4] = gridResY;
        uintView[5] = gridResZ;
        floatView[6] = h;
        floatView[7] = 1.0; // mass
        floatView[8] = 1000.0; // rest_density
        floatView[9] = 0.016; // dt
        
        device.queue.writeBuffer(uniformBuffer, 0, uniformData);

        updateCamera(time);

        const commandEncoder = device.createCommandEncoder();

        const computePass = commandEncoder.beginComputePass();
        computePass.setBindGroup(0, bindGroupCompute);
        
        computePass.setPipeline(pipelineClearGrid);
        computePass.dispatchWorkgroups(Math.ceil(numCells / 256));
        
        const wgParticles = Math.ceil(numParticles / 256);
        computePass.setPipeline(pipelinePredictBin);
        computePass.dispatchWorkgroups(wgParticles);
        
        // Multiple solver iterations
        for (let iter = 0; iter < 3; iter++) {
            computePass.setPipeline(pipelineLambda);
            computePass.dispatchWorkgroups(wgParticles);
            
            computePass.setPipeline(pipelineDelta);
            computePass.dispatchWorkgroups(wgParticles);
        }
        
        computePass.setPipeline(pipelineVelocity);
        computePass.dispatchWorkgroups(wgParticles);
        
        computePass.end();

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
                loadOp: 'clear',
                storeOp: 'store',
            }]
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
