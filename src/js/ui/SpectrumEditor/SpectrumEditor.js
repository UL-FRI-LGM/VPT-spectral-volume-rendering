import { DOMUtils } from '../../utils/DOMUtils.js';
import { lambda_to_RGB } from '../../utils/Spectrum.js';


const template = document.createElement('template');
template.innerHTML = await fetch(new URL('./SpectrumEditor.html', import.meta.url))
    .then(response => response.text());

export class SpectrumEditor extends HTMLElement {

	constructor() {
		super();
		this.shadow = this.attachShadow({ mode: 'open' });
		this.shadow.appendChild(template.content.cloneNode(true));
		this.binds = DOMUtils.bind(this.shadow);

		this.ctx = this.binds.canvas.getContext('2d');

		this.mouse_down = false;
		this._value = new Uint8Array(256).fill(127);
		this.last_x = undefined;

		this.shadow.addEventListener('mousedown', e => {
			e.preventDefault();
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
				this._value[Math.round(x)] = Math.max(256-y, 0);
				// fill in the gaps
				if(this.last_x !== undefined){
					const dx = x - this.last_x;
					const dy = this._value[Math.round(x)] - this._value[Math.round(this.last_x)];
					const slope = dy / dx;
					for(let i = Math.min(x, this.last_x); i < Math.max(x, this.last_x); i++) {
						this._value[i] = this._value[Math.round(this.last_x)] + slope * (i - Math.round(this.last_x));
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
			this.ctx.fillRect(i, 256-this._value[i], 1, 1000);
		}
	}

	get value(){
		return this._value;
	}

	set value(value){
		this._value = value;
		this.render();
	}
}

customElements.define('ui-spectrum-editor', SpectrumEditor);
