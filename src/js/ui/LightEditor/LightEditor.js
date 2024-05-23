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

		this.spectrum_power_distribution = new Uint8Array(256).fill(100);
		this.direction = [1, 0, 0];

		this.binds.direction.addEventListener('change', e => {
			this.direction = this.binds.direction.value;
			this.dispatchEvent(new Event('change'));
		});

		this.binds.spectrum.addEventListener('change', e => {
			this.spectrum_power_distribution = this.binds.spectrum.value;
			this.dispatchEvent(new Event('change'));
		});		
	}
}

customElements.define('ui-light-editor', LightEditor);
