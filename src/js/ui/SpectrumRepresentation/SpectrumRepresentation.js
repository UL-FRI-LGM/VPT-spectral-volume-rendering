import { DOMUtils } from '../../utils/DOMUtils.js';

const template = document.createElement('template');
template.innerHTML = await fetch(new URL('./SpectrumRepresentation.html', import.meta.url))
    .then(response => response.text());

export class SpectrumRepresentation extends HTMLElement {

constructor() {
    super();

	
    this.shadow = this.attachShadow({ mode: 'open' });
    this.shadow.appendChild(template.content.cloneNode(true));
    this.binds = DOMUtils.bind(this.shadow);
	
	this.markers = this.binds.markers;
	this.container = this.binds.container;
	this.track_width = 256;
	this.container.style.width = `${this.track_width}px`;

	this.grabbing = null;
	this.grabbing_offset = 0;




	this.shadow.addEventListener('mouseup', e => {
		this.grabbing = null;
		this.dispatchEvent(new Event('change'));
	});

	this.shadow.addEventListener('mousemove', e => {
		if(this.grabbing) {
			const rect = this.markers.getBoundingClientRect();
			let x = e.clientX + this.grabbing_offset - rect.left;
			x = Math.min(this.track_width, Math.max(0, x));
			this.grabbing.style.left = `${x}px`;
			this.grabbing.innerHTML = `${Math.round(this.to_nm(x / this.track_width))}`;
		}
	});

	this.binds.arrange.onclick = e => this.arrange(Number(this.binds.k.value));

	this.binds.n_bins.onchange = e => this.init_markers(Number(this.binds.n_bins.value))

	this.init_markers(Number(this.binds.n_bins.value));
}

init_markers(n) {
	this.markers.innerHTML = '';
	for(let i = 0; i <= n; i++) {
		const marker = document.createElement('div');
		marker.classList.add('marker');
		marker.addEventListener('mousedown', e => {
			e.preventDefault();
			this.grabbing = marker;
			this.grabbing_offset = e.target.getBoundingClientRect().left - e.clientX + 5;
		});
		this.markers.appendChild(marker);
	}
	this.arrange(Number(this.binds.k.value));
}

to_nm(x) {
	// map 0..1 to 400..700
	return 400 + x * 300;
}
arrange(k){
	const markers = Array.from(this.markers.children);
	for(let i = 0; i < markers.length; i++) {
		let t = i / (markers.length-1);
		let x = (Math.exp(k*t) - 1) / (Math.exp(k) - 1);
		if(k == 0){
			x = t
		}
		markers[i].style.left = `${x * this.track_width}px`;
		markers[i].innerHTML = `${Math.round(this.to_nm(x))}`;
	}

	this.dispatchEvent(new Event('change'));
}

get_bins(){
	let markers = Array.from(this.markers.children);
	let lambdas = markers.map(marker => Number(marker.innerHTML));
	lambdas.sort((a, b) => a - b);
	return lambdas;
}

}

customElements.define('ui-spectrum-representation', SpectrumRepresentation);
