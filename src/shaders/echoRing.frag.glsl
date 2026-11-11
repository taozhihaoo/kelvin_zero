// Glowing pitch ring at the pointer.
varying vec2 vUv;
uniform float uOpacity;
void main(){
  float d = abs(length(vUv - .5) * 2. - .82);
  float a = (1. - smoothstep(0., .1, d)) * .9 * uOpacity;
  gl_FragColor = vec4(ACID * a, a);
}
