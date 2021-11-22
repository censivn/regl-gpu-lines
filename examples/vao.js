const regl = createREGL({
  extensions: ['ANGLE_instanced_arrays'],
  optionalExtensions: ['OES_vertex_array_object']
});

if (!regl.hasExtension('OES_vertex_array_object')) {
  console.warn('Unable to load OES_vertex_array_object extension. VAOs will be emulated.');
}

// This command illustrates usage of Vertex Array Objects (VAOs). The general idea of VAOs is that
// you define the full state of strides and offsets up front to avoid having to configure it over
// and over.
//
// In the context of regl-gpu-lines, it means that you move vertexAttributes and endpointAttributes
// to a separate call to `reglLines.vao()`, then simply proceed exactly as you would otherwise.

const drawLines = reglLines(regl, {
  vert: `
    precision highp float;

    // Use a vec2 attribute to construt the vec4 vertex position
    #pragma lines: attribute vec2 xy;
    #pragma lines: position = getPosition(xy);
    vec4 getPosition(vec2 xy) {
      return vec4(xy, 0, 1);
    }

    #pragma lines: attribute float orientation;
    #pragma lines: orientation = getOrientation(orientation)
    float getOrientation(float o) { return o; }

    // Return the line width from a uniorm
    #pragma lines: width = getWidth();
    uniform float width;
    float getWidth() {
      return width;
    }`,
  frag: `
    precision lowp float;
    void main () {
      gl_FragColor = vec4(1);
    }`,

  // Multiply the width by the pixel ratio for consistent width
  uniforms: {
    width: (ctx, props) => ctx.pixelRatio * props.width
  },
});

// Construct an array of xy pairs
const n = 11;
const xy = [...Array(n).keys()]
  .map(i => (i / (n - 1) * 2.0 - 1.0) * 0.8)
  .map(t => [t, 0.5 * Math.sin(8.0 * t)]);

// Instead of passing vertex and endpoint attributes with line data, we instead allocate a Vertex
// Array Object (VAO) up front, then pass the resulting object to the draw command. This prevents
// having to compute and configure strides and offsets on every frame.
const vao = drawLines.vao({
  vertexAttributes: {
    xy: regl.buffer(xy)
  },
  endpointAttributes: {
    // Note the use of flat() which is required for regl to correctly infer the dimensionality of
    // the data, which must be correctly passed to the VAO.
    orientation: regl.buffer([Array(3).fill(reglLines.CAP_START), Array(3).fill(reglLines.CAP_END)].flat()),
    xy: regl.buffer([xy.slice(0, 3), xy.slice(-3).reverse()].flat())
  }
});

function draw () {
  // After the above step, line proceeds as normal, except instead of attributes, we pass it the
  // preallocated VAO object.
  const lineData = {
    width: 30,
    join: 'round',
    cap: 'round',
    vertexCount: xy.length,
    endpointCount: 2,
    vao
  };

  regl.poll();
  regl.clear({color: [0.2, 0.2, 0.2, 1]});
  drawLines(lineData);
}

draw();
window.addEventListener('resize', draw);
