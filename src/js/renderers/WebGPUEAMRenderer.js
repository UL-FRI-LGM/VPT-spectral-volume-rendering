import { mat4 } from '../../lib/gl-matrix-module.js';

import { WebGL } from '../WebGL.js';
import { WebGPUAbstractRenderer } from './WebGPUAbstractRenderer.js';

import { PerspectiveCamera } from '../PerspectiveCamera.js';

const [ SHADERS, MIXINS ] = await Promise.all([
    'shaders-wgsl.json',
    'mixins-wgsl.json',
].map(url => fetch(url).then(response => response.json())));

export class WebGPUEAMRenderer extends WebGPUAbstractRenderer {

constructor(device, volume, camera, environmentTexture, options = {}) {
    super(device, volume, camera, environmentTexture, options);

    this.registerProperties([
        {
            name: 'extinction',
            label: 'Extinction',
            type: 'spinner',
            value: 100,
            min: 0,
        },
        {
            name: 'slices',
            label: 'Slices',
            type: 'spinner',
            value: 64,
            min: 1,
        },
        {
            name: 'random',
            label: 'Random',
            type: 'checkbox',
            value: true,
        },
        {
            name: 'transferFunction',
            label: 'Transfer function',
            type: 'transfer-function',
            value: new Uint8Array(256),
        },
    ]);

    this.addEventListener('change', e => {
        const { name, value } = e.detail;

        if (name === 'transferFunction') {
            this.setTransferFunction(this.transferFunction);
        }

        if ([
            'extinction',
            'slices',
            'random',
            'transferFunction',
        ].includes(name)) {
            this.reset();
        }
    });

    // this._programs = WebGL.buildPrograms(this._gl, SHADERS.renderers.EAM, MIXINS);
    this._frameNumber = 0;

    const generateModule = device.createShaderModule({ code: SHADERS.renderers.EAM.generate });
    const integrateModule = device.createShaderModule({ code: SHADERS.renderers.EAM.integrate });
    const renderModule = device.createShaderModule({ code: SHADERS.renderers.EAM.render });
    const resetModule = device.createShaderModule({ code: SHADERS.renderers.EAM.reset });

    this._generateUniformBuffer = device.createBuffer({
        size: 80,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this._generatePipeline = device.createRenderPipeline({
        label: "WebGPUEAMRenderer generate pipeline",
        layout: "auto",
        vertex: {
            module: generateModule,
            entryPoint: "main_vs"
        },
        fragment: {
            module: generateModule,
            entryPoint: "main_fs",
            targets: this._getFrameBufferSpec().map(s => ({ format: s.textureDescriptor.format }))
        }
    });

    this._integrateUniformBuffer = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this._integratePipeline = device.createRenderPipeline({
        label: "WebGPUEAMRenderer integrate pipeline",
        layout: "auto",
        vertex: {
            module: integrateModule,
            entryPoint: "main_vs"
        },
        fragment: {
            module: integrateModule,
            entryPoint: "main_fs",
            targets: this._getAccumulationBufferSpec().map(s => ({ format: s.textureDescriptor.format }))
        }
    });

    this._renderPipeline = device.createRenderPipeline({
        label: "WebGPUEAMRenderer render pipeline",
        layout: "auto",
        vertex: {
            module: renderModule,
            entryPoint: "main_vs"
        },
        fragment: {
            module: renderModule,
            entryPoint: "main_fs",
            targets: this._getRenderBufferSpec().map(s => ({ format: s.textureDescriptor.format }))
        }
    });

    this._resetPipeline = device.createRenderPipeline({
        label: "WebGPUEAMRenderer reset pipeline",
        layout: "auto",
        vertex: {
            module: resetModule,
            entryPoint: "main_vs"
        },
        fragment: {
            module: resetModule,
            entryPoint: "main_fs",
            targets: this._getAccumulationBufferSpec().map(s => ({ format: s.textureDescriptor.format }))
        }
    });
}

destroy() {
    return; // TODO

    const gl = this._gl;
    Object.keys(this._programs).forEach(programName => {
        gl.deleteProgram(this._programs[programName].program);
    });

    super.destroy();
}

_resetFrame() {
    const device = this._device;

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: this._accumulationBuffer.getWriteAttachments()[0].texture.createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0],
                loadOp: "clear",
                storeOp: "store"
            }
        ]
    });
    pass.setPipeline(this._resetPipeline);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);

    this._frameNumber = 0;
}

