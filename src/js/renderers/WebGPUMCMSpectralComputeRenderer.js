import { mat4 } from '../../lib/gl-matrix-module.js';

import { WebGPU } from '../WebGPU.js';
import { WebGPUAbstractComputeRenderer } from './WebGPUAbstractComputeRenderer.js';
import { CIE_SPECTRUM } from '../utils/Spectrum.js';

import { PerspectiveCamera } from '../PerspectiveCamera.js';

const [ SHADERS, MIXINS ] = await Promise.all([
    'shaders-wgsl.json',
    'mixins-wgsl.json',
].map(url => fetch(url).then(response => response.json())));

export class WebGPUMCMSpectralComputeRenderer extends WebGPUAbstractComputeRenderer {

constructor(device, volume, camera, environment, options = {}) {
    super(device, volume, camera, environment, options);

    this.registerProperties([
        {
            name: 'extinction',
            label: 'Extinction',
            type: 'spinner',
            value: 1,
            min: 0,
        },
        {
            name: 'anisotropy',
            label: 'Anisotropy',
            type: 'slider',
            value: 0,
            min: -1,
            max: 1,
        },
        {
            name: 'bounces',
            label: 'Max bounces',
            type: 'spinner',
            value: 8,
            min: 0,
        },
        {
            name: 'steps',
            label: 'Steps',
            type: 'spinner',
            value: 8,
            min: 0,
        },
        {
            name: 'spectrumRepresentation',
            label: 'Spectrum representation',
            type: 'spectrum-representation',
            id: "spectrum-representation"
        },
        {
            name: 'lightEditor',
            label: 'Light editor',
            type: 'light-editor',
            id: "light-editor"
        },
        {
            name: 'materialTransferFunction',
            label: 'Material transfer function',
            type: 'material-transfer-function',
            id: "material-transfer-function"
        },
        // {
        //     name: 'transferFunction',
        //     label: 'Transfer function',
        //     type: 'transfer-function',
        //     value: new Uint8Array(256),
        // },
    ]);

    // Spectrum representation - n_bins; wavelength bin boundaries
    this.max_n_bins = 12; // must match PhotonSpectrum MAX_N_BINS
    // this.n_bins = 3;  this.spectrumRepresentationData = [400, 500, 600, 700];
    // this.n_bins = 6; this.spectrumRepresentationData = [400, 450, 500, 550, 600, 650, 700];
    this.n_bins = 12; this.spectrumRepresentationData = [400, 425, 450, 475, 500, 525, 550, 575, 600, 625, 650, 675, 700];
    this.compute_spectral_coefficients();

    this.light_direction = [1, 0, 0];
    this.light_spectrum_power_distribution = new Uint8Array(256).fill(100);

    this.material_transfer_function = new Uint8Array(256*256*4).fill(0);



    this.addEventListener('change', e => {
        const { name, value } = e.detail;

        if (name === 'transferFunction') {
            this.setTransferFunction(this.transferFunction);
        }


        if (name === 'lightEditor') {
            const lightEditor = document.getElementById("light-editor");
            this.light_spectrum_power_distribution = lightEditor.spectrum_power_distribution;
            this.light_direction = lightEditor.direction;
        }

        if (name === 'spectrumRepresentation') {
            const spectrumRepresentation = document.getElementById("spectrum-representation");
            this.spectrumRepresentationData = spectrumRepresentation.get_bins();
            this.n_bins = this.spectrumRepresentationData.length - 1; 
            this.compute_spectral_coefficients();
        }

        if (name === 'materialTransferFunction') {
            console.log("Material transfer function changed");
            const materialTransferFunction = document.getElementById("material-transfer-function");
            this.material_transfer_function = materialTransferFunction.value;
        }

        if ([
            'extinction',
            'anisotropy',
            'bounces',
            'materialTransferFunction',
            'spectrumRepresentation',
            'lightEditor'
        ].includes(name)) {
            this.reset();
        }
    });

    this._programs = WebGPU.buildShaderModules(device, SHADERS.renderers.MCMSpectralCompute, MIXINS);

    // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001002601000000000000003d888b0237284d3025f2381bcb288a12facb8c3e7f7733ecde0bb6ed05c51472810347a223350abfadad2c924bcfab8a9f439e590d1e2fcc50378a4ff641db32215f352e30b72fc8480ccf40c5a4399a41f7f3e43228f49363d2d14b9ec7e2a03a58c95f39dae3ed63fbf21cf49d0df2f8816e813ba4305286c6cfe3769958e4af388f0ad5edfdaf3b1993d680020e5af47f59dc9d3d9ac0829a601edcc563a36eff50ccaa12621357bed7d96cd6cec16d05884e0b5f5937c0b27e8a35b05f0effff09cb0c00
    const photonSize = Math.ceil((10 + this.max_n_bins*2)/4)*4*4;
    this._photonBuffer = device.createBuffer({
        size: this._resolution * this._resolution * photonSize,
        usage: GPUBufferUsage.STORAGE
    });
    
    this._spectrumRepresentationBuffer = device.createBuffer({
        size: 256, // TODO: Calculate size min((n_bins + 1), 256)*4 
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, // TODO: Consider changing to UNIFORM (be aware of stride 16 requirement)
        label: "Spectrum representation buffer"
    });

    // light spectrum texture
    this._lightSpectrumTexture = device.createTexture({
        size: {width: 256, height: 1},
        format: 'r8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });

    this._lightSpectrumTextureSampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
    });

    // transfer function texture
    this._materialTransferFunctionTexture = device.createTexture({
        size: {width: 256, height: 256},
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });

    this._materialTransferFunctionSampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
    });

    this._renderUniformBuffer = device.createBuffer({
        size: 112,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 
    });
    this._renderPipeline = device.createComputePipeline({
        label: "WebGPUMCMSpectralComputeRenderer render pipeline",
        layout: "auto",
        compute: {
            module: this._programs.render,
            entryPoint: "compute_main",
            constants: {
                WORKGROUP_SIZE_X: this._workgroup_size[0],
                WORKGROUP_SIZE_Y: this._workgroup_size[1]
            }
        }
    });

    
    this._resetUniformBuffer = device.createBuffer({
        size: 80,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this._resetPipeline = device.createComputePipeline({
        label: "WebGPUMCMSpectralComputeRenderer reset pipeline",
        layout: "auto",
        compute: {
            module: this._programs.reset,
            entryPoint: "compute_main",
            constants: {
                WORKGROUP_SIZE_X: this._workgroup_size[0],
                WORKGROUP_SIZE_Y: this._workgroup_size[1]
            }
        }
    });
}

destroy() {
    this._photonBuffer.destroy();

    super.destroy();
}

_resetFrame() {
    const device = this._device;

    // TODO: get model matrix from volume
    // const modelMatrix = this._volumeTransform.globalMatrix; // tole ne dela
    const modelMatrix = mat4.fromTranslation(mat4.create(), [-0.5, -0.5, -0.5]);
    const viewMatrix = this._camera.transform.inverseGlobalMatrix;
    const projectionMatrix = this._camera.getComponent(PerspectiveCamera).projectionMatrix;

    const matrix = mat4.create();
    mat4.multiply(matrix, modelMatrix, matrix);
    mat4.multiply(matrix, viewMatrix, matrix);
    mat4.multiply(matrix, projectionMatrix, matrix);
    mat4.invert(matrix, matrix);

    device.queue.writeBuffer(this._resetUniformBuffer, 0, matrix); // uniforms.mvpInverseMatrix
    device.queue.writeBuffer(this._resetUniformBuffer, 64, new Float32Array([
        1 / this._resolution, 1 / this._resolution, // uniforms.inverseResolution
        Math.random(),                              // uniforms.randSeed
        0,                                          // uniforms.blur
    ]));

    const bindGroup = device.createBindGroup({
        layout: this._resetPipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: { buffer: this._resetUniformBuffer }
            },
            {
                binding: 1,
                resource: { buffer: this._photonBuffer }
            },
            {
                binding: 2,
                resource: { buffer: this._spectrumRepresentationBuffer }
            }
        ]
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._resetPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(...this._getWorkgroupCount());
    pass.end();
    device.queue.submit([encoder.finish()]);
}

_renderFrame() {
    const device = this._device;

    // TODO: get model matrix from volume
    const modelMatrix = mat4.fromTranslation(mat4.create(), [-0.5, -0.5, -0.5]);
    const viewMatrix = this._camera.transform.inverseGlobalMatrix;
    const projectionMatrix = this._camera.getComponent(PerspectiveCamera).projectionMatrix;

    const matrix = mat4.create();
    mat4.multiply(matrix, modelMatrix, matrix);
    mat4.multiply(matrix, viewMatrix, matrix);
    mat4.multiply(matrix, projectionMatrix, matrix);
    mat4.invert(matrix, matrix);

    // write to _lightSpectrumTexture
    device.queue.writeTexture(
        { texture: this._lightSpectrumTexture }, 
        this.light_spectrum_power_distribution || new Uint8Array(256).fill(100),
        {}, 
        { width: 256, height: 1 }
    );

    // write to _materialTransferFunctionTexture
    const materialTransferFunction = document.getElementById("material-transfer-function");
    if (materialTransferFunction){
        device.queue.writeTexture(
            { texture: this._materialTransferFunctionTexture },
            materialTransferFunction.value,
            { bytesPerRow: 256*4 },
            { width: 256, height: 256 }
        );
    }

    device.queue.writeBuffer(this._renderUniformBuffer, 0, matrix);
    device.queue.writeBuffer(this._renderUniformBuffer, 64, new Float32Array([
        1 / this._resolution, 1 / this._resolution, // uniforms.inverseResolution
        Math.random(),                              // uniforms.randSeed
        0,                                          // uniforms.blur
        this.extinction,                            // uniforms.extinction
        this.anisotropy,                            // uniforms.anisotropy
    ]));
    device.queue.writeBuffer(this._renderUniformBuffer, 88, new Uint32Array([
        this.bounces,                               // uniforms.bounces
        this.steps                                  // uniforms.steps
    ]));
    device.queue.writeBuffer(this._renderUniformBuffer, 96, new Float32Array([  
        ...this.light_direction                     // uniforms.light_direction
    ]));

    device.queue.writeBuffer(this._spectrumRepresentationBuffer, 0, 
        new Float32Array([this.n_bins, ...this.spectrumRepresentationData, ...this.x_coeff, ...this.y_coeff, ...this.z_coeff]));


    const bindGroup = device.createBindGroup({
        layout: this._renderPipeline.getBindGroupLayout(0),
        entries: [ // TODO: Cleanup
            {
                binding: 0,
                resource: this._volume.getTexture().createView()
            },
            {
                binding: 1,
                resource: this._volume.getTextureSampler()
            },
            {
                binding: 2,
                resource: this._materialTransferFunctionTexture.createView()
            },
            {
                binding: 3,
                resource: this._materialTransferFunctionSampler
            },
            {
                binding: 4,
                resource: this._environment.texture.createView()
            },
            {
                binding: 5,
                resource: this._environment.sampler
            },
            {
                binding: 6,
                resource: this._lightSpectrumTexture.createView()
            },
            {
                binding: 7,
                resource: this._lightSpectrumTextureSampler
            },
            {
                binding: 8,
                resource: { buffer: this._renderUniformBuffer }
            },
            {
                binding: 9,
                resource: { buffer: this._photonBuffer }
            },
            {
                binding: 10,
                resource: this._renderBuffer.getAttachments()[0].texture.createView(),
            },
            {
                binding: 11,
                resource: { buffer: this._spectrumRepresentationBuffer }
            }
        ]
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._renderPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(...this._getWorkgroupCount());
    pass.end();
    device.queue.submit([encoder.finish()]);
}


compute_spectral_coefficients() {
    let x_coeff = new Array(this.n_bins).fill(0);
    let y_coeff = new Array(this.n_bins).fill(0);
    let z_coeff = new Array(this.n_bins).fill(0);
    let weights = new Array(this.n_bins).fill(0);

    let bin = 0;
    for (let i = 0; i < CIE_SPECTRUM.length; i++) {
        let wavelength = CIE_SPECTRUM.first_wavelenght + i*CIE_SPECTRUM.step;
        if(wavelength < this.spectrumRepresentationData[0]){
            continue;
        }
        if (wavelength >= this.spectrumRepresentationData[bin+1]) {
            bin++;
        }
        if(bin >= this.n_bins) {
            break;
        }
        weights[bin] += 1;
        x_coeff[bin] += CIE_SPECTRUM.X[i];
        y_coeff[bin] += CIE_SPECTRUM.Y[i];
        z_coeff[bin] += CIE_SPECTRUM.Z[i];
    }

    for (let i = 0; i < this.n_bins; i++) {
        x_coeff[i] /= weights[i];
        y_coeff[i] /= weights[i];
        z_coeff[i] /= weights[i];
    }

    this.x_coeff = x_coeff;
    this.y_coeff = y_coeff;
    this.z_coeff = z_coeff;
}

}
