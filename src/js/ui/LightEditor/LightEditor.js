import { DOMUtils } from '../../utils/DOMUtils.js';
import { lambda_to_RGB } from '../../utils/Spectrum.js';


const template = document.createElement('template');
template.innerHTML = await fetch(new URL('./LightEditor.html', import.meta.url))
    .then(response => response.text());

export class LightEditor extends HTMLElement {

	constructor() {
		super();
		this.shadow = this.attachShadow({ mode: 'open' });
		this.shadow.appendChild(template.content.cloneNode(true));
		this.binds = DOMUtils.bind(this.shadow);

		this.ctx = this.binds.canvas.getContext('2d');

		this.mouse_down = false;
		this.spectrum_power_distribution = new Uint8Array(256).fill(255);
		this.last_x = undefined;
		this.direction = [1, 0, 0];

		this.binds.direction.addEventListener('change', e => {
			this.direction = this.binds.direction.value;
			this.dispatchEvent(new Event('change'));
		});

		this.shadow.addEventListener('mousedown', e => {
			this.mouse_down = true;
		});

		document.addEventListener('mouseup', e => {
			this.mouse_down = false;
			this.last_x = undefined;
		});

		this.binds.canvas.addEventListener('mousemove', e => {
			if(this.mouse_down) {
				const rect = this.binds.canvas.getBoundingClientRect();
				const x = e.clientX - rect.left;
				const y = e.clientY - rect.top;
				this.spectrum_power_distribution[Math.round(x)] = Math.max(256-y, 0);
				// fill in the gaps
				if(this.last_x !== undefined){
					const dx = x - this.last_x;
					const dy = this.spectrum_power_distribution[Math.round(x)] - this.spectrum_power_distribution[Math.round(this.last_x)];
					const slope = dy / dx;
					for(let i = Math.min(x, this.last_x); i < Math.max(x, this.last_x); i++) {
						this.spectrum_power_distribution[i] = this.spectrum_power_distribution[Math.round(this.last_x)] + slope * (i - Math.round(this.last_x));
					}
				}

				this.last_x = x;

				this.render();

				this.dispatchEvent(new Event('change'));
			}
		});

		this.render();
	}

	render(){
		this.ctx.clearRect(0, 0, this.binds.canvas.width, this.binds.canvas.height);
	
		for(let i = 0; i < 256; i++) {
			let rgb = lambda_to_RGB(i/256 * (700 - 400) + 400);
			this.ctx.fillStyle = `rgb(${Math.floor(rgb.R*256)}, ${Math.floor(rgb.G*256)}, ${Math.floor(rgb.B*256)})`;
			this.ctx.fillRect(i, 256-this.spectrum_power_distribution[i], 1, 1000);
		}
	}
}

customElements.define('ui-light-editor', LightEditor);
