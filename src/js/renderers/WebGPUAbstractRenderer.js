import { mat4 } from '../../lib/gl-matrix-module.js';

import { PropertyBag } from '../PropertyBag.js';
import { WebGPU } from '../WebGPU.js';
import { WebGPUSingleBuffer } from '../WebGPUSingleBuffer.js';
import { WebGPUDoubleBuffer } from '../WebGPUDoubleBuffer.js';

const [ SHADERS, MIXINS ] = await Promise.all([
    'shaders-wgsl.json',
    'mixins-wgsl.json',
].map(url => fetch(url).then(response => response.json())));

export class WebGPUAbstractRenderer extends PropertyBag {

constructor(device, volume, camera, environmentTexture, options = {}) {
    super();

    this._resolution = options.resolution ?? 512;

    this._device = device;
    this._volume = volume;
    this._camera = camera;
    this._environmentTexture = environmentTexture;

    this._rebuildBuffers();

    this._transferFunctionTexture = WebGPU.createTextureFromArray(
        device, [2, 1], "rgba8unorm", 4,
        GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        new Uint8Array([255, 0, 0, 0, 255, 0, 0, 255])
    );
    this._transferFunctionSampler = device.createSampler({
        magFilter: "linear",
        minFilter: "linear"
    });

    return; // TODO

    this._transferFunction = WebGL.createTexture(gl, {
        width   : 2,
        height  : 1,
        data    : new Uint8Array([255, 0, 0, 0, 255, 0, 0, 255]),

        iformat : gl.SRGB8_ALPHA8,
        format  : gl.RGBA,
        type    : gl.UNSIGNED_BYTE,

        wrapS   : gl.CLAMP_TO_EDGE,
        wrapT   : gl.CLAMP_TO_EDGE,
        min     : gl.LINEAR,
        mag     : gl.LINEAR,
    });

    this._clipQuadProgram = WebGL.buildPrograms(gl, {
        quad: SHADERS.quad
    }, MIXINS).quad;
}

destroy() {
    return; // TODO

    const gl = this._gl;
    this._frameBuffer.destroy();
    this._accumulationBuffer.destroy();
    this._renderBuffer.destroy();
    gl.deleteTexture(this._transferFunction);
    gl.deleteProgram(this._clipQuadProgram.program);
}

render() {
    this._generateFrame();

    this._integrateFrame();
    this._accumulationBuffer.swap();

    this._renderFrame();
}

reset() {
    this._resetFrame();
    this._accumulationBuffer.swap();
}

_rebuildBuffers() {
    if (this._frameBuffer) {
        this._frameBuffer.destroy();
    }
    if (this._accumulationBuffer) {
        this._accumulationBuffer.destroy();
    }
    if (this._renderBuffer) {
        this._renderBuffer.destroy();
    }
    const device = this._device;
    this._frameBuffer = new WebGPUSingleBuffer(device, this._getFrameBufferSpec());
    this._accumulationBuffer = new WebGPUDoubleBuffer(device, this._getAccumulationBufferSpec());
    this._renderBuffer = new WebGPUSingleBuffer(device, this._getRenderBufferSpec());
}

setVolume(volume) {
    this._volume = volume;
    this.reset();
}

setTransferFunction(transferFunction) {
    return; // TODO

    const gl = this._gl;
    gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);
    gl.texImage2D(gl.TEXTURE_2D, 0,
        gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, transferFunction);
}

setResolution(resolution) {
    if (resolution !== this._resolution) {
        this._resolution = resolution;
        this._rebuildBuffers();
        this.reset();
    }
}

getTexture() {
    return this._renderBuffer.getAttachments()[0].texture;
}

_resetFrame() {
    // IMPLEMENT
}

_generateFrame() {
    // IMPLEMENT
}

_integrateFrame() {
    // IMPLEMENT
}

_renderFrame() {
    // IMPLEMENT
}

_getFrameBufferSpec() {
    // IMPLEMENT
}

_getAccumulationBufferSpec() {
    // IMPLEMENT
}

_getRenderBufferSpec() {
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
        wrapS   : gl.CLAMP_TO_EDGE,
        wrapT   : gl.CLAMP_TO_EDGE,
        format  : gl.RGBA,
        iformat : gl.RGBA16F,
        type    : gl.FLOAT,
    }];
}

}
