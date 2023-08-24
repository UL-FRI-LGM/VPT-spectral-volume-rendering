export class WebGPUSingleBuffer {

constructor(device, spec) {
    this._device = device;
    this._spec = spec;

    this._attachments = this._createAttachmentsFromSpec(device, spec);

    this._width = spec[0].textureDescriptor.size[0];
    this._height = spec[0].textureDescriptor.size[1];
}

destroy() {
    return; // TODO

    const gl = this._gl;
    gl.deleteFramebuffer(this._framebuffer);
    for (let texture of this._attachments.color) {
        gl.deleteTexture(texture);
    }
}

_createAttachmentsFromSpec(device, spec) {
    return spec.map(s => ({
        texture: device.createTexture(s.textureDescriptor),
        sampler: device.createSampler(s.samplerDescriptor)
    }));
}

getAttachments() {
    return this._attachments;
}

}
