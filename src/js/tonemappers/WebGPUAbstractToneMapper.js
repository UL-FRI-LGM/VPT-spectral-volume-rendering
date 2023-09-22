import { PropertyBag } from '../PropertyBag.js';
import { WebGPUSingleBuffer } from '../WebGPUSingleBuffer.js';

export class WebGPUAbstractToneMapper extends PropertyBag {

constructor(device, texture, textureSampler, options = {}) {
    super();

    this._resolution = options.resolution ?? 512;

    this._device = device;
    this._texture = texture;
    this._textureSampler = textureSampler;

    this._rebuildBuffers();
}

destroy() {
    this._renderBuffer.destroy();
}

render() {
    this._renderFrame();
}

setTexture(texture, textureSampler) {
    this._texture = texture;
    this._textureSampler = textureSampler;
}

getTexture() {
    return this._renderBuffer.getAttachments()[0].texture;
}

getTextureSampler() {
    return this._renderBuffer.getAttachments()[0].sampler;
}

_rebuildBuffers() {
    if (this._renderBuffer) {
        this._renderBuffer.destroy();
    }
    const device = this._device;
    this._renderBuffer = new WebGPUSingleBuffer(device, this._getRenderBufferSpec());
}

setResolution(resolution) {
    if (resolution !== this._resolution) {
        this._resolution = resolution;
        this._rebuildBuffers();
    }
}

_renderFrame() {
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
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            magFilter: "linear",
            minFilter: "linear"
        }
    }];
}

}