_generateFrame() {
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

    device.queue.writeBuffer(this._generateUniformBuffer, 0, matrix);
    device.queue.writeBuffer(this._generateUniformBuffer, 64, new Float32Array([
        1.0 / this.slices,
        Math.random(),
        this.extinction
    ]));

    device.queue.writeBuffer(this._integrateUniformBuffer, 0, new Float32Array([1.0 / this._frameNumber]));

    const bindGroup = device.createBindGroup({
        layout: this._generatePipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: this._volume.getSampler()
            },
            {
                binding: 1,
                resource: this._volume.getTexture().createView()
            },
            {
                binding: 2,
                resource: this._transferFunctionSampler
            },
            {
                binding: 3,
                resource: this._transferFunctionTexture.createView()
            },
            {
                binding: 4,
                resource: { buffer: this._generateUniformBuffer }
            }
        ]
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: this._frameBuffer.getAttachments()[0].texture.createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0],
                loadOp: "clear",
                storeOp: "store"
            }
        ]
    });
    pass.setPipeline(this._generatePipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);

    this._frameNumber++;

    return; // TODO

    // const gl = this._gl;

    // const { program, uniforms } = this._programs.generate;
    // gl.useProgram(program);

    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_3D, this._volume.getTexture());
    // gl.activeTexture(gl.TEXTURE1);
    // gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);

    // gl.uniform1i(uniforms.uVolume, 0);
    // gl.uniform1i(uniforms.uTransferFunction, 1);
    // gl.uniform1f(uniforms.uStepSize, 1 / this.slices);
    // gl.uniform1f(uniforms.uExtinction, this.extinction);
    // gl.uniform1f(uniforms.uOffset, this.random ? Math.random() : 0);

    // // TODO: get model matrix from volume
    // const modelMatrix = mat4.fromTranslation(mat4.create(), [-0.5, -0.5, -0.5]);
    // const viewMatrix = this._camera.transform.inverseGlobalMatrix;
    // const projectionMatrix = this._camera.getComponent(PerspectiveCamera).projectionMatrix;

    // const matrix = mat4.create();
    // mat4.multiply(matrix, modelMatrix, matrix);
    // mat4.multiply(matrix, viewMatrix, matrix);
    // mat4.multiply(matrix, projectionMatrix, matrix);
    // mat4.invert(matrix, matrix);
    // gl.uniformMatrix4fv(uniforms.uMvpInverseMatrix, false, matrix);

    // gl.drawArrays(gl.TRIANGLES, 0, 3);

    // this._frameNumber++;
}

_integrateFrame() {
    const device = this._device;

    device.queue.writeBuffer(this._integrateUniformBuffer, 0, new Float32Array([1.0 / this._frameNumber]));

    const bindGroup = device.createBindGroup({
        layout: this._integratePipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: this._accumulationBuffer.getReadAttachments()[0].sampler
            },
            {
                binding: 1,
                resource: this._accumulationBuffer.getReadAttachments()[0].texture.createView()
            },
            {
                binding: 2,
                resource: this._frameBuffer.getAttachments()[0].sampler
            },
            {
                binding: 3,
                resource: this._frameBuffer.getAttachments()[0].texture.createView()
            },
            {
                binding: 4,
                resource: { buffer: this._integrateUniformBuffer }
            }
        ]
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: this._accumulationBuffer.getWriteAttachments()[0].texture.createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0],
                loadOp: "clear",
                storeOp: "store"
            }
        ]
    });
    pass.setPipeline(this._integratePipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
}

_renderFrame() {
    const device = this._device;

    const bindGroup = device.createBindGroup({
        layout: this._renderPipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: this._accumulationBuffer.getReadAttachments()[0].sampler
            },
            {
                binding: 1,
                resource: this._accumulationBuffer.getReadAttachments()[0].texture.createView()
            }
        ]
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: this._renderBuffer.getAttachments()[0].texture.createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0],
                loadOp: "clear",
                storeOp: "store"
            }
        ]
    });
    pass.setPipeline(this._renderPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
}

_getFrameBufferSpec() {
    return [{
        textureDescriptor: {
            size: [this._resolution, this._resolution],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        },
        samplerDescriptor: {
            magFilter: "nearest",
            minFilter: "nearest"
        }
    }];

    const gl = this._gl;
    return [{
        width   : this._resolution,
        height  : this._resolution,
        min     : gl.NEAREST,
        mag     : gl.NEAREST,
        format  : gl.RGBA,
        iformat : gl.RGBA,
        type    : gl.UNSIGNED_BYTE,
    }];
}

_getAccumulationBufferSpec() {
    return [{
        textureDescriptor: {
            size: [this._resolution, this._resolution],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        },
        samplerDescriptor: {
            magFilter: "nearest",
            minFilter: "nearest"
        }
    }];

    const gl = this._gl;
    return [{
        width   : this._resolution,
        height  : this._resolution,
        min     : gl.NEAREST,
        mag     : gl.NEAREST,
        format  : gl.RGBA,
        iformat : gl.RGBA,
        type    : gl.UNSIGNED_BYTE,
    }];
}

}
