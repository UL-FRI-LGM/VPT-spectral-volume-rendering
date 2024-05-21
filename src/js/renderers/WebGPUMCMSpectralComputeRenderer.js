import { mat4 } from '../../lib/gl-matrix-module.js';

import { WebGPU } from '../WebGPU.js';
import { WebGPUAbstractComputeRenderer } from './WebGPUAbstractComputeRenderer.js';

import { PerspectiveCamera } from '../PerspectiveCamera.js';

const [ SHADERS, MIXINS ] = await Promise.all([
    'shaders-wgsl.json',
    'mixins-wgsl.json',
].map(url => fetch(url).then(response => response.json())));

// TODO: Move to a separate file
// XYZ spectral values (390nm - 830nm in 5nm steps)
const CIE_SPECTRUM = {
    first_wavelenght: 390, // nm
    step: 5, // nm 
    length: 89,
    X: [0.003769647,0.009382967,0.02214302,0.04742986,0.08953803,0.1446214,0.2035729,0.2488523,0.2918246,0.3227087,0.3482554,0.3418483,0.3224637,0.2826646,0.2485254,0.2219781,0.1806905,0.129192,0.08182895,0.04600865,0.02083981,0.007097731,0.002461588,0.003649178,0.01556989,0.04315171,0.07962917,0.1268468,0.1818026,0.2405015,0.3098117,0.3804244,0.4494206,0.5280233,0.6133784,0.7016774,0.796775,0.8853376,0.9638388,1.051011,1.109767,1.14362,1.151033,1.134757,1.083928,1.007344,0.9142877,0.8135565,0.6924717,0.575541,0.4731224,0.3844986,0.2997374,0.2277792,0.1707914,0.1263808,0.09224597,0.0663996,0.04710606,0.03292138,0.02262306,0.01575417,0.01096778,0.00760875,0.005214608,0.003569452,0.002464821,0.001703876,0.001186238,0.0008269535,0.0005758303,0.0004058303,0.0002856577,0.0002021853,0.000143827,0.0001024685,7.347551e-05,5.25987e-05,3.806114e-05,2.758222e-05,2.004122e-05,1.458792e-05,1.068141e-05,7.857521e-06,5.768284e-06,4.259166e-06,3.167765e-06,2.358723e-06,1.762465e-06],
    Y: [0.0004146161,0.001059646,0.002452194,0.004971717,0.00907986,0.01429377,0.02027369,0.02612106,0.03319038,0.0415794,0.05033657,0.05743393,0.06472352,0.07238339,0.08514816,0.1060145,0.1298957,0.1535066,0.1788048,0.2064828,0.237916,0.285068,0.3483536,0.4277595,0.5204972,0.6206256,0.718089,0.7946448,0.8575799,0.9071347,0.9544675,0.9814106,0.9890228,0.9994608,0.9967737,0.9902549,0.9732611,0.9424569,0.8963613,0.8587203,0.8115868,0.7544785,0.6918553,0.6270066,0.5583746,0.489595,0.4229897,0.3609245,0.2980865,0.2416902,0.1943124,0.1547397,0.119312,0.08979594,0.06671045,0.04899699,0.03559982,0.02554223,0.01807939,0.01261573,0.008661284,0.006027677,0.004195941,0.002910864,0.001995557,0.001367022,0.0009447269,0.000653705,0.000455597,0.0003179738,0.0002217445,0.0001565566,0.0001103928,7.827442e-05,5.578862e-05,3.981884e-05,2.860175e-05,2.051259e-05,1.487243e-05,1.080001e-05,7.86392e-06,5.736935e-06,4.211597e-06,3.106561e-06,2.286786e-06,1.693147e-06,1.262556e-06,9.422514e-07,7.05386e-07],
    Z: [0.0184726,0.04609784,0.109609,0.2369246,0.4508369,0.7378822,1.051821,1.305008,1.552826,1.74828,1.917479,1.918437,1.848545,1.664439,1.522157,1.42844,1.25061,0.9991789,0.7552379,0.5617313,0.4099313,0.3105939,0.2376753,0.1720018,0.1176796,0.08283548,0.05650407,0.03751912,0.02438164,0.01566174,0.00984647,0.006131421,0.003790291,0.002327186,0.001432128,0.0008822531,0.0005452416,0.0003386739,0.0002117772,0.0001335031,8.494468e-05,5.460706e-05,3.549661e-05,2.334738e-05,1.554631e-05,1.048387e-05,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]
}


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
            name: 'transferFunction',
            label: 'Transfer function',
            type: 'transfer-function',
            value: new Uint8Array(256),
        },
    ]);

    // Spectrum representation - n_bins; wavelength bin boundaries
    this.max_n_bins = 12; // must match PhotonSpectrum MAX_N_BINS
    // this.n_bins = 3;  this.spectrumRepresentationData = [400, 500, 600, 700];
    // this.n_bins = 6; this.spectrumRepresentationData = [400, 450, 500, 550, 600, 650, 700];
    this.n_bins = 12; this.spectrumRepresentationData = [400, 425, 450, 475, 500, 525, 550, 575, 600, 625, 650, 675, 700];

    this.compute_spectral_coefficients();
    console.log("x_coeff", this.x_coeff)
    console.log("y_coeff", this.y_coeff)
    console.log("z_coeff", this.z_coeff)


    this.addEventListener('change', e => {
        const { name, value } = e.detail;

        if (name === 'transferFunction') {
            this.setTransferFunction(this.transferFunction);
        }

        const spectrumRepresentation = document.getElementById("spectrum-representation");
        if (name === 'spectrumRepresentation') {
            this.spectrumRepresentationData = spectrumRepresentation.get_bins();
            this.n_bins = this.spectrumRepresentationData.length - 1; 
            this.compute_spectral_coefficients();
            console.log("x_coeff", this.x_coeff)
            console.log("y_coeff", this.y_coeff)
            console.log("z_coeff", this.z_coeff)
        }

        if ([
            'extinction',
            'anisotropy',
            'bounces',
            'transferFunction',
            'spectrumRepresentation'
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

    this._renderUniformBuffer = device.createBuffer({
        size: 96,
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
                resource: this._transferFunction.createView()
            },
            {
                binding: 3,
                resource: this._transferFunctionSampler
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
                resource: { buffer: this._renderUniformBuffer }
            },
            {
                binding: 7,
                resource: { buffer: this._photonBuffer }
            },
            {
                binding: 8,
                resource: this._renderBuffer.getAttachments()[0].texture.createView(),
            },
            {
                binding: 9,
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
