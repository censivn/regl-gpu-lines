(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.reglLines = factory());
})(this, (function () { 'use strict';

  var CAP_START = 0;
  var CAP_END = 1;
  var CAP_SHORT = 2;
  var require$$8 = {
  	CAP_START: CAP_START,
  	CAP_END: CAP_END,
  	CAP_SHORT: CAP_SHORT
  };

  const ORIENTATION$4 = require$$8;
  var glslPrelude$4 = `
#ifndef PI
#define PI 3.141592653589793
#endif

#define CAP_START ${ORIENTATION$4.CAP_START}.0
#define CAP_END ${ORIENTATION$4.CAP_END}.0

float miterExtension(vec2 t01, vec2 t12) {
  float cosTheta = dot(t01, t12);
  if (cosTheta - 1e-7 < -1.0) return 0.0;
  float sinTheta = t01.x * t12.y - t01.y * t12.x;
  return sinTheta / (1.0 + cosTheta);
}

bool isnan(float val) {
  return ( val < 0.0 || 0.0 < val || val == 0.0 ) ? false : true;
}

bool invalid(vec4 p) {
  return p.w==0.0||isnan(p.x);
}

bool isSelfIntersection(vec2 tBC, vec2 tCD, float widthC, float lBCD) {
  if (dot(tBC, tCD) > 0.0) return false;
  return length(tBC + tCD) * lBCD < 2.0 * widthC;
}`;

  const glslPrelude$3 = glslPrelude$4;
  var drawMiterSegment = createDrawMiterSegmentCommand$1;

  function createDrawMiterSegmentCommand$1({
    regl,
    frag,
    meta,
    segmentSpec,
    indexAttributes,
    debug
  }) {
    return regl({
      vert: `${meta.glsl}

attribute vec2 linePosition;
${segmentSpec.glsl}

uniform float miterLimit;
uniform vec2 resolution;

varying vec2 lineCoord;
varying float computedWidth;

${debug ? 'attribute float index;' : ''}
${debug ? 'attribute float debugInstanceID;' : ''}
${debug ? 'varying vec2 triStripGridCoord;' : ''}
${debug ? 'varying float instanceID;' : ''}

${glslPrelude$3}

void main() {
  ${debug ? 'instanceID = debugInstanceID;' : ''}
  ${debug ? 'triStripGridCoord = vec2(floor(index / 2.0), mod(index, 2.0));' : ''}
  lineCoord.x = 0.0;
  lineCoord.y = linePosition.y;

  ${''
    /* Project all four points */
    }
  vec4 pA = ${meta.position.generate('A')};
  vec4 pB = ${meta.position.generate('B')};
  vec4 pC = ${meta.position.generate('C')};
  vec4 pD = ${meta.position.generate('D')};

  if (pA.w == 0.0 || pB.w == 0.0 || pC.w == 0.0 || pD.w == 0.0 ||
    isnan(pA.x) || isnan(pB.x) || isnan(pC.x) || isnan(pD.x)) {
    gl_Position = vec4(0);
    return;
  }

  float _computedWidthB = ${meta.width.generate('B')};
  float _computedWidthC = ${meta.width.generate('C')};
  computedWidth = _computedWidthC;

  float useC = 1.0;
  float pBw = pB.w;
  float computedW = pC.w;

  ${''
    /* Convert to screen-pixel coordinates */
    }
  pA = vec4(pA.xy * resolution, pA.zw) / pA.w;
  pB = vec4(pB.xy * resolution, pB.zw) / pBw;
  pC = vec4(pC.xy * resolution, pC.zw) / computedW;
  pD = vec4(pD.xy * resolution, pD.zw) / pD.w;

  ${''
    /* Invalidate triangles too far in front of or behind the camera plane */
    }
  if (max(abs(pB.z), abs(pC.z)) > 1.0) {
    gl_Position = vec4(0);
    return;
  }

  ${''
    /* Tangent and normal vectors */
    }
  vec2 rAB = pB.xy - pA.xy;
  vec2 rBC = pC.xy - pB.xy;
  vec2 rCD = pD.xy - pC.xy;
  float lAB = length(rAB);
  float lBC = length(rBC);
  float lCD = length(rCD);

  vec2 tAB = rAB / lAB;
  vec2 tBC = rBC / lBC;
  vec2 tCD = rCD / lCD;

  vec2 nBC = vec2(-tBC.y, tBC.x);
  vec2 nCD = vec2(-tCD.y, tCD.x);

  gl_Position = pC;

  float dirC = dot(tBC, nCD) < 0.0 ? -1.0 : 1.0;
  if (linePosition.x > 1.0) {
    gl_Position.xy += dirC * linePosition.y * computedWidth * nCD;
    lineCoord.y = dirC;
  } else {
    bool isStart = linePosition.x < 0.5;

    if (isStart) {
      useC = 0.0;
      computedWidth = _computedWidthB;
      computedW = pBw;
    }

    float m = miterExtension(isStart ? tAB : tBC, isStart ? tBC : tCD);
    float lABC = min(lAB, lBC);
    float lBCD = min(lBC, lCD);
    float m0_abc = min(-m * computedWidth, lABC);
    float m1_abc = min(m * computedWidth, lABC);
    float m0_bcd = min(-m * computedWidth, lBCD);
    float m1_bcd = min(m * computedWidth, lBCD);

    gl_Position.xy += linePosition.y * computedWidth * nBC;

    if (isStart) {
      gl_Position.z = pB.z;
      float dirB = dot(tAB, nBC) < 0.0 ? -1.0 : 1.0;
      bool bIsOuter = dirB * linePosition.y > 0.0;
      gl_Position.xy -= tBC * (lBC - (linePosition.y < 0.0 ? m0_abc : m1_abc) * (bIsOuter ? 0.0 : 1.0));
    } else {
      bool cIsOuter = dirC * linePosition.y > 0.0;
      bool clipC = abs(m) > miterLimit;
      gl_Position.xy -= tBC * (linePosition.y > 0.0 ? m1_bcd : m0_bcd) * (cIsOuter && clipC ? 0.0 : 1.0);
    }
  }

  ${[...meta.varyings.values()].map(varying => varying.generate('useC', 'B', 'C')).join('\n')}

  gl_Position.xy /= resolution;
  gl_Position *= computedW;
}`,
      frag,
      attributes: { ...indexAttributes,
        ...segmentSpec.attrs,
        linePosition: {
          buffer: [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1]],
          divisor: 0
        }
      },
      uniforms: {
        miterLimit: (ctx, props) => Math.sqrt(props.miterLimit * props.miterLimit - 1)
      },
      primitive: 'triangle strip',
      instances: (ctx, props) => props.count - 3,
      count: 5
    });
  }

  const ORIENTATION$3 = require$$8;
  const glslPrelude$2 = glslPrelude$4;
  var drawMiterCap = createDrawMiterCapCommand$1;

  function createDrawMiterCapCommand$1({
    regl,
    frag,
    meta,
    endpointSpec,
    indexPrimitive,
    indexAttributes,
    debug
  }) {
    return regl({
      vert: `${meta.glsl}

attribute float index;
${endpointSpec.glsl}

uniform float miterLimit, capResolution2;
uniform vec2 resolution, capScale;
${meta.orientation ? '' : 'uniform float uOrientation;'}

varying vec2 lineCoord;
varying float computedWidth;

${debug ? 'varying vec2 triStripGridCoord;' : ''}
${debug ? 'varying float instanceID;' : ''}

${glslPrelude$2}

void main() {
  ${debug ? 'instanceID = -1.0;' : ''}
  ${debug ? 'triStripGridCoord = vec2(floor(index / 2.0), mod(index, 2.0));' : ''}
  lineCoord = vec2(0);

  float orientation = ${meta.orientation ? meta.orientation.generate('') : 'mod(uOrientation,2.0)'};

  ${''
    /* Project points */
    }
  vec4 pB = ${meta.position.generate('B')};
  vec4 pC = ${meta.position.generate('C')};
  vec4 pD = ${meta.position.generate('D')};

  float widthB = ${meta.width.generate('B')};
  float widthC = ${meta.width.generate('C')};
  computedWidth = widthC;

  float useC = 1.0;
  float pBw = pB.w;
  float computedW = pC.w;

  ${''
    /* Convert to screen-pixel coordinates */
    }
  pB = vec4(pB.xy * resolution, pB.zw) / pBw;
  pC = vec4(pC.xy * resolution, pC.zw) / computedW;
  pD = vec4(pD.xy * resolution, pD.zw) / pD.w;

  if (pB.w == 0.0 || pC.w == 0.0 || pD.w == 0.0) {
    gl_Position = vec4(0);
    return;
  }

  ${''
    /* Invalidate triangles too far in front of or behind the camera plane */
    }
  if (max(abs(pB.z), abs(pC.z)) > 1.0) {
    gl_Position = vec4(0);
    return;
  }

  ${''
    /* Tangent and normal vectors */
    }
  vec2 rBC = pC.xy - pB.xy;
  float lBC = length(rBC);
  vec2 tBC = rBC / lBC;
  vec2 nBC = vec2(-tBC.y, tBC.x);

  vec2 rCD = pD.xy - pC.xy;
  float lCD = length(rCD);
  vec2 tCD = rCD / lCD;
  vec2 nCD = vec2(-tCD.y, tCD.x);

  gl_Position = pC;

  ${''
    /* Left/right turning at each vertex */
    }
  ${''
    /* Note: don't use sign for this! It's zero when the line is straight. */
    }
  float dirC = dot(tBC, nCD) < 0.0 ? -1.0 : 1.0;
  float endSign = orientation == CAP_START ? 1.0 : -1.0;

  float i = index;
  float iLast = capResolution2 + 4.0;

  ${''
    /* Flip indexing if we turn the opposite direction, so that we draw backwards */
    }
  ${''
    /* and get the winding order correct */
    }
  if (dirC > 0.0) i = iLast - i;

  vec2 xy = vec2(0);
  mat2 xyBasis = mat2(0);

  if (i <= capResolution2) {
    ${''
    /* The first few vertices are on the cap. */
    }
    gl_Position = pB;

    computedWidth = widthB;
    computedW = pBw;
    useC = 0.0;

    if (mod(i, 2.0) == 0.0) {
      xyBasis = mat2(-tBC, nBC * dirC);
      float theta = i / capResolution2 * PI;
      lineCoord = vec2(sin(theta), cos(theta));
      if (abs(lineCoord.x) > 0.1) lineCoord *= capScale;
      gl_Position.xy += computedWidth * (xyBasis * lineCoord);
      lineCoord.y *= dirC * endSign;
    }
  } else {
    i -= capResolution2 + 1.0;

    vec2 position;
    if (i == 0.0) position = vec2(0, 1);
    if (i == 1.0) position = vec2(1, -1);
    if (i >= 2.0) position = vec2(1, 1);
    if (i == 3.0 && orientation == CAP_START) position = vec2(2, 1);

    position.y *= dirC;
    lineCoord.y = position.y * endSign;

    if (position.x > 1.0) {
      gl_Position.xy += position.y * computedWidth * nCD;
    } else {
      bool isSegmentStart = position.x < 0.5;

      if (isSegmentStart) {
        computedWidth = widthB;
        computedW = pBw;
        useC = 0.0;
        gl_Position = pB;
      }

      gl_Position.xy += position.y * computedWidth * nBC;

      if (!isSegmentStart) {
        float m = miterExtension(tBC, tCD);
        float lBCD = min(lBC, lCD);
        float m0 = min(-m * computedWidth, lBCD);
        float m1 = min(m * computedWidth, lBCD);
        bool cIsOuter = dirC * position.y > 0.0;
        bool clipC = abs(m) > miterLimit;
        gl_Position.xy -= tBC * (position.y > 0.0 ? m1 : m0) * (cIsOuter && (clipC || orientation == CAP_END) ? 0.0 : 1.0);
      }
    }
  }

  ${[...meta.varyings.values()].map(varying => varying.generate('useC', 'B', 'C')).join('\n')}

  gl_Position.xy /= resolution;
  gl_Position *= computedW;
}`,
      frag,
      attributes: { ...indexAttributes,
        ...endpointSpec.attrs
      },
      uniforms: {
        uOrientation: regl.prop('orientation'),
        capScale: regl.prop('capScale'),
        capResolution2: (ctx, props) => props.capResolution * 2,
        miterLimit: (ctx, props) => Math.sqrt(props.miterLimit * props.miterLimit - 1)
      },
      primitive: indexPrimitive,
      instances: (ctx, props) => props.splitCaps ? props.orientation === ORIENTATION$3.CAP_START ? Math.ceil(props.count / 2) : Math.floor(props.count / 2) : props.count,
      count: (ctx, props) => props.capResolution * 2 + 5
    });
  }

  const glslPrelude$1 = glslPrelude$4;
  var drawRoundedSegment = createDrawRoundedSegmentCommand$1; // The segment is rendered as a triangle strip. Consider joinResolution = 3. We start
  // at the mitered end of the line and render vertices:
  //
  // - 0, 1, 2: mitered vertices, using beveled line logic
  // - 3, 5, 7, 9: vertices around the circular arc join
  // - 4, 6, 8: repeated vertices at point C to accomplish a triangle fan
  // - 10: a final vertex to close it off
  //
  // Is it worthwhile? I don't know. Consider that as independent triangles, this would
  // contain 7 triangles (= 21 independent vertices) which we instead render using eleven.
  //
  //   1 ------------------------ 3 -5
  //   | ...                     /|    7
  //   |     ...                / |     \
  //   |         ...           /  + ---- 9
  //   |            ...       /  / \ _ -
  //   |                ...  / / _ -\
  //   0 ------------------ x -      \
  //                         \        + 4, 6, 8 (= pC)
  //                          \
  //                           +- 2, 10
  //

  function createDrawRoundedSegmentCommand$1({
    regl,
    meta,
    frag,
    segmentSpec,
    indexAttributes,
    debug
  }) {
    return regl({
      vert: `${meta.glsl}

attribute float index;
${segmentSpec.glsl}

uniform float jres2;
uniform vec2 resolution;

varying vec2 lineCoord;

${debug ? 'attribute float debugInstanceID;' : ''}
${debug ? 'varying vec2 triStripGridCoord;' : ''}
${debug ? 'varying float instanceID;' : ''}

${glslPrelude$1}

void main() {
  gl_PointSize = 10.0;
  ${debug ? 'instanceID = debugInstanceID;' : ''}
  ${debug ? 'triStripGridCoord = vec2(floor(index / 2.0), mod(index, 2.0));' : ''}

  lineCoord = vec2(0);

  ${''
    /* Project all four points */
    }
  vec4 pA = ${meta.position.generate('A')};
  vec4 pB = ${meta.position.generate('B')};
  vec4 pC = ${meta.position.generate('C')};
  vec4 pD = ${meta.position.generate('D')};

  if (invalid(pA) || invalid(pB) || invalid(pC) || invalid(pD)) {
    gl_Position = vec4(0);
    return;
  }

  ${''
    /* Is the first join+half-segment of the instance */
    }
  bool isStart = index <= jres2 + 3.0;
  if (isStart) {
    vec4 tmp;
    tmp = pC; pC = pB; pB = tmp;
    tmp = pD; pD = pA; pA = tmp;
  }

  float useC = isStart ? 0.0 : 1.0;
  float _computedWidthB = isStart ? ${meta.width.generate('C')} : ${meta.width.generate('B')};
  float _computedWidthC = isStart ? ${meta.width.generate('B')} : ${meta.width.generate('C')};

  float pBw = pB.w;
  float computedW = pC.w;

  ${''
    /* Convert to screen-pixel coordinates */
    }
  pA = vec4(pA.xy * resolution, pA.zw) / pA.w;
  pB = vec4(pB.xy * resolution, pB.zw) / pBw;
  pC = vec4(pC.xy * resolution, pC.zw) / computedW;
  pD = vec4(pD.xy * resolution, pD.zw) / pD.w;

  ${''
    /* Invalidate triangles too far in front of or behind the camera plane */
    }
  if (max(abs(pB.z), abs(pC.z)) > 1.0) {
    gl_Position = vec4(0);
    return;
  }

  ${''
    /* Tangent and normal vectors */
    }
  vec2 rBC = pC.xy - pB.xy;
  float lBC = length(rBC);
  vec2 tBC = rBC / lBC;
  vec2 nBC = vec2(-tBC.y, tBC.x);

  vec2 rAB = pB.xy - pA.xy;
  float lAB = length(rAB);
  vec2 tAB = rAB / lAB;

  vec2 rCD = vec2(pD.xy - pC.xy);
  float lCD = length(rCD);
  vec2 tCD = rCD / lCD;
  vec2 nCD = vec2(-tCD.y, tCD.x);

  float lBCD = min(lBC, lCD);

  ${''
    /* Left/right turning at each vertex. Use < vs. <= to break tie when collinear. */
    }
  float dirB = dot(tAB, nBC) < 0.0 ? -1.0 : 1.0;
  float dirC = dot(tBC, nCD) <= 0.0 ? -1.0 : 1.0;

  ${''
    /* x-component is the index within the part (join vs. fan), y-component is the overall index */
    }
  vec2 iindex = vec2(index);

  float flip = dirB * dirC;
  if (flip < 0.0) {
    if (iindex.y == jres2 + 2.0) iindex -= 2.0;
  } else {
    if (iindex.y == jres2 + 3.0) iindex -= 3.0;
  }

  vec2 xy = vec2(0);
  mat2 xyBasis = mat2(0);

  gl_Position = pC;
  float dz = 0.0;

  bool selfIntersects = isSelfIntersection(nBC, nCD, _computedWidthC, lBCD);

  if (iindex.y < jres2 + 1.0 || iindex.y >= jres2 + 5.0) {
    vec2 miterNormal = 0.5 * (tCD + tBC);
    float miterNormalLen = length(miterNormal);
    bool isDegenerate = miterNormalLen == 0.0;

    vec2 xBasis = isDegenerate ? nBC : miterNormal / miterNormalLen;
    vec2 yBasis = vec2(-xBasis.y, xBasis.x);
    if (isDegenerate && !isStart) xBasis = -xBasis;
    xyBasis = mat2(xBasis, yBasis);

    ${''
    /*Adjust indices to get the fan anle correct */
    }
    if (!isStart) iindex.x = 2.0 * jres2 + 4.0 - iindex.x + 1.0;

    ${''
    /* Odd-numbered point in this range are around the arc. Every other index is just the center point pC, repeated since has the geometry of a triangle fan */
    }
    if (mod(iindex.x, 2.0) == 0.0) {
      lineCoord.y = isStart ? -dirC : dirC;
      float cosTheta = clamp(dot(nBC, nCD), -1.0, 1.0);
      float theta = -0.5 * dirC * acos(cosTheta) * (iindex.x / jres2);
      xy = dirC * vec2(sin(theta), cos(theta));

      ${''
    /* Correct for smooth transition of z around the join, but limit to half the z difference to the next point*/
    }
      //if (!isDegenerate)
        dz = -(pB.z - pC.z) * clamp(xy.x * _computedWidthC / lBC, -0.5, 0.5);
    }
  } else {
    ${''
    /* We're in the miter/segment portion */
    }
    ${''
    /* Use the turning direction to put the positive line coord on a consistent side */
    }
    float y = iindex.x == 1.0 ? dirC : -dirC;

    lineCoord.y = isStart ? dirC : -dirC;

    ${''
    /* Extension of miter tangent to the segment */
    }
    float mB = miterExtension(tAB, tBC) * _computedWidthB;
    float mC = miterExtension(tBC, tCD) * _computedWidthC;

    ${''
    /*// Place the corners, with clipping against the opposite end*/
    }
    float lABC = min(lAB, lBC);
    float abcClip = selfIntersects ? lABC : lBC;
    float bcdClip = selfIntersects ? lBCD : lBC;
    float mB0 = dirB > 0.0 ? min(abcClip, -mB) : 0.0;
    float mC0 = dirC > 0.0 ? min(bcdClip, -mC) : 0.0;
    float mB1 = dirB > 0.0 ? 0.0 : min(abcClip, mB);
    float mC1 = dirC > 0.0 ? 0.0 : min(bcdClip, mC);

    xyBasis = mat2(tBC, nBC);
    bool isStart = iindex.x < 2.0;

    xy = vec2(
      (isStart ?
        ${''
    /* If start, then use the miter at B */
    }
        (y > 0.0 ? mB1 : mB0) - lBC :
        ${''
    /* Else, the miter at C */
    }
        -(y > 0.0 ? mC1 : mC0)
      ),
      y);

    if (lBC > 0.0) useC = clamp(useC - dirC * xy.x / lBC * lineCoord.y, 0.0, 1.0);

    xy.x /= _computedWidthC;
  }

  ${''
    /* Compute all varyings with shortening to account for interior miters */
    }
  ${[...meta.varyings.values()].map(varying => varying.generate('useC', 'B', 'C')).join('\n')}

  ${''
    /* Only make z discontinuous when sharp angle self-intersect. Then treat them like varyings. This *might* prevent z-fighting. */
    }
  if (selfIntersects) gl_Position.z = mix(pB.z, pC.z, isStart ? 1.0 - useC : useC);

  ${''
    /* Compute the final position */
    }
  gl_Position.z += dz;
  gl_Position.xy += _computedWidthC * (xyBasis * xy);
  gl_Position.xy /= resolution;
  gl_Position *= computedW;
}`,
      frag,
      attributes: {
        index: {
          buffer: [...Array(400).keys()],
          divisor: 0
        },
        ...indexAttributes,
        ...segmentSpec.attrs
      },
      uniforms: {
        jres2: (ctx, props) => props.joinResolution * 2
      },
      primitive: 'triangle strip',
      instances: (ctx, props) => props.count - 3,
      count: (ctx, props) => 4 * props.joinResolution + 6
    });
  }

  const ORIENTATION$2 = require$$8;
  const glslPrelude = glslPrelude$4;
  var drawRoundedCap = createDrawRoundedCapCommand$1; // The segment is rendered as a triangle strip. Consider joinResolution = 3. We start
  // at the mitered end of the line and render vertices:
  //
  // - 0, 1, 2: mitered vertices, using beveled line logic
  // - 3, 5, 7, 9: vertices around the circular arc join
  // - 4, 6, 8: repeated vertices at point C to accomplish a triangle fan
  // - 10: a final vertex to close it off
  //
  // Is it worthwhile? I don't know. Consider that as independent triangles, this would
  // contain 7 triangles (= 21 independent vertices) which we instead render using eleven.
  //
  //         ...1 ------------------------ 3 -5
  //      ..    | ...                     /|    7
  //     .      |     ...                / |     \
  //     .      |         ...           /  + ---- 9
  //     .      |            ...       /  / \ _ -
  //      ..    |                ...  / / _ -\
  //         ...0 ------------------ x -      \
  //                                  \        + 4, 6, 8 (= pC)
  //                                   \
  //                                    +- 2, 10
  //

  function createDrawRoundedCapCommand$1({
    regl,
    meta,
    frag,
    endpointSpec,
    indexAttributes,
    debug
  }) {
    return regl({
      vert: `${meta.glsl}

attribute float index;
${endpointSpec.glsl}

uniform float joinResolution, capResolution2;
uniform vec2 resolution, capScale;
${meta.orientation ? '' : 'uniform float uOrientation;'}

varying vec2 lineCoord;
varying float computedWidth;

${debug ? 'varying vec2 triStripGridCoord;' : ''}
${debug ? 'varying float instanceID;' : ''}

${glslPrelude}

void main() {
  ${debug ? 'instanceID = -1.0;' : ''}
  ${debug ? 'triStripGridCoord = vec2(floor(index / 2.0), mod(index, 2.0));' : ''}
  lineCoord = vec2(0);

  float orientation = ${meta.orientation ? meta.orientation.generate('') : 'mod(uOrientation,2.0)'};

  ${''
    /* Project points */
    }
  vec4 pB = ${meta.position.generate('B')};
  vec4 pC = ${meta.position.generate('C')};
  vec4 pD = ${meta.position.generate('D')};

  if (pB.w == 0.0 || pC.w == 0.0 || pD.w == 0.0) {
    gl_Position = vec4(0);
    return;
  }

  float widthB = ${meta.width.generate('B')};
  float widthC = ${meta.width.generate('C')};
  computedWidth = widthC;

  float pBw = pB.w;
  float computedW = pC.w;
  float useC = 1.0;

  ${''
    /* Convert to screen-pixel coordinates */
    }
  pB = vec4(pB.xy * resolution, pB.zw) / pBw;
  pC = vec4(pC.xy * resolution, pC.zw) / computedW;
  pD = vec4(pD.xy * resolution, pD.zw) / pD.w;

  ${''
    /* Invalidate triangles too far in front of or behind the camera plane */
    }
  if (max(abs(pB.z), abs(pC.z)) > 1.0) {
    gl_Position = vec4(0);
    return;
  }

  ${''
    /* Tangent and normal vectors */
    }
  vec2 rBC = pC.xy - pB.xy;
  float lBC = length(rBC);
  vec2 tBC = rBC / lBC;
  vec2 nBC = vec2(-tBC.y, tBC.x);

  vec2 rCD = pD.xy - pC.xy;
  float lCD = length(rCD);
  vec2 tCD = rCD / lCD;
  vec2 nCD = vec2(-tCD.y, tCD.x);

  float lBCD = min(lBC, lCD);

  ${''
    /* Left/right turning at each vertex */
    }
  ${''
    /* Note: don't use sign for this! It's zero when the line is straight. */
    }
  float dirC = dot(tBC, nCD) < 0.0 ? -1.0 : 1.0;

  float i = index;
  float iLast = joinResolution * 2.0 + capResolution2 + 4.0;

  vec2 xy = vec2(0);
  mat2 xyBasis = mat2(0);
  float dz = 0.0;

  bool selfIntersects = isSelfIntersection(tBC, tCD, computedWidth, lBCD);

  if (i < capResolution2 + 1.0) {
    ${''
    /* The first few vertices are on the cap. */
    }
    i -= capResolution2;
    gl_Position = pB;
    computedWidth = widthB;
    useC = 0.0;
    computedW = pBw;

    if (mod(i, 2.0) == 1.0) {
      lineCoord = vec2(0);
    } else {
      mat2 xyBasis = mat2(tBC, nBC);
      xyBasis = mat2(tBC, nBC);
      float theta = i / capResolution2 * PI;
      xy = vec2(sin(theta), -cos(theta) * dirC);
      if (abs(xy.x) > 0.1) xy *= capScale;
      lineCoord = xy;
      gl_Position.xy += computedWidth * (xyBasis * xy);
    }
  } else {
    i -= capResolution2;
    iLast = joinResolution * 2.0 + 4.0;

    gl_Position = pC;

    bool isSegment = i <= 2.0 || i == iLast;
    if (i <= 2.0 || i == iLast) {
      ${''
    /* We're in the miter/segment portion */
    }

      ${''
    /* Use the turning direction to put the positive line coord on a consistent side */
    }
      lineCoord.y = i == 1.0 ? dirC : -dirC;

      ${''
    /* Extension of miter tangent to the segment */
    }
      float mC = miterExtension(tBC, tCD) * widthC;

      ${''
    /* Place the corners, with clipping against the opposite end */
    }
      float bcdClip = selfIntersects ? lBCD : lBC;
      float mC0 = dirC > 0.0 ? min(bcdClip, -mC) : 0.0;
      float mC1 = dirC > 0.0 ? 0.0 : min(bcdClip, mC);

      xyBasis = mat2(tBC, nBC);
      bool isStart = i < 2.0;

      if (isStart) useC = 0.0;

      gl_Position.z = isStart ? pB.z : pC.z;

      xy = vec2(
        (isStart ?
          ${''
    /* If so, then use the miter at B */
    }
          -lBC :

          ${''
    /* Else, the miter at C */
    }
          -(lineCoord.y > 0.0 ? mC1 : mC0)
        ),
        lineCoord.y
      );

      if (!isStart) useC -= dirC * xy.x / lBC * lineCoord.y;

      xy.x /= computedWidth;
    } else {
      vec2 miterNormal = 0.5 * (tCD + tBC);
      float miterNormalLen = length(miterNormal);
      bool isDegenerate = miterNormalLen == 0.0;

      vec2 xBasis = isDegenerate ? nCD : miterNormal / miterNormalLen;
      vec2 yBasis = vec2(-xBasis.y, xBasis.x);
      xyBasis = mat2(xBasis, yBasis);

      if (mod(i, 2.0) != 0.0) {
        ${''
    /* Odd-numbered point in this range are around the arc. (Even numbered points in this */
    }
        ${''
    /* range are a no-op and fall through to just point C) */
    }
        lineCoord.y = dirC;

        ${''
    /* Our indexing is offset by three, and every other index is just the center point */
    }
        ${''
    /* pC (which we repeat a bunch since we're drawing a triangle strip) */
    }
        i = (i - 3.0) * 0.5;
        if (dirC > 0.0) i = joinResolution - i;

        float cosTheta = clamp(dot(nBC, nCD), -1.0, 1.0);
        float theta = 0.5 * acos(cosTheta) * (0.5 - 0.5 * dirC - i / joinResolution);
        xy = dirC * vec2(sin(theta), cos(theta));

      ${''
    /* Correct for smooth transition of z around the join, but limit to half the z difference to the next point */
    }
        if (!isDegenerate) dz = -(pB.z - pC.z) * clamp(xy.x * computedWidth / lBC, -0.5, 0.5);
      }
    }

    ${''
    /* Compute the final position */
    }
    gl_Position.xy += computedWidth * (xyBasis * xy);
  }

  if (orientation == CAP_END) lineCoord = -lineCoord;

  ${''
    /* Compute all varyings with shortening to account for interior miters */
    }
  ${[...meta.varyings.values()].map(varying => varying.generate('useC', 'B', 'C')).join('\n')}

  ${''
    /* Only make z discontinuous when sharp angle self-intersect. Then treat them like varyings. This *might* prevent z-fighting. */
    }
  if (selfIntersects) gl_Position.z = mix(pB.z, pC.z, useC);

  gl_Position.z += dz;
  gl_Position.xy /= resolution;
  gl_Position *= computedW;
}`,
      frag,
      attributes: { ...indexAttributes,
        ...endpointSpec.attrs
      },
      uniforms: {
        joinResolution: regl.prop('joinResolution'),
        capResolution2: (ctx, props) => props.capResolution * 2,
        uOrientation: regl.prop('orientation'),
        capScale: regl.prop('capScale')
      },
      primitive: 'triangle strip',
      instances: (ctx, props) => props.splitCaps ? props.orientation === ORIENTATION$2.CAP_START ? Math.ceil(props.count / 2) : Math.floor(props.count / 2) : props.count,
      count: (ctx, props) => (props.joinResolution + props.capResolution) * 2 + 4
    });
  }

  var attrUsage = {
    NONE: 0,
    REGULAR: 1,
    EXTENDED: 2,
    PER_INSTANCE: 4
  };

  const ATTR_USAGE$1 = attrUsage;
  var parsePragmas = parseShaderPragmas$1;
  const PRAGMA_REGEX = /^\s*#pragma\s+lines\s*:\s*([^;]*);?$/i;
  const ATTRIBUTE_REGEX = /^\s*attribute\s+(float|vec2|vec3|vec4)\s+([\w\d_]+)\s*$/i;
  const PROPERTY_REGEX = /^\s*(position|width|orientation)\s+=\s+([\w\d_]+)\s*\(([^)]*)\)\s*$/i;
  const VARYING_REGEX = /^\s*varying\s+(float|vec2|vec3|vec4)\s+([\w\d_]+)\s*=\s*([\w\d_]+)\(([^)]*)\)\s*$/;
  const DIMENSION_GLSL_TYPES = {
    "float": 1,
    "vec2": 2,
    "vec3": 3,
    "vec4": 4
  };

  function parseShaderPragmas$1(glsl) {
    const pragmas = [];
    const lines = glsl.split('\n');

    for (let i = 0; i < lines.length; i++) {
      lines[i] = lines[i].replace(PRAGMA_REGEX, function (match, pragma) {
        pragmas.push(parsePragma(pragma));
        return '';
      });
    }

    return {
      glsl: lines.join('\n').trim(),
      ...analyzePragmas(pragmas)
    };
  }

  function parsePragma(pragma) {
    pragma = pragma.trim();
    let match;

    if (match = pragma.match(ATTRIBUTE_REGEX)) {
      const dimension = DIMENSION_GLSL_TYPES[match[1]];
      const name = match[2];
      return {
        type: 'attribute',
        dimension,
        name
      };
    } else if (match = pragma.match(PROPERTY_REGEX)) {
      const property = match[1];
      const returnType = {
        width: 'float',
        position: 'vec4',
        orientation: 'bool'
      }[property];
      const name = match[2];
      const inputs = match[3].split(',').map(str => str.trim()).filter(x => !!x);

      const generate = (label, prefix) => `${name}(${inputs.map(input => (prefix || '') + input + label).join(', ')})`;

      return {
        type: 'property',
        property,
        returnType,
        name,
        inputs,
        generate
      };
    } else if (match = pragma.match(VARYING_REGEX)) {
      const returnType = match[1];
      const name = match[2];
      const getter = match[3];
      const inputs = match[4].split(',').map(str => str.trim()).filter(x => !!x);

      const generate = (interp, a, b) => {
        return `${name} = ${getter}(${inputs.map(input => `mix(${input + a}, ${input + b}, ${interp})`).join(', ')});`;
      };

      return {
        type: 'varying',
        returnType,
        name,
        getter,
        inputs,
        generate
      };
    } else {
      throw new Error(`Unrecognized lines pragma: "${pragma}"`);
    }
  }

  function analyzePragmas(pragmas) {
    const attrs = new Map();
    const varyings = new Map();

    for (const pragma of pragmas) {
      if (pragma.type === 'attribute') {
        attrs.set(pragma.name, pragma);
        pragma.vertexUsage = ATTR_USAGE$1.NONE;
        pragma.endpointUsage = ATTR_USAGE$1.NONE;
      } else if (pragma.type === 'varying') {
        varyings.set(pragma.name, pragma);
      }
    }

    let width, position, orientation;

    for (const pragma of pragmas) {
      if (pragma.type !== 'property') continue;

      switch (pragma.property) {
        case 'width':
          if (width) throw new Error(`Unexpected duplicate pragma for property "${pragma.property}"`);
          width = pragma;
          break;

        case 'position':
          if (position) throw new Error(`Unexpected duplicate pragma for property "${pragma.property}"`);
          position = pragma;
          break;

        case 'orientation':
          if (orientation) throw new Error(`Unexpected duplicate pragma for property "${pragma.property}"`);
          orientation = pragma;
          break;

        default:
          throw new Error(`Invalid pragma property "${pragma.property}"`);
      }

      for (const input of pragma.inputs) {
        if (!attrs.has(input)) throw new Error(`Missing attribute ${input} of property ${pragma.property}`);
      }
    }

    for (const pragma of pragmas) {
      if (!pragma.inputs) continue;

      for (const input of pragma.inputs) {
        const inputAttr = attrs.get(input);

        if (pragma.type === 'property' || pragma.type === 'varying') {
          if (pragma.property === 'position') {
            inputAttr.vertexUsage |= ATTR_USAGE$1.EXTENDED;
            inputAttr.endpointUsage |= ATTR_USAGE$1.EXTENDED;
          } else if (pragma.property === 'orientation') {
            inputAttr.endpointUsage |= ATTR_USAGE$1.PER_INSTANCE;
          } else {
            inputAttr.endpointUsage |= ATTR_USAGE$1.REGULAR;
            inputAttr.vertexUsage |= ATTR_USAGE$1.REGULAR;
          }
        }
      }
    }

    return {
      varyings,
      attrs,
      width,
      position,
      orientation
    };
  }

  const DTYPES_SIZES = [];
  DTYPES_SIZES[5120] = 1; // int8

  DTYPES_SIZES[5122] = 2; // int16

  DTYPES_SIZES[5124] = 4; // int32

  DTYPES_SIZES[5121] = 1; // uint8

  DTYPES_SIZES[5123] = 2; // uint16

  DTYPES_SIZES[5125] = 4; // uint32

  DTYPES_SIZES[5126] = 4; // float32

  var dtypesizes = DTYPES_SIZES;

  var int8 = 5120;
  var int16 = 5122;
  var int32 = 5124;
  var uint8 = 5121;
  var uint16 = 5123;
  var uint32 = 5125;
  var float = 5126;
  var float32 = 5126;
  var require$$1 = {
  	int8: int8,
  	int16: int16,
  	int32: int32,
  	uint8: uint8,
  	uint16: uint16,
  	uint32: uint32,
  	float: float,
  	float32: float32
  };

  var sanitizeBuffer = sanitizeBufferInput;
  const DTYPE_SIZES = dtypesizes;
  const DTYPES = require$$1;

  function has(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  }

  function sanitizeBufferInput(metadata, buffersObj, isEndpoints) {
    const outputs = {};
    if (!buffersObj) return outputs;

    for (let [attrName, attrMeta] of metadata.attrs) {
      const input = buffersObj[attrName];
      const usage = isEndpoints ? attrMeta.endpointUsage : attrMeta.vertexUsage;
      if (!usage) continue;
      const output = {
        buffer: null,
        dimension: attrMeta.dimension,
        offset: 0,
        type: NaN,
        stride: NaN,
        divisor: 1,
        bytesPerElement: NaN
      };

      if (!input) {
        throw new Error(`Missing buffer for ${isEndpoints ? 'endpoint' : 'vertex'} attribute '${attrName}'`);
      } else if (input._reglType === 'buffer') {
        output.buffer = input;
        output.type = output.buffer._buffer.dtype;
      } else if (input.buffer._reglType === 'buffer') {
        output.buffer = input.buffer;

        if (has(input, 'dimension') && input.dimension !== output.dimension) {
          throw new Error(`Size of attribute (${input.dimension}) does not match dimension specified in shader pragma (${attrMeta.dimension})`);
        }

        if (has(input, 'offset')) output.offset = input.offset;

        if (has(input, 'type')) {
          output.type = DTYPES[input.type];
        } else {
          output.type = output.buffer._buffer.dtype;
        }

        if (has(input, 'divisor')) {
          output.divisor = input.divisor;
        }

        if (has(input, 'stride')) output.stride = input.stride;
      } else {
        throw new Error(`Invalid buffer for attribute '${attrName}'`);
      }

      output.bytesPerElement = DTYPE_SIZES[output.type];

      if (Number.isNaN(output.stride)) {
        output.stride = output.bytesPerElement * attrMeta.dimension;
      }

      outputs[attrName] = output;
    }

    return outputs;
  }

  const GLSL_TYPES$1 = [];
  GLSL_TYPES$1[1] = 'float';
  GLSL_TYPES$1[2] = 'vec2';
  GLSL_TYPES$1[3] = 'vec3';
  GLSL_TYPES$1[4] = 'vec4';
  var glsltypes = GLSL_TYPES$1;

  var createAttrSpec$1 = createAttrSpecs;
  const ATTR_USAGE = attrUsage;
  const GLSL_TYPES = glsltypes;
  const ORIENTATION$1 = require$$8;

  function createAttrSpecs(meta, regl, isEndpoints) {
    const suffixes = isEndpoints ? ['B', 'C', 'D'] : ['A', 'B', 'C', 'D'];
    const attrLines = [];
    const attrSpecs = {};
    meta.attrs.forEach((attr, attrName) => {
      const usage = isEndpoints ? attr.endpointUsage : attr.vertexUsage;
      if (!usage) return;
      const attrList = [];

      function emitAttr(index, suffix) {
        const attrOutName = attrName + suffix;
        attrList.push(attrOutName);

        if (isEndpoints) {
          const instanceStride = usage & ATTR_USAGE.PER_INSTANCE ? 1 : 3;
          attrSpecs[attrOutName] = {
            buffer: regl.prop(`buffers.${attrName}.buffer`),
            offset: (ctx, props) => props.buffers[attrName].offset + props.buffers[attrName].stride * ((props.orientation === ORIENTATION$1.CAP_START || !props.splitCaps ? 0 : 3) + index),
            stride: (ctx, props) => props.buffers[attrName].stride * instanceStride * (props.splitCaps ? 2 : 1),
            divisor: (ctx, props) => props.buffers[attrName].divisor
          };
        } else {
          attrSpecs[attrOutName] = {
            buffer: regl.prop(`buffers.${attrName}.buffer`),
            offset: (ctx, props) => props.buffers[attrName].offset + props.buffers[attrName].stride * index,
            stride: (ctx, props) => props.buffers[attrName].stride,
            divisor: (ctx, props) => props.buffers[attrName].divisor
          };
        }
      }

      if (usage & ATTR_USAGE.PER_INSTANCE) {
        emitAttr(0, '');
      }

      if (usage & ATTR_USAGE.REGULAR || usage & ATTR_USAGE.EXTENDED) {
        for (let i = 0; i < suffixes.length; i++) {
          const suffix = suffixes[i];
          if (!(usage & ATTR_USAGE.EXTENDED) && (suffix === 'D' || suffix === 'A')) continue;
          emitAttr(i, suffix);
        }
      }

      attrLines.push(`attribute ${GLSL_TYPES[attr.dimension]} ${attrList.join(', ')};`);
    });
    meta.varyings.forEach((varying, varyingName) => {
      attrLines.push(`varying ${varying.returnType} ${varyingName};`);
    });
    return {
      glsl: attrLines.join('\n'),
      attrs: attrSpecs
    };
  }

  var sanitizeInList = function sanitizeInclusionInList(value, dflt, list, label) {
    if (!value) return dflt;

    if (list.indexOf(value) === -1) {
      throw new Error(`Invalid ${label} type. Options are ${JSON.stringify(list).join(', ')}.`);
    }

    return value;
  };

  const createDrawMiterSegmentCommand = drawMiterSegment;
  const createDrawMiterCapCommand = drawMiterCap;
  const createDrawRoundedSegmentCommand = drawRoundedSegment;
  const createDrawRoundedCapCommand = drawRoundedCap;
  const parseShaderPragmas = parsePragmas;
  const sanitizeBufferInputs = sanitizeBuffer;
  const createAttrSpec = createAttrSpec$1;
  const sanitizeInclusionInList = sanitizeInList;
  const ORIENTATION = require$$8;
  var src = reglLines;
  reglLines.CAP_START = ORIENTATION.CAP_START;
  reglLines.CAP_END = ORIENTATION.CAP_END;
  const FORBIDDEN_PROPS = new Set(['count', 'instances', 'attributes', 'elements']);

  function reglLines(regl, opts = {}) {
    const {
      vert = null,
      frag = null,
      debug = false
    } = opts; // Forward all regl parameters except for vert and frag along to regl. Additionally,
    // extract uniform separately so that we can merge them with the resolution uniform

    const forwardedOpts = { ...opts
    };

    for (const prop of ['vert', 'frag', 'debug']) delete forwardedOpts[prop];

    const forwarded = Object.keys(forwardedOpts);
    const canReorder = forwarded.length === 0;
    forwarded.forEach(fwd => {
      if (FORBIDDEN_PROPS.has(fwd)) {
        throw new Error(`Invalid parameter '${fwd}'. Parameters ${[...FORBIDDEN_PROPS].map(p => `'${p}'`).join(', ')} may not be forwarded to regl.`);
      }
    });
    if (!vert) throw new Error('Missing vertex shader, `vert`');
    if (!frag) throw new Error('Missing fragment shader, `frag`');
    const meta = parseShaderPragmas(vert);
    const segmentSpec = createAttrSpec(meta, regl, false);
    const endpointSpec = createAttrSpec(meta, regl, true);
    const setResolution = regl({
      uniforms: {
        resolution: ctx => [ctx.viewportWidth, ctx.viewportHeight]
      }
    });
    const userConfig = canReorder ? (props, cb) => cb() : regl(forwardedOpts); // Round geometry is used for both joins and end caps. We use an integer
    // and divide by the resolution in the shader so that we can allocate a
    // single, fixed buffer and the resolution is entirely a render-time decision.
    //
    // The max value is chosen for aesthetic reasons, but also because there seems to be
    // a loss of precision or something above 30 at which it starts to get the indices
    // wrong.

    const MAX_ROUND_JOIN_RESOLUTION = 20;
    let indexBuffer, indexPrimitive;
    const indexAttributes = {};

    if (debug) {
      // TODO: Allocate/grow lazily to avoid an arbitrary limit
      const MAX_DEBUG_VERTICES = 16384;
      indexAttributes.debugInstanceID = {
        buffer: regl.buffer(new Uint16Array([...Array(MAX_DEBUG_VERTICES).keys()])),
        divisor: 1
      };
    }

    indexPrimitive = 'triangle strip';
    indexBuffer = regl.buffer(new Int8Array([...Array(MAX_ROUND_JOIN_RESOLUTION * 6 + 4).keys()]));
    indexAttributes.index = {
      buffer: indexBuffer,
      divisor: 0
    }; // Instantiate commands

    const config = {
      regl,
      meta,
      segmentSpec,
      endpointSpec,
      frag,
      indexBuffer,
      indexPrimitive,
      indexAttributes,
      debug
    };
    const drawMiterSegment = createDrawMiterSegmentCommand(config);
    const drawMiterCap = createDrawMiterCapCommand(config);
    const drawRoundedSegment = createDrawRoundedSegmentCommand(config);
    const drawRoundedCap = createDrawRoundedCapCommand(config);
    const VALID_JOIN_TYPES = ['round', 'bevel', 'miter'];
    const VALID_CAP_TYPES = ['round', 'square', 'none'];
    const ROUND_CAP_SCALE = [1, 1];
    const SQUARE_CAP_SCALE = [2 / Math.sqrt(3), 2];
    return function drawLines(props) {
      if (!props) return;
      const isArrayProps = Array.isArray(props);
      if (!isArrayProps) props = [props];
      const reorder = canReorder && !isArrayProps;
      const allRoundedSegments = [];
      const allRoundedCaps = [];
      const allMiterSegments = [];
      const allMiterCaps = [];

      function flush(props) {
        userConfig(props, () => {
          if (allRoundedSegments.length) drawRoundedSegment(allRoundedSegments);
          if (allMiterSegments.length) drawMiterSegment(allMiterSegments);
          if (allRoundedCaps.length) drawRoundedCap(allRoundedCaps);
          if (allMiterCaps.length) drawMiterCap(allMiterCaps);
          allRoundedSegments.length = 0;
          allMiterSegments.length = 0;
          allRoundedCaps.length = 0;
          allMiterCaps.length = 0;
        });
      }

      setResolution(() => {
        for (const lineProps of props) {
          const vertexAttributes = sanitizeBufferInputs(meta, lineProps.vertexAttributes, false);
          const endpointAttributes = sanitizeBufferInputs(meta, lineProps.endpointAttributes, true);
          const joinType = sanitizeInclusionInList(lineProps.join, 'miter', VALID_JOIN_TYPES, 'join');
          const capType = sanitizeInclusionInList(lineProps.cap, 'square', VALID_CAP_TYPES, 'cap');
          const joinResolution = lineProps.joinResolution === undefined ? 8 : lineProps.joinResolution;
          let capResolution = lineProps.capResolution === undefined ? 12 : lineProps.capResolution * 2;

          if (capType === 'square') {
            capResolution = 3;
          } else if (capType === 'none') {
            capResolution = 1;
          }

          const miterLimit = joinType === 'bevel' ? 1 : lineProps.miterLimit === undefined ? 4 : lineProps.miterLimit;
          const capScale = capType === 'square' ? SQUARE_CAP_SCALE : ROUND_CAP_SCALE;
          let endpointProps, segmentProps;

          if (lineProps.endpointAttributes) {
            endpointProps = {
              buffers: endpointAttributes,
              count: lineProps.endpointCount,
              joinResolution,
              capResolution,
              capScale,
              miterLimit
            };
          }

          if (lineProps.vertexAttributes) {
            segmentProps = {
              buffers: vertexAttributes,
              count: lineProps.vertexCount,
              joinResolution,
              capResolution,
              miterLimit
            };
          }

          if (segmentProps) {
            const segmentDst = joinType === 'round' ? allRoundedSegments : allMiterSegments;
            segmentDst.push(segmentProps);
          }

          if (endpointProps) {
            const endpointDst = joinType === 'round' ? allRoundedCaps : allMiterCaps;

            if (meta.orientation) {
              endpointDst.push({ ...endpointProps,
                splitCaps: false
              });
            } else {
              endpointDst.push({ ...endpointProps,
                orientation: ORIENTATION.CAP_START,
                splitCaps: true
              }, { ...endpointProps,
                orientation: ORIENTATION.CAP_END,
                splitCaps: true
              });
            }
          }

          if (!reorder) flush(lineProps);
        }

        if (reorder) flush(props);
      });
    };
  }

  return src;

}));
