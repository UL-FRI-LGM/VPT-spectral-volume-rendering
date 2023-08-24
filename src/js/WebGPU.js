export class WebGPU {

/**
 * Create WebGPU buffer from a typed array
 * @param {GPUDevice} device 
 * @param {TypedArray} data 
 * @param {GPUBufferUsageFlags} usage
 * @returns {GPUBuffer}
 */
static createBuffer(device, data, usage) {
    let buffer = device.createBuffer({
        size: (data.byteLength + 3) & ~3,
        usage,
        mappedAtCreation: true
    });
    new data.constructor(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
}

static createTextureFromArray(device, size, format, bytesPerTexel, usage, data) {
    // TODO: Infer bytesPerTexel from format
    let texture = device.createTexture({
        size,
        format,
        usage
    })
    device.queue.writeTexture(
        { texture },
        data,
        {  bytesPerRow: size[0] * bytesPerTexel },
        size
    );
    return texture
}

}
