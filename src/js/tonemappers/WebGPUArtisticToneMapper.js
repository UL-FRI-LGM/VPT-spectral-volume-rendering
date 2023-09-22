import { WebGPU } from '../WebGPU.js';
import { WebGPUAbstractToneMapper } from './WebGPUAbstractToneMapper.js';

const [ SHADERS, MIXINS ] = await Promise.all([
    'shaders-wgsl.json',
    'mixins-wgsl.json',
].map(url => fetch(url).then(response => response.json())));

export class WebGPUArtisticToneMapper extends WebGPUAbstractToneMapper {

constructor(device, texture, textureSampler, options = {}) {
    super(device, texture, textureSampler, options);

    this.registerProperties([
        {
            name: 'low',
            label: 'Low',
            type: 'spinner',
            value: 0,
        },
        {
            name: 'high',
            label: 'High',
            type: 'spinner',
            value: 1,
        },
        {
            name: 'mid',
            label: 'Midtones',
            type: 'slider',
            value: 0.5,
            min: 0.00001,
            max: 0.99999,
        },
        {
            name: 'saturation',
            label: 'Saturation',
            type: 'spinner',
            value: 1,
        },
        {
            name: 'gamma',
            label: 'Gamma',
            type: 'spinner',
            value: 2.2,
            min: 0,
        },
    ]);

    const modules = WebGPU.buildShaderModules(device, SHADERS.tonemappers.ArtisticToneMapper, MIXINS);

    this._renderUniformBuffer = device.createBuffer({
        size: 20,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this._renderPipeline = device.createRenderPipeline({
        label: "WebGPUArtisticToneMapper render pipeline",
        layout: "auto",
        vertex: {
            module: modules.render,
            entryPoint: "vertex_main"
        },
        fragment: {
            module: modules.render,
            entryPoint: "fragment_main",
            targets: this._getRenderBufferSpec().map(s => ({ format: s.textureDescriptor.format }))
        }
    });
}

destroy() {
    this._renderUniformBuffer.destroy();

    super.destroy();
}

_renderFrame() {
    const device = this._device;

    device.queue.writeBuffer(this._renderUniformBuffer, 0, new Float32Array([
        this.low,        // uniforms.low
        this.mid,        // uniforms.mid
        this.high,       // uniforms.high
        this.saturation, // uniforms.saturation
        this.gamma       // uniforms.gamma
    ]));

    const bindGroup = device.createBindGroup({
        layout: this._renderPipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: this._texture.createView()
            },
            {
                binding: 1,
                resource: this._textureSampler
            },
            {
                binding: 2,
                resource: { buffer: this._renderUniformBuffer }
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

}
